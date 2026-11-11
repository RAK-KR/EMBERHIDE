// 헌터: 절차적 모델(IK), 이동/회피, 태도 전투
import * as THREE from 'three';
import { PLAYER as CFG, ATTACKS, ULT } from './config.js';
import { clamp, lerp, damp, angDiff, smooth, easeInOut, easeOut, placeSegment, solveIK, segGeo } from './util.js';
import { BladeTrail } from './fx.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0), _a = V(), _b = V(), _c = V(), _d = V(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const ULT_AXES = [[0.3, 1, 0], [0.3, -1, 0], [0.8, 0.6, 0], [0.8, -0.6, 0], [0.2, 1, 0], [-0.2, -1, 0]];
const TRAIL_COL = [[0.85, 0.95, 1.15], [0.55, 1.0, 1.5], [0.35, 1.15, 1.8], [0.4, 1.4, 2.1]];

export class Player {
  constructor(scene, world, fx, audio, input) {
    this.scene = scene; this.world = world; this.fx = fx; this.audio = audio; this.input = input;
    this._build();
    this.trail = new BladeTrail(scene);
    this.onHit = null; this.onEvent = null;
    this.reset(true);
  }

  _build() {
    const add = (m, p) => { m.castShadow = true; p.add(m); return m; };
    const coat = new THREE.MeshStandardMaterial({ color: 0x20232b, roughness: 0.85 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x6d747d, roughness: 0.38, metalness: 0.85 });
    const red = new THREE.MeshStandardMaterial({ color: 0x9c241c, roughness: 0.7, side: THREE.DoubleSide });
    const straw = new THREE.MeshStandardMaterial({ color: 0xb79c62, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0e0f12, roughness: 0.6 });
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.pivot = new THREE.Group(); this.pivot.position.y = 0.6; this.root.add(this.pivot);
    const inner = this.inner = new THREE.Group(); inner.position.y = -0.6; this.pivot.add(inner);
    const hips = this.hips = new THREE.Group(); inner.add(hips);
    const pel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.2, 10), coat), hips); pel.position.y = 0.02;
    // 허리 갑옷 자락
    for (const [x, z, ry, w] of [[0, 0.15, 0, 0.2], [0.16, 0.02, 1.4, 0.17], [-0.16, 0.02, -1.4, 0.17], [0, -0.15, 3.14, 0.22]]) {
      const t = add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 0.025), z < 0 ? coat : steel), hips);
      t.position.set(x, -0.2, z); t.rotation.set(-0.16, ry, 0, 'YXZ');
    }
    const belt = add(new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.028, 6, 16), red), hips); belt.rotation.x = Math.PI / 2; belt.position.y = 0.08;
    // 칼집
    const saya = add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 1.3, 8), dark), hips);
    saya.position.set(0.2, -0.02, -0.38); saya.rotation.set(1.2, 0.18, 0);

    const spine = this.spine = new THREE.Group(); spine.position.y = 0.1; hips.add(spine);
    const torso = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.155, 0.44, 12), coat), spine); torso.position.y = 0.24; torso.scale.z = 0.72;
    const chest = add(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), steel), spine); chest.scale.set(0.215, 0.17, 0.15); chest.position.set(0, 0.34, 0.035);
    for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
      const sp = add(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, 6.28, 0, 1.6), steel), spine);
      sp.scale.set(0.115 - k * 0.012, 0.07, 0.115 - k * 0.012); sp.position.set(sd * (0.225 + k * 0.03), 0.47 - k * 0.045, 0); sp.rotation.z = -sd * (0.5 + k * 0.28);
    }
    const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), dark), spine); neck.position.y = 0.52;
    const head = this.headG = new THREE.Group(); head.position.y = 0.63; spine.add(head);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.108, 14, 12), dark), head);
    const mask = add(new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 8, 0, 6.28, 1.5, 1.0), steel), head); mask.position.z = 0.012;
    const hat = add(new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.17, 20, 1, true), straw), head); hat.position.y = 0.115; hat.material.side = THREE.DoubleSide;
    const wrap = add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 14), red), spine); wrap.rotation.x = Math.PI / 2; wrap.position.y = 0.535;

    // 태도
    const wp = this.weapon = new THREE.Group(); spine.add(wp);
    const hilt = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.36, 8), dark), wp); hilt.position.y = -0.18;
    for (let i = 0; i < 6; i++) { const r = add(new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.006, 4, 8), red), wp); r.rotation.x = Math.PI / 2 + 0.5 * (i % 2 ? 1 : -1); r.position.y = -0.04 - i * 0.055; }
    const guard = add(new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.012, 14), steel), wp);
    this.BL = 1.5;
    const bg = new THREE.BoxGeometry(0.007, this.BL, 0.036, 1, 14, 1); bg.translate(0, this.BL / 2 + 0.006, 0);
    { const p = bg.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) / this.BL; let z = p.getZ(i);
        if (t > 0.93) z = z * (1 - (t - 0.93) / 0.07) + 0.018 * (t - 0.93) / 0.07 * -1;
        if (z > 0) p.setX(i, p.getX(i) * 0.15); // 날 쪽은 얇게
        p.setZ(i, z - t * t * 0.09);
      }
      bg.computeVertexNormals(); }
    this.bladeMat = new THREE.MeshStandardMaterial({ color: 0xe6edf5, roughness: 0.16, metalness: 1.0, emissive: 0x58c8ff, emissiveIntensity: 0 });
    add(new THREE.Mesh(bg, this.bladeMat), wp);

    // 팔다리(IK 세그먼트)
    this.UA = 0.3; this.FA = 0.29; this.TH = 0.47; this.SH = 0.47;
    const mk = (g, m) => add(new THREE.Mesh(g, m), inner);
    this.arms = [-1, 1].map(sd => ({ sd, up: mk(segGeo(0.066, 0.055, 8), coat), lo: mk(segGeo(0.06, 0.068, 8), steel), hand: mk(new THREE.SphereGeometry(0.05, 8, 6), dark), elbow: V(), sh: V(), tg: V() }));
    this.legsM = [-1, 1].map(sd => {
      const foot = new THREE.Group(); inner.add(foot);
      const boot = add(new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.08, 0.25), dark), foot); boot.position.set(0, 0.04, 0.05);
      return { sd, up: mk(segGeo(0.1, 0.078, 8), coat), lo: mk(segGeo(0.075, 0.058, 8), steel), knee: mk(new THREE.SphereGeometry(0.075, 8, 6), steel), foot, kneeP: V(), hip: V(), tg: V(), cur: V(sd * 0.14, 0, 0) };
    });

    // 목도리
    this.SN = 9; this.scarf = []; for (let i = 0; i < this.SN; i++) this.scarf.push(V());
    const sg = new THREE.BufferGeometry(); this.scarfPos = new Float32Array(this.SN * 6);
    sg.setAttribute('position', new THREE.BufferAttribute(this.scarfPos, 3));
    const idx = []; for (let i = 0; i < this.SN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    sg.setIndex(idx);
    this.scarfMesh = new THREE.Mesh(sg, red); this.scarfMesh.frustumCulled = false; this.scarfMesh.castShadow = true; this.scene.add(this.scarfMesh);

    this.bladeQ = new THREE.Quaternion(); this.handP = V(0, 0.2, 0.3);
    this.swAxis = V(0, 1, 0); this.swRef = V(0, 0, 1);
    this.pose = { hipY: 0.93, hipZ: 0, spineYaw: 0, spinePitch: 0, spineRoll: 0, headYaw: 0 };
  }

  reset(full) {
    this.pos = V(0, 0, 22); this.yaw = Math.PI; this.vel = V();
    this.hp = CFG.hp; this.stamina = CFG.stamina; this.staminaDelay = 0;
    if (full) { this.gauge = 0; this.potions = CFG.potions; this.lives = CFG.lives; this.stats = { dmg: 0, maxHit: 0, hits: 0, counters: 0, time: 0 }; }
    this.state = 'move'; this.t = 0; this.atk = null; this.atkName = ''; this.hitId = 0; this.hitDone = -1; this.queued = null;
    this.invuln = 0; this.dead = false; this.airborne = false; this.runPhase = 0; this.rollDir = V(0, 0, 1); this.knock = V();
    this.lockOn = false; this.swingAng = 0; this.trailBase = V(); this.prevTB = V(); this._trailWas = false; this.bladeBase = V(); this.bladeTip = V(); this.prevBase = V(); this.prevTip = V(); this.hasPrev = false;
    this.pivot.rotation.set(0, 0, 0); this.root.visible = true;
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; this.root.updateMatrixWorld(true);
    for (let i = 0; i < this.SN; i++) this.scarf[i].set(this.pos.x, 1.5 - i * 0.1, this.pos.z);
    this.trail.clear();
  }

  get segs() { return Math.floor(this.gauge / CFG.gaugeSeg); }

  // ── 상태 전환 ───────────────────────────────────────────
  _start(state) { this.state = state; this.t = 0; }
  _startAttack(name, faceDir) {
    this.atkName = name; this.atk = ATTACKS[name]; this._start('attack'); this.hitId++; this.queued = null; this.hasPrev = false;
    if (faceDir !== null) this.yaw = faceDir;
    this.audio.play(this.atk.heavy ? 'swingHeavy' : 'swing', 0.9 + Math.random() * 0.25);
    const ax = _a.fromArray(this.atk.swing.axis).normalize();
    this.swAxis = ax.clone();
    this.swRef = V(0, 0, 1).addScaledVector(ax, -ax.z).normalize();
  }
  _faceDir(camYaw, monster) {
    const ix = this.input.moveX, iy = this.input.moveY;
    if (Math.hypot(ix, iy) > 0.3) return this._inputYaw(camYaw);
    if (monster && !monster.dead) {
      let best = null, bd = 1e9;
      for (const s of monster.spheres) { const d = Math.hypot(s.c.x - this.pos.x, s.c.z - this.pos.z) - s.r; if (d < bd) { bd = d; best = s; } }
      if (best && (this.lockOn || bd < 6)) return Math.atan2(best.c.x - this.pos.x, best.c.z - this.pos.z);
    }
    return null;
  }
  _inputYaw(camYaw) {
    // 카메라 기준 입력을 월드 방향으로
    const ix = this.input.moveX, iy = this.input.moveY;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    return Math.atan2(fx * iy + rx * ix, fz * iy + rz * ix);
  }

  takeHit(dmg, from, heavy) {
    if (this.dead) return 'evade';
    if (this.state === 'counter' && this.t <= CFG.counterWindow) {
      // 흘려베기 성공
      this.fx.slowmo(0.45, 0.2); this.fx.flash = 0.5; this.fx.addShake(0.35); this.audio.play('counter');
      this.fx.hitSparks(_a.copy(this.pos).setY(this.pos.y + 1.2), 30, 8, 0, 0, 0, [1.5, 2.6, 3.4]);
      this.invuln = 0.9; this.stats.counters++;
      const ns = this._nearest(this._monster);
      const tx = ns ? ns.c.x : from.x, tz = ns ? ns.c.z : from.z;
      this._startAttack('counter', Math.atan2(tx - this.pos.x, tz - this.pos.z));
      this.onEvent && this.onEvent('counter');
      return 'counter';
    }
    if (this.invuln > 0 || this.state === 'ult' || (this.state === 'roll' && this.t < CFG.rollIframe) || (this.state === 'attack' && this.atkName === 'counter' && this.t < 0.45)) return 'evade';
    this.hp -= dmg; this.fx.addShake(0.6); this.fx.hurt = 1; this.audio.play('hurt');
    _a.set(this.pos.x - from.x, 0, this.pos.z - from.z).normalize();
    this.knock.copy(_a).multiplyScalar(heavy ? 11 : 6);
    this.yaw = Math.atan2(-_a.x, -_a.z);
    this.fx.hitSparks(_b.copy(this.pos).setY(this.pos.y + 1), 14, 5, 0, 0, 0, [3, 0.6, 0.3]);
    this.trail.clear(); this.atk = null;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this._start('dead'); this.onEvent && this.onEvent('dead'); }
    else { this._start('hurt'); this.invuln = 1.9; }
    return 'hit';
  }

  // ── 매 프레임 ──────────────────────────────────────────
  _nearest(monster) {
    if (!monster) return null;
    let best = null, bd = 1e9;
    for (const s of monster.spheres) { const d = Math.hypot(s.c.x - this.pos.x, s.c.z - this.pos.z) - s.r + Math.max(0, s.c.y - this.pos.y - 2.6) * 2; if (d < bd) { bd = d; best = s; } }
    this._nearD = bd; return best;
  }

  update(dt, camYaw, monster) {
    this._monster = monster;
    const inp = this.input, P = this.pose;
    this.t += dt; this.stats.time += (monster && monster.aware && !monster.dead && !this.dead) ? dt : 0;
    if (this.invuln > 0) this.invuln -= dt;
    const moving = Math.hypot(inp.moveX, inp.moveY) > 0.15;
    const wantYaw = moving ? this._inputYaw(camYaw) : this.yaw;
    let speed = 0, stepFwd = 0;
    // 포즈 목표값
    let bladeDir = _d.set(-0.22, 0.78, 0.58), hand = _c.set(-0.07, 0.2, 0.3), hipY = 0.93, spPitch = 0.04, spYaw = 0, snap = 14;
    let footL = V(0.14, 0, 0.13), footR = V(-0.14, 0, -0.12), leftFree = null, pivX = 0;
    this.airborne = false;

    if (this.staminaDelay > 0) this.staminaDelay -= dt; else this.stamina = Math.min(CFG.stamina, this.stamina + CFG.staminaRegen * dt);
    const useStamina = v => { this.stamina = Math.max(0, this.stamina - v); this.staminaDelay = CFG.staminaDelay; };

    const canAct = this.state === 'move' || (this.state === 'attack' && this.t > this.atk.act[1] + 0.04);
    const canRoll = canAct || (this.state === 'attack' && this.t < this.atk.wind * 0.6) || (this.state === 'counter' && this.t > CFG.counterWindow) || (this.state === 'drink');
    // 입력 처리
    if (!this.dead && this.state !== 'hurt' && this.state !== 'ult') {
      if (inp.peek('roll') && canRoll && this.stamina >= 8 && this.state !== 'roll') {
        inp.take('roll'); useStamina(CFG.rollCost);
        const y = moving ? wantYaw : this.yaw; this.yaw = y; this.rollDir.set(Math.sin(y), 0, Math.cos(y));
        this._start('roll'); this.audio.play('roll'); this.trail.clear(); this.atk = null;
        this.fx.dust(this.pos, 4, 0.4, 0.5);
      } else if (canAct) {
        if (inp.peek('ult') && this.segs >= 3) {
          inp.take('ult'); this.gauge = 0; this._start('ult'); this.ultHit = -1; this.hitId++; this.hasPrev = false;
          const f = this._faceDir(camYaw, monster); if (f !== null) this.yaw = f;
          this.audio.play('ult'); this.fx.flash = 0.35; this.fx.slowmo(0.25, 0.3); this.onEvent && this.onEvent('ult');
        } else if (inp.peek('counter') && this.stamina >= 8) {
          inp.take('counter'); useStamina(CFG.counterCost); this._start('counter'); this.trail.clear(); this.atk = null;
          const f = this._faceDir(camYaw, monster); if (f !== null) this.yaw = f;
        } else if (inp.peek('heavy')) {
          inp.take('heavy');
          const g = this.segs >= 1; if (g) { this.gauge -= CFG.gaugeSeg; this.audio.play('gauge'); }
          this._startAttack(g ? 'heavyG' : 'heavy', this._faceDir(camYaw, monster));
        } else if (inp.peek('attack')) {
          inp.take('attack');
          const next = this.state === 'attack' ? this.atk.next : 'l1';
          this._startAttack(next, this._faceDir(camYaw, monster));
        } else if (inp.peek('potion') && this.state === 'move' && this.potions > 0 && this.hp < CFG.hp) {
          inp.take('potion'); this.potions--; this._start('drink'); this.audio.play('potion');
        }
      }
    }
    if (inp.take('lock')) { this.lockOn = !this.lockOn; this.audio.play('ui'); }

    switch (this.state) {
      case 'move': {
        if (moving) {
          const sprint = inp.held.sprint && this.stamina > 1;
          speed = (sprint ? CFG.sprint : CFG.walk) * Math.min(1, Math.hypot(inp.moveX, inp.moveY));
          if (sprint) useStamina(CFG.sprintCost * dt);
          this.yaw += angDiff(this.yaw, wantYaw) * (1 - Math.exp(-14 * dt));
          const prev = this.runPhase; this.runPhase += dt * (5.2 + speed * 1.15);
          if (Math.floor(prev / Math.PI) !== Math.floor(this.runPhase / Math.PI)) this.audio.play('step', sprint ? 1.3 : 1);
          const ph = this.runPhase, st = 0.32 + speed * 0.022;
          footL.set(0.12, Math.max(0, Math.cos(ph)) * 0.24, Math.sin(ph) * st); footR.set(-0.12, Math.max(0, -Math.cos(ph)) * 0.24, -Math.sin(ph) * st);
          hipY = 0.9 + Math.abs(Math.cos(ph)) * 0.035; spPitch = sprint ? 0.42 : 0.26; spYaw = Math.sin(ph) * 0.12;
          bladeDir.set(-0.5, -0.32, -0.8); hand.set(-0.25, 0.1, 0.02);
        }
        break;
      }
      case 'roll': {
        const p = this.t / CFG.rollTime;
        speed = CFG.rollSpeed * (1 - p * 0.75);
        this.vel.copy(this.rollDir).multiplyScalar(speed);
        pivX = Math.PI * 2 * easeInOut(clamp(p / 0.82, 0, 1));
        hipY = 0.72; spPitch = 0.75; footL.set(0.12, 0.42, 0.12); footR.set(-0.12, 0.42, 0.05);
        bladeDir.set(-0.55, 0.1, -0.83); hand.set(-0.22, 0.12, 0.12); snap = 22;
        if (p >= 1) { this._start('move'); pivX = 0; }
        break;
      }
      case 'attack': {
        const A = this.atk, t = this.t, sw = A.swing;
        let ang;
        if (t < A.wind) { ang = sw.from; snap = 26; }
        else if (t < A.act[1]) { const p = (t - A.wind) / (A.act[1] - A.wind); ang = lerp(sw.from, sw.to, p * p * (3 - 2 * p)); snap = 80; }
        else { ang = sw.to; snap = 30; }
        const rec = smooth(A.act[1] + (A.dur - A.act[1]) * 0.55, A.dur, t);
        _q.setFromAxisAngle(this.swAxis, ang * Math.PI / 180);
        _a.copy(this.swRef).applyQuaternion(_q);
        bladeDir.lerp(_a, 1 - rec).normalize();
        _b.set(_a.x * 0.2, 0.3 + Math.max(0, _a.y) * (_a.z < 0.3 ? 0.36 : 0.12) + _a.y * 0.06, 0.27 + _a.z * 0.1 - Math.max(0, -_a.z) * 0.1);
        hand.lerp(_b, 1 - rec);
        spYaw = Math.atan2(_a.x, Math.abs(_a.z) + 0.5) * 0.7 * (1 - rec); spPitch = clamp(0.12 - _a.y * 0.22, -0.15, 0.4) * (1 - rec) + 0.04;
        hipY = lerp(0.8, 0.93, rec);
        footL.set(0.16, 0, lerp(0.42, 0.13, rec)); footR.set(-0.17, 0, lerp(-0.36, -0.12, rec));
        if (A.spin) pivX = 0;
        // 전진
        if (t > A.wind * 0.3 && t < A.act[1]) stepFwd = A.step / (A.act[1] - A.wind * 0.3);
        this._bladeActive = t >= A.act[0] - 0.02 && t <= A.act[1] + 0.02;
        this._trailOn = t >= A.wind * 0.7 && t <= A.act[1] + 0.05;
        if (this.atkName === 'counter' && t > A.act[1] && this.hitDone !== this.hitId && monster) { const ns = this._nearest(monster); if (ns && this._nearD < 4.5) this._checkHit(monster, ns); }
        if (t >= A.dur) { this._start('move'); this.atk = null; }
        break;
      }
      case 'ult': {
        const t = this.t, n = ULT.hits; let a, ang, charged = true;
        const i = Math.min(n - 1, Math.floor(t / ULT.interval));
        if (t < n * ULT.interval) {
          const lt = (t - i * ULT.interval) / ULT.interval;
          this.swAxis.fromArray(ULT_AXES[i]).normalize(); this.swRef.set(0, 0, 1).addScaledVector(this.swAxis, -this.swAxis.z).normalize();
          ang = lerp(-115, 115, easeInOut(clamp((lt - 0.3) / 0.55, 0, 1)));
          this._bladeActive = lt > 0.3 && lt < 0.88; this._trailOn = lt > 0.4 && lt < 0.92;
          if (this.ultHit !== i) { this.ultHit = i; this.hitId++; this.audio.play('swing', 1 + i * 0.05); }
          stepFwd = 1.2;
        } else {
          const ft = t - n * ULT.interval, w = ULT.finishAt - n * ULT.interval;
          this.swAxis.set(1, 0, 0); this.swRef.set(0, 0, 1);
          ang = ft < w ? -150 : lerp(-150, 70, easeInOut(clamp((ft - w) / 0.16, 0, 1)));
          this._bladeActive = ft >= w && ft < w + 0.2; this._trailOn = ft > w - 0.1 && ft < w + 0.25;
          if (ft >= w && this.ultHit !== 99) { this.ultHit = 99; this.hitId++; this.audio.play('swingHeavy'); stepFwd = 0; }
          if (ft > w && ft < w + 0.16) stepFwd = 12;
          hipY = ft < w ? 0.98 : 0.74;
        }
        _q.setFromAxisAngle(this.swAxis, ang * Math.PI / 180); _a.copy(this.swRef).applyQuaternion(_q);
        const rec = smooth(ULT.dur - 0.35, ULT.dur, t);
        bladeDir.lerp(_a, 1 - rec).normalize();
        _b.set(_a.x * 0.2, 0.3 + Math.max(0, _a.y) * (_a.z < 0.3 ? 0.36 : 0.12), 0.27 + _a.z * 0.1); hand.lerp(_b, 1 - rec);
        spYaw = Math.atan2(_a.x, Math.abs(_a.z) + 0.5) * 0.7; spPitch = clamp(0.12 - _a.y * 0.22, -0.15, 0.4);
        if (hipY === 0.93) hipY = 0.82; footL.set(0.16, 0, 0.4); footR.set(-0.17, 0, -0.34); snap = 150;
        if (t >= ULT.dur) { this._start('move'); this.invuln = 0.4; }
        break;
      }
      case 'counter': {
        bladeDir.set(0.42, -0.3, -0.86); hand.set(0.2, 0.06, 0.12); hipY = 0.78; spYaw = 0.55; spPitch = 0.3; snap = 26;
        footL.set(0.2, 0, -0.3); footR.set(-0.14, 0, 0.36);
        if (this.t >= CFG.counterTime) this._start('move');
        break;
      }
      case 'drink': {
        const p = this.t / CFG.potionTime;
        this.hp = Math.min(CFG.hp, this.hp + CFG.potionHeal / CFG.potionTime * dt);
        bladeDir.set(-0.4, -0.75, 0.3); hand.set(-0.26, 0.05, 0.1); leftFree = _b.set(0.05, 0.6, 0.16).clone(); spPitch = -0.12;
        if (moving) { speed = 2.2; this.yaw += angDiff(this.yaw, wantYaw) * (1 - Math.exp(-8 * dt)); this.runPhase += dt * 7; const ph = this.runPhase; footL.set(0.12, Math.max(0, Math.cos(ph)) * 0.12, Math.sin(ph) * 0.2); footR.set(-0.12, Math.max(0, -Math.cos(ph)) * 0.12, -Math.sin(ph) * 0.2); }
        if (Math.random() < dt * 14) this.fx.sparks.emit(_a.copy(this.pos).setY(this.pos.y + 0.4 + Math.random()), (Math.random() - 0.5), 1.5, (Math.random() - 0.5), 0.6, 0.02, 0.5, 2.4, 0.9, 1, -1, 1);
        if (p >= 1) this._start('move');
        break;
      }
      case 'hurt': {
        const t = this.t;
        pivX = t < 0.25 ? -1.45 * easeOut(t / 0.25) : t < 0.8 ? -1.45 : -1.45 * (1 - easeInOut((t - 0.8) / 0.4));
        hipY = 0.8; footL.set(0.16, 0.1, 0.3); footR.set(-0.16, 0.05, 0.2); bladeDir.set(-0.8, 0.1, 0.4); hand.set(-0.3, 0.2, 0.15);
        this.airborne = t < 0.2;
        if (t >= 1.2) { this._start('move'); pivX = 0; }
        break;
      }
      case 'dead': {
        pivX = -1.5 * easeOut(Math.min(1, this.t / 0.4)); hipY = 0.75; footL.set(0.2, 0.05, 0.35); footR.set(-0.16, 0.02, 0.25); bladeDir.set(-0.9, 0.0, 0.3); hand.set(-0.35, 0.1, 0.1);
        break;
      }
    }
    if (this.state !== 'attack' && this.state !== 'ult') { this._bladeActive = false; this._trailOn = false; }

    // 이동 적용
    if (this.state !== 'roll') this.vel.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(speed + stepFwd);
    this.knock.multiplyScalar(Math.max(0, 1 - 5 * dt));
    this.pos.addScaledVector(this.vel, dt).addScaledVector(this.knock, dt);
    if (monster && !monster.air && !monster.dead) { // 몸통과 겹치지 않게
      for (const [lz, r] of [[1.9, 1.9], [0, 2.2], [-1.9, 1.7]]) {
        const cx = monster.pos.x + Math.sin(monster.yaw) * lz, cz = monster.pos.z + Math.cos(monster.yaw) * lz;
        const dx = this.pos.x - cx, dz = this.pos.z - cz, d = Math.hypot(dx, dz);
        if (d < r + 0.35 && d > 0.001) { const k = (r + 0.35 - d) / d; this.pos.x += dx * k; this.pos.z += dz * k; }
      }
    }
    this.world.clampToArena(this.pos, 1.5);
    this.pos.y = this.world.heightAt(this.pos.x, this.pos.z);
    this.world.setPush(0, this.pos.x, this.pos.z, 1.4, 0.55);

    // ── 포즈 적용 ──
    const k = 1 - Math.exp(-snap * dt), k2 = 1 - Math.exp(-14 * dt);
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    this.pivot.rotation.x = (this.state === 'roll' || this.state === 'hurt' || this.state === 'dead') ? pivX : damp(this.pivot.rotation.x, 0, 20, dt);
    P.hipY = lerp(P.hipY, hipY, k2); P.spineYaw = lerp(P.spineYaw, spYaw, k); P.spinePitch = lerp(P.spinePitch, spPitch, k2);
    this.hips.position.set(0, P.hipY, 0);
    this.spine.rotation.set(P.spinePitch, P.spineYaw, 0, 'YXZ');
    this.headG.rotation.set(-P.spinePitch * 0.7, -P.spineYaw * 0.6, 0, 'YXZ');
    _q.setFromUnitVectors(Y, bladeDir.normalize());
    this.bladeQ.slerp(_q, k); this.handP.lerp(hand, k);
    this.weapon.quaternion.copy(this.bladeQ); this.weapon.position.copy(this.handP);
    this.hips.updateMatrix(); this.spine.updateMatrix(); this.weapon.updateMatrix();
    const toInner = (v, viaWeapon) => { if (viaWeapon) v.applyMatrix4(this.weapon.matrix); return v.applyMatrix4(this.spine.matrix).applyMatrix4(this.hips.matrix); };
    // 팔
    for (const arm of this.arms) {
      toInner(arm.sh.set(arm.sd * 0.22, 0.44, 0));
      if (arm.sd === 1 && leftFree) toInner(arm.tg.copy(leftFree)); else toInner(arm.tg.set(0, arm.sd === -1 ? -0.07 : -0.27, 0), true);
      _a.set(arm.sd * 0.7, -0.75, -0.35);
      solveIK(arm.sh, arm.tg, this.UA, this.FA, _a, arm.elbow);
      placeSegment(arm.up, arm.sh, arm.elbow); placeSegment(arm.lo, arm.elbow, arm.tg); arm.hand.position.copy(arm.tg);
    }
    // 다리
    const tgs = [footR, footL];
    for (let i = 0; i < 2; i++) {
      const lg = this.legsM[i];
      lg.cur.lerp(tgs[i], 1 - Math.exp(-22 * dt));
      lg.hip.set(lg.sd * 0.1, P.hipY - 0.04, 0);
      lg.tg.copy(lg.cur); lg.tg.y += 0.07;
      _a.set(lg.sd * 0.15, 0.1, 1);
      solveIK(lg.hip, lg.tg, this.TH, this.SH, _a, lg.kneeP);
      placeSegment(lg.up, lg.hip, lg.kneeP); placeSegment(lg.lo, lg.kneeP, lg.tg); lg.knee.position.copy(lg.kneeP);
      lg.foot.position.copy(lg.tg).y -= 0.07;
    }
    this.root.updateMatrixWorld(true);

    // 칼날 위치(월드)
    this.prevBase.copy(this.bladeBase); this.prevTip.copy(this.bladeTip);
    this.weapon.localToWorld(this.bladeBase.set(0, 0.25, 0)); this.weapon.localToWorld(this.bladeTip.set(0, this.BL, -0.09));
    this.prevTB.copy(this.trailBase); this.weapon.localToWorld(this.trailBase.set(0, this.BL * 0.5, -0.02));
    const seg = Math.min(3, this.segs), col = TRAIL_COL[seg], charged = (this.atk && this.atk.charged) || this.state === 'ult';
    this.bladeMat.emissiveIntensity = damp(this.bladeMat.emissiveIntensity, charged ? 5 : seg * 0.9, 8, dt);
    if (this._trailOn !== this._trailWas && this.hasPrev) this.trail.push(this.trailBase, this.bladeTip, 0); // 궤적 끊기
    this._trailWas = this._trailOn;
    if (this._trailOn) {
      const s = charged ? 1.15 : 0.85 + seg * 0.1;
      this.trail.color.setRGB(col[0], col[1], col[2]);
      if (this.hasPrev) { // 프레임 사이를 보간해 궤적을 매끈하게
        this.trail.push(_a.lerpVectors(this.prevTB, this.trailBase, 0.5), _b.lerpVectors(this.prevTip, this.bladeTip, 0.5), s);
      }
      this.trail.push(this.trailBase, this.bladeTip, s);
    }
    this.trail.update(dt);
    if (this._bladeActive && monster && this.hasPrev) this._checkHit(monster);
    this.hasPrev = true;

    this._scarf(dt);
  }

  _checkHit(monster, forced) {
    if (this.hitDone === this.hitId || monster.dead) return;
    let best = forced || null, bestD = 1e9; const bp = _d;
    if (forced) bp.copy(forced.c).lerp(this.bladeTip, 0.3);
    else
    for (let s = 0; s <= 2; s++) for (let j = 0; j <= 5; j++) {
      _a.lerpVectors(this.prevBase, this.bladeBase, s / 2); _b.lerpVectors(this.prevTip, this.bladeTip, s / 2);
      _c.lerpVectors(_a, _b, j / 5);
      for (const sp of monster.spheres) {
        const d = _c.distanceTo(sp.c) - sp.r - 0.38;
        if (d < 0 && d < bestD) { bestD = d; best = sp; bp.copy(_c); }
      }
    }
    if (!best) return;
    this.hitDone = this.hitId;
    const isUlt = this.state === 'ult', fin = isUlt && this.ultHit === 99;
    const A = this.atk;
    const mv = isUlt ? (fin ? ULT.finishMv : ULT.mv) : A.mv;
    const heavy = isUlt ? fin : !!A.heavy;
    // 타격 지점: 칼과 부위 표면 사이
    const pt = V().copy(bp).lerp(best.c, 0.35);
    const res = monster.damage(mv * (0.94 + Math.random() * 0.12), best.part, pt);
    if (!res.dealt) return;
    this.stats.dmg += res.dealt; this.stats.hits++; this.stats.maxHit = Math.max(this.stats.maxHit, res.dealt);
    if (!isUlt && A.gain) { const before = this.segs; this.gauge = Math.min(CFG.gaugeMax, this.gauge + A.gain); if (this.segs > before) { this.audio.play('gauge'); this.onEvent && this.onEvent('gauge'); } }
    const fx = this.fx, col = TRAIL_COL[Math.min(3, this.segs)];
    fx.hitSparks(pt, heavy ? 34 : 16, heavy ? 10 : 6.5, 0, 0, 0, res.weak ? [3.4, 2.0, 0.5] : [3.0, 1.3, 0.45]);
    fx.slashFlash(pt, heavy ? 5.5 : 3.2, new THREE.Color(col[0], col[1], col[2]).multiplyScalar(heavy ? 1.6 : 1), Math.random() * 3.14);
    fx.flashLight(pt, heavy ? 36 : 16, 0xbfe4ff);
    fx.stop(res.killed ? 0.3 : heavy ? 0.12 : 0.055); fx.addShake(heavy ? 0.42 : 0.16); if (heavy) fx.fovKick = 1;
    this.audio.play(heavy ? 'hitHeavy' : 'hit', 0.9 + Math.random() * 0.3);
    fx.number(pt, res.dealt, (res.weak ? 'weak ' : '') + (heavy ? 'big' : ''));
    this.onHit && this.onHit(res);
  }

  _scarf(dt) {
    const s = this.scarf, wind = Math.sin(performance.now() * 0.002) * 0.5 + 1.2;
    this.spine.localToWorld(s[0].set(0, 0.55, -0.1));
    for (let i = 1; i < this.SN; i++) {
      const n = s[i];
      n.y -= 2.2 * dt; n.x += wind * dt * 0.9; n.z += (0.4 + Math.sin(performance.now() * 0.004 + i) * 0.5) * dt;
      _a.subVectors(n, s[i - 1]); const l = _a.length() || 1; n.copy(s[i - 1]).addScaledVector(_a, 0.105 / l);
      const gy = this.world.heightAt(n.x, n.z) + 0.03; if (n.y < gy) n.y = gy;
    }
    const p = this.scarfPos;
    for (let i = 0; i < this.SN; i++) {
      _a.subVectors(s[Math.min(i + 1, this.SN - 1)], s[Math.max(i - 1, 0)]).normalize();
      _b.crossVectors(_a, Y).normalize().multiplyScalar(0.06 * (1 - i / this.SN * 0.4));
      p[i * 6] = s[i].x + _b.x; p[i * 6 + 1] = s[i].y + _b.y + 0.02; p[i * 6 + 2] = s[i].z + _b.z;
      p[i * 6 + 3] = s[i].x - _b.x; p[i * 6 + 4] = s[i].y - _b.y - 0.02; p[i * 6 + 5] = s[i].z - _b.z;
    }
    const g = this.scarfMesh.geometry; g.attributes.position.needsUpdate = true; g.computeVertexNormals();
  }
}
