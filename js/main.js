// 진입점: 렌더러, 후처리, 카메라, 게임 흐름
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWorld } from './world.js';
import { FX } from './fx.js';
import { GameAudio } from './audio.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Monster } from './monster.js';
import { UI } from './ui.js';
import { clamp, lerp, damp, angDiff } from './util.js';

const QUALITY = {
  high: { shadow: 2048, grass: 130000, terrainSeg: 220, rockDetail: 3, trees: 240, motes: 500, msaa: 4, pr: 2, bloom: true },
  mid: { shadow: 1024, grass: 60000, terrainSeg: 160, rockDetail: 2, trees: 150, motes: 300, msaa: 2, pr: 1.5, bloom: true },
  low: { shadow: 512, grass: 20000, terrainSeg: 110, rockDetail: 2, trees: 70, motes: 150, msaa: 0, pr: 1, bloom: true },
};
const params = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const touch = matchMedia('(pointer: coarse)').matches;
let qName = params.get('q') || localStorage.getItem('emberhide.q') || (touch ? 'mid' : 'high');
if (!QUALITY[qName]) qName = 'high';
const Q = QUALITY[qName];
for (const b of document.querySelectorAll('.q')) {
  b.classList.toggle('on', b.dataset.q === qName);
  b.onclick = () => { localStorage.setItem('emberhide.q', b.dataset.q); location.reload(); };
}

// ── 렌더러 ───────────────────────────────────────────────
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
renderer.shadowMap.enabled = Q.shadow > 0; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.15, 900);

const world = createWorld(scene, Q);
{ // 하늘을 환경 조명으로
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  const sk = scene.children.find(o => o.isMesh && o.material.isShaderMaterial && o.geometry.type === 'SphereGeometry');
  const m = new THREE.Mesh(sk.geometry, sk.material); m.scale.setScalar(50); es.add(m);
  scene.environment = pm.fromScene(es, 0.02, 0.1, 100).texture; scene.environmentIntensity = 0.55; pm.dispose();
}

const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Q.msaa });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.6, 1.0);
if (Q.bloom) composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uHurt: { value: 0 }, uFlash: { value: 0 }, uSat: { value: 1.08 }, uLow: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uHurt, uFlash, uSat, uLow; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 p = vUv - 0.5; float r = length(p);
      float l = dot(c.rgb, vec3(0.2126,0.7152,0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat - uLow*0.5);
      c.rgb *= mix(vec3(0.94,0.97,1.08), vec3(1.06,1.0,0.94), smoothstep(0.0,0.8,l));
      c.rgb *= 1.0 - smoothstep(0.35,0.95,r) * 0.5;
      c.rgb = mix(c.rgb, vec3(0.9,0.05,0.02) * (l+0.25), smoothstep(0.25,0.8,r) * clamp(uHurt*0.8 + uLow*0.3, 0.0, 1.0));
      c.rgb += uFlash * vec3(0.8,0.95,1.0);
      gl_FragColor = c; }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ── 게임 객체 ────────────────────────────────────────────
const audio = new GameAudio();
const input = new Input(canvas);
const fx = new FX(scene, camera, world, $('nums'));
const ui = new UI();
const player = new Player(scene, world, fx, audio, input);
const monster = new Monster(scene, world, fx, audio);

let state = 'title', stateT = 0, paused = false, hadLock = false;
const cam = { yaw: 0, pitch: 0.2, dist: 6.6, target: new THREE.Vector3(0, 1.5, 22), fov: 58 };
const _v = new THREE.Vector3(), _f = new THREE.Vector3();

player.onHit = res => {
  ui.hitPulse();
  if (res.broke) ui.note(res.broke, 'ember');
  if (res.killed) { ui.note('토벌 완료', 'ember'); state = 'won'; stateT = 0; }
};
player.onEvent = e => {
  if (e === 'counter') ui.note('흘려베기', 'blade');
  else if (e === 'ult') ui.note('오의', 'blade');
  else if (e === 'dead') { state = 'down'; stateT = 0; player.lives--; }
};

function start() {
  audio.init(); audio.play('ui');
  fx.reset(); player.reset(true); monster.reset();
  cam.yaw = 0; cam.pitch = 0.2; cam.target.set(0, 1.5, 22);
  $('title').classList.add('hidden'); $('result').classList.add('hidden');
  ui.show(true); input.enabled = true; state = 'play'; stateT = 0; wasRage = false;
  if (!touch) canvas.requestPointerLock?.();
  setTimeout(() => $('help').classList.add('fadeout'), 14000);
}
$('startBtn').onclick = start; $('againBtn').onclick = start;
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { hadLock = true; paused = false; $('pause').classList.add('hidden'); }
  else if (hadLock && (state === 'play' || state === 'down')) { paused = true; $('pause').classList.remove('hidden'); }
});
$('pause').onclick = () => canvas.requestPointerLock?.();

let wasRage = false;
function updateCamera(rdt) {
  if (state === 'title') {
    const t = performance.now() * 0.00008;
    _f.copy(monster.bodyPos); _f.y += 0.6;
    camera.position.set(_f.x + Math.sin(t) * 13 + 3.5, _f.y - 0.6 + Math.sin(t * 2) * 0.5, _f.z + Math.cos(t) * 13 + 4);
    const gy = world.heightAt(camera.position.x, camera.position.z) + 0.9; if (camera.position.y < gy) camera.position.y = gy;
    _f.x += 3.2; camera.lookAt(_f); return;
  }
  const [lx, ly] = input.consumeLook();
  cam.yaw -= lx * 0.0026; cam.pitch = clamp(cam.pitch + ly * 0.0022, -0.28, 1.15);
  let dist = 6.6;
  _v.copy(player.pos); _v.y += 1.55;
  const locked = player.lockOn && !monster.dead;
  if (locked) {
    monster.focusPoint(_f);
    const want = Math.atan2(player.pos.x - _f.x, player.pos.z - _f.z);
    cam.yaw += angDiff(cam.yaw, want) * (1 - Math.exp(-4.5 * rdt));
    const d = Math.hypot(player.pos.x - _f.x, player.pos.z - _f.z);
    dist = 7 + clamp(d * 0.14, 0, 3.5);
    _v.lerp(_f, clamp(0.28 - d * 0.004, 0.12, 0.28)); _v.y = Math.max(_v.y, player.pos.y + 1.6);
  }
  cam.target.lerp(_v, 1 - Math.exp(-12 * rdt));
  cam.dist = damp(cam.dist, dist, 4, rdt);
  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.target.x + Math.sin(cam.yaw) * cp * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * cp * cam.dist);
  const gy = world.heightAt(camera.position.x, camera.position.z) + 0.5; if (camera.position.y < gy) camera.position.y = gy;
  camera.lookAt(cam.target);
  if (fx.shake > 0) { const s = fx.shake * fx.shake * 0.5; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.rotation.z += (Math.random() - 0.5) * s * 0.05; }
  const fov = 58 + fx.fovKick * 5 + (input.held.sprint && player.state === 'move' ? 3 : 0);
  cam.fov = damp(cam.fov, fov, 8, rdt); if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  if (locked) { monster.focusPoint(_f).project(camera); ui.setLock((_f.x * 0.5 + 0.5) * innerWidth, (-_f.y * 0.5 + 0.5) * innerHeight, _f.z < 1); } else ui.setLock(0, 0, false);
}

let lastT = performance.now();
let hurtFx = 0;
// 게임 로직 한 틱 (렌더링과 분리)
function tick(rdt) {
  const dt = rdt * fx.timeScale(rdt);
  input.update(rdt);
  if (input.take('mute')) audio.setMuted(!audio.muted);
  stateT += rdt;

  if (state === 'title') { monster.update(dt, player); }
  else {
    player.update(dt, cam.yaw, monster);
    monster.update(dt, player);
    if (monster.enraged && !wasRage) ui.note('분노', 'ember'); wasRage = monster.enraged;
    if (state === 'down' && stateT > 2.8) {
      if (player.lives > 0) {
        const a = Math.atan2(monster.pos.x, monster.pos.z) + Math.PI;
        const st = player.stats, g = player.gauge, po = player.potions, lv = player.lives;
        player.reset(false); player.stats = st; player.gauge = g; player.potions = po; player.lives = lv;
        player.pos.set(Math.sin(a) * 38, 0, Math.cos(a) * 38); player.yaw = a + Math.PI; player.invuln = 2.5;
        cam.yaw = a; state = 'play';
      } else { state = 'over'; input.enabled = false; input.releasePointer(); ui.result(false, player, monster); }
    }
    if (state === 'won' && stateT > 5.5) { state = 'over'; input.enabled = false; input.releasePointer(); ui.result(true, player, monster); }
    ui.update(rdt, player, monster);
  }

  updateCamera(rdt);
  _v.copy(state === 'title' ? monster.pos : player.pos).lerp(monster.pos, state === 'title' ? 0 : 0.35);
  world.setPush(1, monster.pos.x, monster.pos.z, 4.5, 0.8);
  world.update(dt, camera, _v);
  fx.update(dt, rdt);

  if (fx.hurt > 0) { hurtFx = 1; fx.hurt = 0; }
  hurtFx = Math.max(0, hurtFx - rdt * 1.6);
  grade.uniforms.uHurt.value = hurtFx; grade.uniforms.uFlash.value = fx.flash;
  grade.uniforms.uLow.value = state !== 'title' && player.hp < 30 ? (0.5 + 0.5 * Math.sin(performance.now() * 0.006)) * (1 - player.hp / 30) : 0;
  bloom.strength = 0.38 + (monster.enraged ? 0.12 : 0);
}
let manual = false;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(), rdt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (!paused && !manual) tick(rdt);
  composer.render();
}

// 디버그/자동 시작 훅
window.__g = { player, monster, fx, cam, input, world, camera, get state() { return state; }, start, tick, setManual(v) { manual = v; } };
if (params.get('auto')) start();
requestAnimationFrame(() => { $('fade').classList.add('clear'); frame(); });
