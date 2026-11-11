// 이펙트: 입자, 검 궤적, 바닥 예고 표시, 충격파, 불기둥, 대미지 숫자, 화면 흔들림
import * as THREE from 'three';
import { makeDotTexture, clamp } from './util.js';

class Particles {
  constructor(scene, max, additive, tex) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max).fill(1);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.base = new Float32Array(max * 5);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTex: { value: tex }, uScale: { value: 600 } },
      vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vCol;
        void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(0.1, -mv.z); }`,
      fragmentShader: additive
        ? `uniform sampler2D uTex; varying vec4 vCol; void main(){ float a = texture2D(uTex, gl_PointCoord).a; gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0); }`
        : `uniform sampler2D uTex; varying vec4 vCol; void main(){ float a = texture2D(uTex, gl_PointCoord).a; gl_FragColor = vec4(vCol.rgb, a * vCol.a); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 6 : 5;
    scene.add(this.points);
  }
  emit(p, vx, vy, vz, life, size, r, g, b, a = 1, grav = 0, drag = 0, grow = 0) {
    const i = this.i; this.i = (i + 1) % this.max;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life; this.grav[i] = grav; this.drag[i] = drag;
    const b5 = i * 5; this.base[b5] = r; this.base[b5 + 1] = g; this.base[b5 + 2] = b; this.base[b5 + 3] = a; this.base[b5 + 4] = grow;
    this.size[i] = size; this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
  }
  update(dt) {
    const { pos, vel, life, maxLife, col, size, grav, drag, base } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { col[i * 4 + 3] = 0; size[i] = 0; continue; }
      const k = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - grav[i] * dt; vel[i * 3 + 2] *= k;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const t = life[i] / maxLife[i];
      col[i * 4 + 3] = base[i * 5 + 3] * Math.min(1, t * 2.2);
      size[i] += base[i * 5 + 4] * dt;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aCol.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true;
  }
}

// 검 궤적 리본
export class BladeTrail {
  constructor(scene, n = 22) {
    this.n = n; this.count = 0;
    this.pos = new Float32Array(n * 2 * 3); this.alpha = new Float32Array(n * 2);
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1));
    g.setIndex(idx);
    this.color = new THREE.Color(1, 1, 1);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uCol: { value: this.color } },
      vertexShader: `attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ float a = vA * vA * vA * vA; gl_FragColor = vec4(uCol * (a * 1.1 + vA * 0.05), 1.0); }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 7;
    scene.add(this.mesh);
    this.hist = [];
  }
  push(base, tip, strength) { this.hist.unshift({ b: base.clone(), t: tip.clone(), s: strength, age: 0 }); if (this.hist.length > this.n) this.hist.pop(); }
  update(dt) {
    const h = this.hist;
    for (const e of h) e.age += dt;
    while (h.length && h[h.length - 1].age > 0.22) h.pop();
    for (let i = 0; i < this.n; i++) {
      const e = h[Math.min(i, h.length - 1)];
      if (!e) { this.alpha[i * 2] = this.alpha[i * 2 + 1] = 0; continue; }
      const a = i < h.length ? e.s * Math.max(0, 1 - e.age / 0.22) : 0;
      this.pos.set([e.b.x, e.b.y, e.b.z, e.t.x, e.t.y, e.t.z], i * 6);
      this.alpha[i * 2] = 0; this.alpha[i * 2 + 1] = a;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aA.needsUpdate = true;
  }
  clear() { this.hist.length = 0; }
}

export class FX {
  constructor(scene, camera, world, numLayer) {
    this.scene = scene; this.camera = camera; this.world = world; this.layer = numLayer;
    this.sparks = new Particles(scene, 1400, true, makeDotTexture(32));
    this.smoke = new Particles(scene, 500, false, makeDotTexture(64));
    this.shake = 0; this.hitStop = 0; this.slow = 0; this.slowScale = 1; this.flash = 0; this.fovKick = 0;

    // 바닥 예고 원
    this.tele = [];
    const tg = new THREE.CircleGeometry(1, 48); tg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(tg, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        uniforms: { uP: { value: 0 }, uA: { value: 1 } },
        vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec2 vP; uniform float uP, uA; void main(){ float r = length(vP);
          float edge = smoothstep(0.90,0.97,r) * smoothstep(1.0,0.985,r);
          float fill = smoothstep(uP, uP-0.04, r) * 0.22 + 0.04;
          float pulse = smoothstep(0.05,0.0,abs(r-uP)) * 0.8;
          gl_FragColor = vec4(vec3(1.5,0.24,0.05) * (edge*1.1 + fill*0.8 + pulse*0.7) * uA, 1.0); }`,
      }));
      m.visible = false; m.renderOrder = 3; scene.add(m);
      this.tele.push({ m, t: 0, dur: 1, cb: null });
    }
    // 충격파 링
    this.rings = [];
    const rg = new THREE.RingGeometry(0.86, 1, 64); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.visible = false; m.renderOrder = 4; scene.add(m);
      this.rings.push({ m, t: 0, dur: 1, r: 1 });
    }
    // 불기둥
    this.cols = [];
    const cg = new THREE.CylinderGeometry(0.75, 1, 1, 20, 1, true); cg.translate(0, 0.5, 0);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(cg, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
        uniforms: { uA: { value: 1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform float uA; void main(){ float f = pow(1.0 - vUv.y, 2.2); float st = 0.45 + 0.55 * abs(sin(vUv.x * 44.0 + vUv.y * 9.0)); gl_FragColor = vec4(vec3(2.2,0.62,0.10) * f * st * uA, 1.0); }`,
      }));
      m.visible = false; scene.add(m);
      this.cols.push({ m, t: 0, dur: 0.42 });
    }
    // 참격 섬광
    this.slashes = [];
    const sg = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(sg, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false,
        uniforms: { uA: { value: 1 }, uCol: { value: new THREE.Color(1, 1, 1) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv - 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform float uA; uniform vec3 uCol; void main(){
          float l = smoothstep(0.5,0.0,abs(vUv.x)) ; float line = pow(l,1.5) * smoothstep(0.035,0.0,abs(vUv.y));
          float core = smoothstep(0.22,0.0,length(vUv*vec2(1.0,2.6)));
          gl_FragColor = vec4(uCol * (line*3.0 + core*1.1) * uA, 1.0); }`,
      }));
      m.visible = false; m.renderOrder = 9; scene.add(m);
      this.slashes.push({ m, t: 0, dur: 0.16, s: 1 });
    }
    this.light = new THREE.PointLight(0xffa050, 0, 22, 1.6); scene.add(this.light);
    this.lightT = 0;
    this.nums = []; this._v = new THREE.Vector3();
  }

  telegraph(x, z, r, dur, cb) {
    const t = this.tele.find(e => !e.m.visible); if (!t) { if (cb) setTimeout(cb, dur * 1000); return; }
    t.m.visible = true; t.m.position.set(x, this.world.heightAt(x, z) + 0.12, z); t.m.scale.set(r, 1, r);
    t.t = 0; t.dur = dur; t.cb = cb;
    return t;
  }
  ring(x, z, r, dur = 0.5, color = 0xffb070) {
    const e = this.rings.find(e => !e.m.visible); if (!e) return;
    e.m.visible = true; e.m.position.set(x, this.world.heightAt(x, z) + 0.2, z); e.m.material.color.set(color); e.t = 0; e.dur = dur; e.r = r;
  }
  column(x, z, r, h) {
    const e = this.cols.find(e => !e.m.visible); if (!e) return;
    e.m.visible = true; e.m.position.set(x, this.world.heightAt(x, z), z); e.m.scale.set(r, h, r); e.t = 0;
  }
  slashFlash(p, size, color, rot) {
    const e = this.slashes.find(e => !e.m.visible) || this.slashes[0];
    e.m.visible = true; e.m.position.copy(p); e.m.quaternion.copy(this.camera.quaternion); e.m.rotateZ(rot);
    e.m.material.uniforms.uCol.value.copy(color); e.t = 0; e.s = size;
  }
  flashLight(p, intensity, color = 0xffa050) { this.light.position.copy(p); this.light.color.set(color); this.light.intensity = intensity; this.lightT = 1; }

  hitSparks(p, n, power, dirx = 0, diry = 0, dirz = 0, col = [3.0, 1.5, 0.5]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, e = Math.random() * 1.2 - 0.3, s = power * (0.35 + Math.random());
      this.sparks.emit(p, Math.cos(a) * Math.cos(e) * s + dirx * power, Math.sin(e) * s + 2 + diry * power, Math.sin(a) * Math.cos(e) * s + dirz * power,
        0.25 + Math.random() * 0.5, 0.012 + Math.random() * 0.02, col[0], col[1] * (0.6 + Math.random() * 0.6), col[2], 1, 16, 1.2);
    }
  }
  embers(p, n, spread, up) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, d = Math.random() * spread;
      this._v.set(p.x + Math.cos(a) * d, p.y + Math.random() * 0.5, p.z + Math.sin(a) * d);
      this.sparks.emit(this._v, (Math.random() - 0.5) * 3, up * (0.5 + Math.random()), (Math.random() - 0.5) * 3, 0.6 + Math.random() * 1.0, 0.014 + Math.random() * 0.03, 3.2, 0.9 + Math.random() * 0.8, 0.2, 1, 5, 0.6);
    }
  }
  dust(p, n, spread, size = 0.5, tint = [0.62, 0.50, 0.38], up = 1.2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, d = Math.random() * spread, s = 1 + Math.random() * 2.5;
      this._v.set(p.x + Math.cos(a) * d, p.y + 0.15 + Math.random() * 0.3, p.z + Math.sin(a) * d);
      const k = 0.8 + Math.random() * 0.4;
      this.smoke.emit(this._v, Math.cos(a) * s, up * (0.4 + Math.random()), Math.sin(a) * s, 0.8 + Math.random() * 0.9, size * (0.6 + Math.random() * 0.8), tint[0] * k, tint[1] * k, tint[2] * k, 0.34, -0.3, 1.8, size * 1.4);
    }
  }
  number(worldPos, value, kind) {
    const el = document.createElement('div');
    el.className = 'dmg ' + (kind || '');
    el.textContent = value;
    this.layer.appendChild(el);
    this.nums.push({ el, p: worldPos.clone(), t: 0, ox: (Math.random() - 0.5) * 30 });
    if (this.nums.length > 28) { const o = this.nums.shift(); o.el.remove(); }
  }
  addShake(v) { this.shake = Math.min(1.6, this.shake + v); }
  stop(t) { this.hitStop = Math.max(this.hitStop, t); }
  slowmo(t, scale) { this.slow = t; this.slowScale = scale; }

  // 실제 시간(dt)을 받아 게임 시간 배율을 돌려줌
  timeScale(rdt) {
    if (this.hitStop > 0) { this.hitStop -= rdt; return 0.03; }
    if (this.slow > 0) { this.slow -= rdt; return this.slowScale; }
    return 1;
  }
  update(dt, rdt) {
    this.sparks.update(dt); this.smoke.update(dt);
    const sc = (this.layer.clientHeight || 800) * 1.1;
    this.sparks.mat.uniforms.uScale.value = sc; this.smoke.mat.uniforms.uScale.value = sc;
    for (const t of this.tele) if (t.m.visible) {
      t.t += dt; const p = clamp(t.t / t.dur, 0, 1);
      t.m.material.uniforms.uP.value = p; t.m.material.uniforms.uA.value = Math.min(1, t.t * 6);
      if (p >= 1) { t.m.visible = false; const cb = t.cb; t.cb = null; if (cb) cb(); }
    }
    for (const e of this.rings) if (e.m.visible) {
      e.t += dt; const p = e.t / e.dur;
      if (p >= 1) { e.m.visible = false; continue; }
      const s = e.r * (0.15 + 0.85 * (1 - Math.pow(1 - p, 3))); e.m.scale.set(s, 1, s); e.m.material.opacity = (1 - p) * 0.55;
    }
    for (const e of this.cols) if (e.m.visible) {
      e.t += dt; const p = e.t / e.dur;
      if (p >= 1) { e.m.visible = false; continue; }
      e.m.material.uniforms.uA.value = 1 - p; e.m.scale.x = e.m.scale.z = e.m.scale.x * (1 - dt * 1.2);
    }
    for (const e of this.slashes) if (e.m.visible) {
      e.t += rdt; const p = e.t / e.dur;
      if (p >= 1) { e.m.visible = false; continue; }
      e.m.scale.set(e.s * (0.5 + p * 1.3), e.s * (1 - p * 0.6), 1); e.m.material.uniforms.uA.value = 1 - p * p;
    }
    if (this.lightT > 0) { this.lightT -= rdt * 5; this.light.intensity *= Math.max(0, 1 - rdt * 9); if (this.lightT <= 0) this.light.intensity = 0; }
    this.shake = Math.max(0, this.shake - rdt * 2.6);
    this.flash = Math.max(0, this.flash - rdt * 4);
    this.fovKick = Math.max(0, this.fovKick - rdt * 5);
    // 대미지 숫자
    const w = this.layer.clientWidth, h = this.layer.clientHeight;
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i]; n.t += rdt;
      if (n.t > 0.9) { n.el.remove(); this.nums.splice(i, 1); continue; }
      this._v.copy(n.p).project(this.camera);
      if (this._v.z > 1) { n.el.style.opacity = 0; continue; }
      const x = (this._v.x * 0.5 + 0.5) * w + n.ox, y = (-this._v.y * 0.5 + 0.5) * h - n.t * 70 - 10;
      const pop = n.t < 0.1 ? 1 + (0.1 - n.t) * 6 : 1;
      n.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${pop})`;
      n.el.style.opacity = n.t > 0.6 ? 1 - (n.t - 0.6) / 0.3 : 1;
    }
  }
  reset() {
    for (const t of this.tele) { t.m.visible = false; t.cb = null; }
    for (const e of this.rings) e.m.visible = false;
    for (const e of this.cols) e.m.visible = false;
    for (const n of this.nums) n.el.remove(); this.nums.length = 0;
    this.shake = this.hitStop = this.slow = this.flash = 0;
  }
}
