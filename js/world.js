// 사냥터: 지형, 하늘, 조명, 풀, 바위, 나무, 대기 입자
import * as THREE from 'three';
import { ARENA_R } from './config.js';
import { fbm2, noise2, noise3, smooth, mulberry32, makeSurfaceTextures, makeDotTexture, clamp } from './util.js';

export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  let h = (fbm2(x * 0.035 + 10, z * 0.035 + 10, 3) - 0.5) * 1.5;
  h += smooth(ARENA_R - 4, ARENA_R + 6, d) * 1.6;
  h += smooth(ARENA_R + 2, ARENA_R + 48, d) * (8 + fbm2(x * 0.022 + 3, z * 0.022 + 7, 4) * 46);
  return h;
}

const SUN_DIR = new THREE.Vector3(-0.58, 0.40, -0.71).normalize();

export function createWorld(scene, quality) {
  const rnd = mulberry32(20261111);
  const world = { heightAt, sunDir: SUN_DIR, uniforms: { uTime: { value: 0 } } };

  // ── 조명 ─────────────────────────────────────────────
  const fogCol = new THREE.Color(0.62, 0.42, 0.31);
  scene.fog = new THREE.FogExp2(fogCol, 0.0040);
  const hemi = new THREE.HemisphereLight(0x8fb4ff, 0x6b4a2a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc890, 3.6);
  sun.position.copy(SUN_DIR).multiplyScalar(80);
  sun.castShadow = quality.shadow > 0;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(quality.shadow, quality.shadow);
    const c = sun.shadow.camera;
    c.left = -34; c.right = 34; c.top = 34; c.bottom = -34; c.near = 1; c.far = 220;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
  }
  scene.add(sun, sun.target);
  world.sun = sun;

  // ── 하늘 ─────────────────────────────────────────────
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIR }, uTime: world.uniforms.uTime },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 sunDir; uniform float uTime;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=noise(p)*a; p=p*2.03+7.1; a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 zen = vec3(0.07,0.17,0.42), mid = vec3(0.42,0.44,0.62), hor = vec3(1.05,0.60,0.33);
        vec3 col = mix(hor, mid, smoothstep(0.0,0.28,h));
        col = mix(col, zen, smoothstep(0.18,0.85,h));
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0,0.50,0.20) * pow(s, 6.0) * 0.32;
        col += vec3(1.0,0.72,0.40) * pow(s, 60.0) * 0.55;
        col += vec3(1.0,0.85,0.62) * smoothstep(0.9993,0.9997,s) * 7.0;
        vec2 uv = d.xz / (d.y + 0.18) * 0.55 + vec2(uTime*0.006, uTime*0.002);
        float c = fbm(uv*1.4);
        float c2 = fbm(uv*3.1 + 4.0);
        float cov = smoothstep(0.42,0.78,c + c2*0.25) * smoothstep(0.02,0.22,d.y);
        vec3 lit = mix(vec3(0.46,0.30,0.36), vec3(1.25,0.80,0.52), clamp(pow(s,1.5)*0.9 + (c2-0.4)*0.9, 0.0, 1.0));
        col = mix(col, lit, cov*0.9);
        col = mix(col, vec3(0.62,0.42,0.31), smoothstep(0.07,-0.03,d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  // ── 지형 ─────────────────────────────────────────────
  const SEG = quality.terrainSeg, SIZE = 380;
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, heightAt(tp.getX(i), tp.getZ(i)));
  tg.computeVertexNormals();
  const tn = tg.attributes.normal, colors = new Float32Array(tp.count * 3);
  const cG1 = new THREE.Color(0.20, 0.27, 0.085), cG2 = new THREE.Color(0.40, 0.36, 0.12), cDirt = new THREE.Color(0.33, 0.235, 0.15),
    cRock = new THREE.Color(0.34, 0.29, 0.25), cRock2 = new THREE.Color(0.50, 0.41, 0.33), tmp = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), ny = tn.getY(i);
    const n = fbm2(x * 0.06, z * 0.06, 3), n2 = fbm2(x * 0.19 + 40, z * 0.19, 2);
    tmp.copy(cG1).lerp(cG2, smooth(0.35, 0.7, n));
    tmp.lerp(cDirt, smooth(0.58, 0.72, n2));
    const rock = smooth(0.90, 0.70, ny);
    tmp.lerp(cRock.clone().lerp(cRock2, n2), rock);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const gt = makeSurfaceTextures(256, { base: 8, oct: 5, strength: 2.4, lo: 0.7, hi: 1.08 });
  gt.map.repeat.set(70, 70); gt.normalMap.repeat.set(70, 70);
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, map: gt.map, normalMap: gt.normalMap, roughness: 0.96, metalness: 0 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ── 바위 ─────────────────────────────────────────────
  const rt = makeSurfaceTextures(256, { base: 6, oct: 5, ridge: true, strength: 4.5, lo: 0.55, hi: 1.05 });
  world.rockTex = rt;
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a7868, map: rt.map, normalMap: rt.normalMap, roughness: 0.9 });
  rockMat.normalScale.set(1.6, 1.6);
  const rockGeos = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.IcosahedronGeometry(1, quality.rockDetail);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = noise3(v.x * 1.3 + k * 9, v.y * 1.3, v.z * 1.3) * 0.55 + noise3(v.x * 3.1, v.y * 3.1 + k * 5, v.z * 3.1) * 0.18;
      const s = 0.62 + n;
      v.multiplyScalar(s); v.y = Math.max(v.y, -0.55);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    rockGeos.push(g);
  }
  const rocks = new THREE.Group();
  const nRocks = 54;
  for (let i = 0; i < nRocks; i++) {
    const a = (i / nRocks) * Math.PI * 2 + rnd() * 0.09, d = ARENA_R + 3 + rnd() * 20;
    const big = rnd() < 0.3;
    const m = new THREE.Mesh(rockGeos[i % 4], rockMat);
    const s = big ? 5 + rnd() * 6 : 1.6 + rnd() * 3;
    m.scale.set(s * (0.8 + rnd() * 0.5), s * (big ? 1.3 + rnd() * 1.4 : 0.7 + rnd() * 0.5), s * (0.8 + rnd() * 0.5));
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    m.position.set(x, heightAt(x, z) - s * 0.15, z);
    m.rotation.set(rnd() * 0.3, rnd() * 6.28, rnd() * 0.3);
    m.castShadow = m.receiveShadow = true;
    rocks.add(m);
  }
  // 사냥터 안쪽의 작은 돌(장식)
  for (let i = 0; i < 26; i++) {
    const a = rnd() * 6.28, d = 8 + rnd() * (ARENA_R - 10);
    const m = new THREE.Mesh(rockGeos[i % 4], rockMat);
    const s = 0.18 + rnd() * 0.3;
    m.scale.set(s * 1.3, s * 0.7, s);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    m.position.set(x, heightAt(x, z) + s * 0.1, z); m.rotation.y = rnd() * 6.28;
    m.castShadow = m.receiveShadow = true;
    rocks.add(m);
  }
  scene.add(rocks);

  // ── 침엽수 ───────────────────────────────────────────
  const nTrees = quality.trees;
  if (nTrees > 0) {
    const trunkG = new THREE.CylinderGeometry(0.16, 0.34, 1, 6); trunkG.translate(0, 0.5, 0);
    const coneG = new THREE.ConeGeometry(1, 1, 7); coneG.translate(0, 0.5, 0);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1 }), nTrees);
    const leaves = new THREE.InstancedMesh(coneG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), nTrees * 3);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), col = new THREE.Color();
    let placed = 0, guard = 0;
    while (placed < nTrees && guard++ < 5000) {
      const a = rnd() * 6.28, d = ARENA_R + 12 + rnd() * 90;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const y = heightAt(x, z);
      if (Math.abs(heightAt(x + 1.5, z) - y) > 1.6 || Math.abs(heightAt(x, z + 1.5) - y) > 1.6) continue;
      const hgt = 7 + rnd() * 8;
      Q.setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0));
      M.compose(P.set(x, y - 0.3, z), Q, S.set(1, hgt * 0.5, 1)); trunks.setMatrixAt(placed, M);
      for (let k = 0; k < 3; k++) {
        const w = hgt * (0.30 - k * 0.07);
        M.compose(P.set(x, y + hgt * (0.22 + k * 0.24), z), Q, S.set(w, hgt * 0.42, w));
        leaves.setMatrixAt(placed * 3 + k, M);
        col.setRGB(0.10 + rnd() * 0.05, 0.19 + rnd() * 0.07 + k * 0.015, 0.09);
        leaves.setColorAt(placed * 3 + k, col);
      }
      placed++;
    }
    trunks.count = placed; leaves.count = placed * 3;
    trunks.castShadow = leaves.castShadow = false;
    scene.add(trunks, leaves);
  }

  // ── 풀 ───────────────────────────────────────────────
  const nGrass = quality.grass;
  if (nGrass > 0) {
    const bg = new THREE.PlaneGeometry(0.065, 1, 1, 3); bg.translate(0, 0.5, 0);
    const bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++) { const y = bp.getY(i); bp.setX(i, bp.getX(i) * (1 - y * 0.85)); }
    const gm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
    gm.onBeforeCompile = sh => {
      sh.uniforms.uTime = world.uniforms.uTime;
      sh.uniforms.uPush = world.uniforms.uPush = { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] };
      sh.vertexShader = 'uniform float uTime; uniform vec4 uPush[2]; varying float vH;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `
          vec3 transformed = vec3(position);
          vec4 wp0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vH = uv.y; float h2 = uv.y * uv.y;
          float gust = sin(uTime*1.6 + wp0.x*0.21 + wp0.z*0.17) * 0.6 + sin(uTime*3.3 + wp0.x*0.8 - wp0.z*0.5) * 0.22 + 0.35;
          vec3 off = vec3(gust*0.34, 0.0, gust*0.16 + cos(uTime*1.1 + wp0.z*0.3)*0.1);
          for (int k=0;k<2;k++){ vec2 dd = wp0.xz - uPush[k].xy; float l = length(dd); float f = smoothstep(uPush[k].z, 0.0, l) * uPush[k].w; off.xz += normalize(dd + 0.0001) * f; off.y -= f*0.45; }
          transformed += (inverse(mat3(instanceMatrix)) * off) * h2;`);
      sh.fragmentShader = 'varying float vH;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.28, 1.12, vH);');
    };
    const grass = new THREE.InstancedMesh(bg, gm, nGrass);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler(), col = new THREE.Color();
    let n = 0, guard = 0;
    const GR = ARENA_R + 16;
    while (n < nGrass && guard++ < nGrass * 4) {
      const a = rnd() * 6.28, d = Math.sqrt(rnd()) * GR;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const dirt = fbm2(x * 0.19 + 40, z * 0.19, 2);
      if (dirt > 0.6 + rnd() * 0.12) continue;
      const patch = fbm2(x * 0.06, z * 0.06, 3);
      const tall = 0.28 + rnd() * 0.32 + smooth(0.45, 0.8, noise2(x * 0.12, z * 0.12)) * 0.5;
      E.set((rnd() - 0.5) * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.4); Q.setFromEuler(E);
      M.compose(P.set(x, heightAt(x, z) - 0.03, z), Q, S.set(0.8 + rnd() * 0.7, tall, 1));
      grass.setMatrixAt(n, M);
      const g = smooth(0.35, 0.7, patch);
      col.setRGB(0.22 + g * 0.30 + rnd() * 0.06, 0.38 + g * 0.08 + rnd() * 0.08, 0.09 + rnd() * 0.04);
      grass.setColorAt(n, col);
      n++;
    }
    grass.count = n; grass.receiveShadow = true; grass.frustumCulled = false;
    scene.add(grass);
  }

  // ── 대기 입자(빛 먼지) ───────────────────────────────
  const nMotes = quality.motes;
  const mp = new Float32Array(nMotes * 3), ms = new Float32Array(nMotes);
  for (let i = 0; i < nMotes; i++) { mp[i * 3] = (rnd() - 0.5) * 90; mp[i * 3 + 1] = 0.3 + rnd() * 11; mp[i * 3 + 2] = (rnd() - 0.5) * 90; ms[i] = rnd(); }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 1));
  const motes = new THREE.Points(mg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: world.uniforms.uTime, uTex: { value: makeDotTexture(32) }, uCenter: { value: new THREE.Vector3() } },
    vertexShader: `attribute float aSeed; uniform float uTime; uniform vec3 uCenter; varying float vA;
      void main(){ vec3 p = position; p.x += sin(uTime*0.3 + aSeed*40.0)*1.5 + uTime*0.5; p.y += sin(uTime*0.5 + aSeed*17.0)*0.6; p.z += cos(uTime*0.27 + aSeed*23.0)*1.5;
        p.xz = mod(p.xz - uCenter.xz + 45.0, 90.0) - 45.0 + uCenter.xz;
        vec4 mv = modelViewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.0 + aSeed*2.2) * (38.0 / -mv.z); vA = 0.25 + 0.75*abs(sin(uTime*0.8 + aSeed*30.0)); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA; void main(){ float a = texture2D(uTex, gl_PointCoord).a; gl_FragColor = vec4(vec3(1.6,1.05,0.6)*a*vA*0.5, 1.0); }`,
  }));
  motes.frustumCulled = false;
  scene.add(motes);

  const _mid = new THREE.Vector3();
  world.update = (dt, camera, focus) => {
    world.uniforms.uTime.value += dt;
    sky.position.copy(camera.position); sky.scale.setScalar(camera.far * 0.9);
    motes.material.uniforms.uCenter.value.copy(camera.position);
    if (focus && sun.castShadow) {
      _mid.copy(focus);
      sun.target.position.copy(_mid);
      sun.position.copy(_mid).addScaledVector(SUN_DIR, 90);
    }
  };
  world.setPush = (i, x, z, r, s) => { if (world.uniforms.uPush) world.uniforms.uPush.value[i].set(x, z, r, s); };
  world.clampToArena = (p, margin = 1.5) => {
    const d = Math.hypot(p.x, p.z), max = ARENA_R - margin;
    if (d > max) { p.x *= max / d; p.z *= max / d; return true; }
    return false;
  };
  return world;
}
