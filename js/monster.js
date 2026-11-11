// 대형 몬스터 "켈드락": 절차적 모델, 보행(IK), AI 패턴, 부위 파괴
import * as THREE from 'three';
import { MONSTER as CFG, ARENA_R } from './config.js';
import { clamp, lerp, damp, angDiff, smooth, easeInOut, easeOut, noise3, makeCrackTexture, placeSegment, solveIK, segGeo } from './util.js';

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _k = V(), _hp = V(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

function scaleUV(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
function lump(g, amp, freq, seed = 0) {
  const p = g.attributes.position, v = V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const l = v.length() || 1, n = noise3(v.x * freq + seed, v.y * freq + seed * 2, v.z * freq) - 0.5;
    v.multiplyScalar(1 + n * amp / l * 2);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}

export class Monster {
  constructor(scene, world, fx, audio) {
    this.scene = scene; this.world = world; this.fx = fx; this.audio = audio;
    this.root = new THREE.Group(); scene.add(this.root);
    this._build();
    this.spheres = [];
    this.projectiles = [];
    this.reset();
  }

  // ── 모델 ───────────────────────────────────────────────
  _build() {
    const rt = this.world.rockTex;
    const crack = makeCrackTexture(512, 6, 11);
    const hide = this.hide = new THREE.MeshStandardMaterial({ color: 0x3b3431, map: rt.map, normalMap: rt.normalMap, roughness: 0.72, metalness: 0.18, emissive: 0xff4a10, emissiveMap: crack, emissiveIntensity: 1 });
    hide.normalScale.set(1.8, 1.8);
    const plate = this.plateMat = new THREE.MeshStandardMaterial({ color: 0x17161a, map: rt.map, normalMap: rt.normalMap, roughness: 0.32, metalness: 0.55, emissive: 0xff5a14, emissiveMap: crack, emissiveIntensity: 0.6 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xcdbfa4, roughness: 0.55, map: rt.map });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.3) });
    const add = (m, parent = this.root) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

    // 몸통
    const tg = new THREE.SphereGeometry(1, 40, 26);
    { const p = tg.attributes.position, v = V();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const z = v.z, prof = 0.74 + 0.30 * Math.exp(-Math.pow((z - 0.42) / 0.42, 2)) - 0.10 * smooth(0.2, -1, z);
        let x = v.x * 1.5 * prof, y = v.y * 1.22 * prof;
        if (v.y > 0) y += v.y * Math.exp(-Math.pow((z - 0.35) / 0.4, 2)) * 0.5;
        if (v.y < 0) y *= 0.86;
        const n = noise3(v.x * 3.2 + 5, v.y * 3.2, v.z * 4.5) - 0.5;
        const k = 1 + n * 0.16;
        p.setXYZ(i, x * k, y * k, z * 3.15);
      }
      tg.computeVertexNormals(); scaleUV(tg, 2.2, 1.3); }
    this.torsoG = new THREE.Group(); this.root.add(this.torsoG);
    add(new THREE.Mesh(tg, hide), this.torsoG);

    // 등 갑각
    this.plates = [];
    const pg = new THREE.ConeGeometry(0.62, 1.7, 4, 1); pg.translate(0, 0.85, 0); pg.scale(0.34, 1, 1); scaleUV(pg, 1, 1);
    for (let i = 0; i < 7; i++) {
      const z = 2.1 - i * 0.74, hgt = 1.22 * (0.74 + 0.30 * Math.exp(-Math.pow((z / 3.15 - 0.42) / 0.42, 2))) + Math.exp(-Math.pow((z / 3.15 - 0.35) / 0.4, 2)) * 0.5;
      const s = 0.75 + Math.sin((i + 0.6) / 7 * Math.PI) * 0.75;
      const m = add(new THREE.Mesh(pg, plate), this.torsoG);
      m.position.set(0, hgt - 0.25, z); m.rotation.x = -0.55; m.scale.setScalar(s);
      this.plates.push(m);
      for (const sd of [-1, 1]) { // 옆 갑각
        const m2 = add(new THREE.Mesh(pg, plate), this.torsoG);
        m2.position.set(sd * 0.75, hgt - 0.55, z - 0.2); m2.rotation.set(-0.7, 0, -sd * 0.75); m2.scale.setScalar(s * 0.62);
        this.plates.push(m2);
      }
    }

    // 다리
    this.L1 = 1.75; this.L2 = 1.85;
    const upG = scaleUV(segGeo(0.66, 0.42, 12), 2, 1.5), loG = scaleUV(segGeo(0.42, 0.30, 12), 2, 1.5);
    const jointG = lump(new THREE.SphereGeometry(1, 14, 10), 0.3, 2.2, 3);
    const footG = new THREE.SphereGeometry(1, 14, 10); footG.scale(0.62, 0.36, 0.78); footG.translate(0, 0.3, 0.12); lump(footG, 0.12, 3, 7);
    const clawG = new THREE.ConeGeometry(0.13, 0.75, 6); clawG.rotateX(Math.PI / 2 + 0.35); clawG.translate(0, 0.14, 0.95);
    this.hipLocal = [V().set(1.2, -0.15, 1.65), V().set(-1.2, -0.15, 1.65), V().set(1.1, -0.2, -1.75), V().set(-1.1, -0.2, -1.75)];
    this.homeLocal = [V().set(2.05, 0, 2.1), V().set(-2.05, 0, 2.1), V().set(1.95, 0, -2.0), V().set(-1.95, 0, -2.0)];
    this.legs = [];
    for (let i = 0; i < 4; i++) {
      const leg = {
        up: add(new THREE.Mesh(upG, hide)), lo: add(new THREE.Mesh(loG, hide)),
        knee: add(new THREE.Mesh(jointG, plate)), hip: add(new THREE.Mesh(jointG, hide)), foot: new THREE.Group(),
        pos: V(), from: V(), to: V(), prevHome: V(), stepT: 1, stepping: false, dur: 0.3, group: (i === 0 || i === 3) ? 0 : 1, front: i < 2, side: i % 2 === 0 ? 1 : -1,
        override: null, kneeW: V(), hipW: V(),
      };
      leg.knee.scale.setScalar(0.5); leg.hip.scale.setScalar(i < 2 ? 0.95 : 0.85);
      add(new THREE.Mesh(footG, hide), leg.foot);
      for (const cx of [-0.34, 0, 0.34]) { const c = add(new THREE.Mesh(clawG, bone), leg.foot); c.position.x = cx; c.rotation.y = -cx * 0.7; }
      this.root.add(leg.foot);
      this.legs.push(leg);
    }

    // 목 + 머리
    this.neck = add(new THREE.Mesh(scaleUV(segGeo(0.95, 0.66, 18), 2, 1.5), hide));
    this.neckJ = add(new THREE.Mesh(jointG, hide)); this.neckJ.scale.setScalar(1.02);
    this.headJ = add(new THREE.Mesh(jointG, hide)); this.headJ.scale.setScalar(0.72);
    this.head = new THREE.Group(); this.root.add(this.head);
    const sk = new THREE.SphereGeometry(1, 24, 16);
    { const p = sk.attributes.position, v = V();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const taper = 1 - smooth(-0.1, 1, v.z) * 0.5;
        let y = v.y * 0.6; if (v.y < 0) y *= 0.55;
        y += smooth(0.2, -0.6, v.z) * Math.max(0, v.y) * 0.28;
        p.setXYZ(i, v.x * 0.84 * taper, y, v.z * 1.38);
      }
      lump(sk, 0.10, 3.5, 2); scaleUV(sk, 2, 1.5); }
    add(new THREE.Mesh(sk, hide), this.head);
    this.jaw = new THREE.Group(); this.jaw.position.set(0, -0.16, -0.62); this.head.add(this.jaw);
    const jg = new THREE.SphereGeometry(1, 18, 10); jg.scale(0.66, 0.24, 0.98); jg.translate(0, -0.14, 0.86);
    { const p = jg.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i); p.setX(i, p.getX(i) * (1 - smooth(0.6, 1.9, z) * 0.45)); } jg.computeVertexNormals(); }
    add(new THREE.Mesh(jg, hide), this.jaw);
    const toothG = new THREE.ConeGeometry(0.065, 0.3, 5);
    for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) {
      const z = 0.25 + i * 0.19, x = sd * 0.5 * (1 - smooth(0.2, 1.4, z) * 0.5);
      const up = add(new THREE.Mesh(toothG, bone), this.head); up.position.set(x, -0.26, z); up.rotation.x = Math.PI; up.scale.setScalar(i === 4 ? 1.7 : 1);
      const lo = add(new THREE.Mesh(toothG, bone), this.jaw); lo.position.set(x * 0.92, 0.1, z + 0.62 + 0.09); lo.scale.setScalar(0.8);
    }
    const mkHorn = (len, r, sweep) => {
      const g = new THREE.ConeGeometry(r, len, 9, 8); g.translate(0, len / 2, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const t = p.getY(i) / len; p.setZ(i, p.getZ(i) - t * t * sweep); p.setY(i, p.getY(i) * (1 - t * 0.12)); }
      g.computeVertexNormals(); return g;
    };
    const hornG = mkHorn(2.1, 0.27, 1.0);
    this.horns = [];
    for (const sd of [-1, 1]) {
      const h = add(new THREE.Mesh(hornG, bone), this.head);
      h.position.set(sd * 0.52, 0.34, -0.55); h.rotation.set(-0.75, 0, -sd * 0.62);
      this.horns.push(h);
    }
    const nose = add(new THREE.Mesh(mkHorn(0.7, 0.16, 0.2), bone), this.head); nose.position.set(0, 0.2, 1.05); nose.rotation.x = 0.35;
    const browG = new THREE.ConeGeometry(0.3, 0.9, 4); browG.scale(1, 1, 0.4);
    for (const sd of [-1, 1]) {
      const b = add(new THREE.Mesh(browG, plate), this.head); b.position.set(sd * 0.5, 0.36, 0.2); b.rotation.set(-1.25, 0, -sd * 0.3);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), this.eyeMat); eye.position.set(sd * 0.47, 0.17, 0.6); this.head.add(eye);
    }
    this.mouthGlow = new THREE.PointLight(0xff6a20, 0, 14, 1.5); this.mouthGlow.position.set(0, -0.2, 0.9); this.head.add(this.mouthGlow);

    // 꼬리
    this.TN = 9; this.TSP = 0.82;
    this.tail = []; this.tailSeg = [];
    for (let i = 0; i < this.TN; i++) this.tail.push(V());
    for (let i = 0; i < this.TN - 1; i++) {
      const rr = k => 0.2 + 0.6 * Math.pow(1 - k / (this.TN - 1), 1.5); const r0 = rr(i), r1 = rr(i + 1);
      this.tailSeg.push(add(new THREE.Mesh(scaleUV(segGeo(r0, r1, 10), 1.5, 0.8), hide)));
    }
    this.club = new THREE.Group(); this.root.add(this.club);
    add(new THREE.Mesh(lump(new THREE.IcosahedronGeometry(0.72, 2), 0.3, 2.5, 9), plate), this.club);
    const spikeG = new THREE.ConeGeometry(0.16, 0.8, 5); spikeG.translate(0, 0.7, 0);
    for (let i = 0; i < 9; i++) { const s = add(new THREE.Mesh(spikeG, bone), this.club); s.rotation.set(Math.acos(1 - 2 * (i + 0.5) / 9), i * 2.4, 0, 'YXZ'); }

    this.chestLight = new THREE.PointLight(0xff5a1a, 0, 16, 1.4); this.root.add(this.chestLight);

    // 투사체
    const pjG = new THREE.IcosahedronGeometry(0.5, 1);
    this.pjPool = [];
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(pjG, new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 1.5, 0.3) })); m.visible = false; this.scene.add(m); this.pjPool.push(m); }
  }

  reset() {
    this.pos = V().set(0, 0, -14); this.yaw = 0; this.rideH = 2.5; this.bodyY = 0; this.pitch = 0; this.roll = 0; this.lunge = 0;
    this.maxHp = CFG.hp; this.hp = this.maxHp;
    this.parts = {};
    for (const k in CFG.parts) this.parts[k] = { acc: 0, max: this.maxHp * CFG.parts[k].ratio, broken: false };
    this.enraged = false; this.rageT = 0; this.rageStage = 0; this.dead = false; this.deadT = 0; this.aware = false;
    this.state = 'rest'; this.t = 0; this.cool = 1.5; this.lastAtk = ''; this.hitDone = false; this.data = {};
    this.headYaw = 0; this.headPitch = 0; this.headExt = 1; this.jawOpen = 0; this.hYawT = 0; this.hPitchT = 0; this.hExtT = 1; this.jawT = 0; this.headTrack = true;
    this.air = false; this.tailCut = false; this.glow = 1; this.breath = 0; this.speed = 0;
    this.bodyPos = V(); this.bodyQ = new THREE.Quaternion(); this.headPos = V();
    for (const h of this.horns) h.visible = true;
    for (const p of this.plates) { p.visible = true; }
    for (const s of this.tailSeg) s.visible = true;
    this.club.visible = true; this.clubLoose = false;
    for (const p of this.pjPool) p.visible = false; this.projectiles.length = 0;
    this._bodyXform();
    for (let i = 0; i < 4; i++) { const l = this.legs[i]; this._home(i, l.pos); l.prevHome.copy(l.pos); l.stepping = false; l.override = null; }
    for (let i = 0; i < this.TN; i++) this.tail[i].copy(this._toWorld(_a.set(0, 0, -2.9 - i * this.TSP)));
    this.hide.emissiveIntensity = 1; this.plateMat.emissiveIntensity = 0.6;
  }

  _toWorld(v) { return v.applyQuaternion(this.bodyQ).add(this.bodyPos); }
  _flat(v, out) { // 요(yaw)만 적용한 지면 좌표
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    out.set(this.pos.x + v.x * c + v.z * s, 0, this.pos.z - v.x * s + v.z * c);
    out.y = this.world.heightAt(out.x, out.z); return out;
  }
  _home(i, out) { return this._flat(this.homeLocal[i], out); }
  _bodyXform() {
    const g = this.world.heightAt(this.pos.x, this.pos.z);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.bodyPos.set(this.pos.x + s * this.lunge, g + this.rideH + this.bodyY + Math.sin(this.breath) * 0.05, this.pos.z + c * this.lunge);
    _e.set(this.pitch, this.yaw, this.roll, 'YXZ'); this.bodyQ.setFromEuler(_e);
  }
  get fwd() { return _k.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  mouthPos(out) { return out.set(0, -0.2, 1.3).applyQuaternion(this.head.quaternion).add(this.head.position); }

  setState(s, data = {}) { this.state = s; this.t = 0; this.hitDone = false; this.data = data; for (const l of this.legs) l.override = null; this.headTrack = true; }

  // ── 피격 ───────────────────────────────────────────────
  damage(amount, part, point) {
    if (this.dead) return { dealt: 0 };
    const cfg = CFG.parts[part], p = this.parts[part];
    const dealt = Math.max(1, Math.round(amount * (p.broken ? cfg.brokenMult : cfg.mult)));
    this.hp -= dealt; p.acc += dealt; this.aware = true;
    const res = { dealt, weak: part === 'head' || (p.broken && part === 'body'), broke: null, killed: false };
    if (this.hp <= 0) { this.hp = 0; this._die(); res.killed = true; return res; }
    if (part === 'legs') {
      if (p.acc >= p.max) { p.acc = 0; p.max *= 1.4; p.broken = true; res.broke = '다리 — 넘어뜨림'; this._topple(point); }
    } else if (!p.broken && p.acc >= p.max) {
      p.broken = true; res.broke = cfg.label + (part === 'tail' ? ' 절단' : ' 파괴'); this._break(part, point);
    }
    const r = this.hp / this.maxHp;
    if (this.rageStage < CFG.enrageAt.length && r <= CFG.enrageAt[this.rageStage] && !this.dead) { this.rageStage++; this.pendingRage = true; }
    return res;
  }
  _break(part, point) {
    this.audio.play('break'); this.fx.addShake(0.5); this.fx.stop(0.14);
    this.fx.hitSparks(point, 40, 9); this.fx.embers(point, 30, 1.2, 6); this.fx.dust(point, 8, 1, 0.8, [0.2, 0.18, 0.18]);
    if (part === 'head') { this.horns[Math.random() < 0.5 ? 0 : 1].visible = false; this._flinch(1.6); }
    else if (part === 'body') { this.plates.forEach((p, i) => { if (i % 3 === 0 ? i % 2 === 0 : true) p.visible = i % 3 === 0 && i % 2 === 1; }); this._flinch(1.3); }
    else if (part === 'tail') {
      this.tailCut = true;
      for (let i = 5; i < this.tailSeg.length; i++) this.tailSeg[i].visible = false;
      this.clubLoose = true; this.clubVel = V().set((Math.random() - 0.5) * 6, 7, (Math.random() - 0.5) * 6); this.clubPos = this.tail[this.TN - 1].clone();
      this._flinch(1.9);
    }
  }
  _flinch(dur) { if (this.air || this.state === 'topple' || this.dead) return; this.setState('flinch', { dur }); this.audio.play('growl'); }
  _topple(point) { if (this.dead) return; this.air = false; this.bodyY = 0; this.setState('topple', { side: Math.random() < 0.5 ? 1 : -1 }); this.audio.play('down'); this.fx.addShake(0.6); }
  _die() {
    this.dead = true; this.deadT = 0; this.air = false; this.setState('dead', { side: Math.random() < 0.5 ? 1 : -1 });
    this.audio.play('roar'); this.fx.slowmo(2.2, 0.22); this.fx.addShake(0.8);
  }

  hitPlayer(player, c, r, dmg, heavy = true) {
    if (this.hitDone || player.dead) return false;
    _hp.copy(player.pos); _hp.y += 1.0; // c 가 임시 벡터(_a)일 수 있으므로 전용 벡터 사용
    const dy = clamp(_hp.y, c.y - r, c.y + r) - c.y; // 세로는 느슨하게
    const d = Math.hypot(_hp.x - c.x, _hp.z - c.z, (_hp.y - c.y - dy));
    if (d > r + 0.45) return false;
    const res = player.takeHit(dmg * (this.enraged ? 1.2 : 1), this.pos, heavy);
    this.hitDone = true; // 한 번 닿은 공격은 회피했더라도 다시 맞지 않음
    return true;
  }

  // ── AI ─────────────────────────────────────────────────
  _turn(target, rate, dt) { const d = angDiff(this.yaw, target); const m = rate * dt; this.yaw += clamp(d, -m, m); return d; }
  _move(sp, dt) { const f = this.fwd; this.pos.x += f.x * sp * dt; this.pos.z += f.z * sp * dt; }

  _choose(dist, rel) {
    const o = [], ar = Math.abs(rel), w = (n, v) => o.push([n, v * (n === this.lastAtk ? 0.3 : 1)]);
    if (dist < 9) {
      if (ar > 1.9) { w('tail', 4); w('slam', 1); }
      else if (ar < 0.9) { w('bite', 3); w('claw', 3); w('tail', 1.2); w('slam', 1); }
      else { w('claw', 2.5); w('tail', 2.5); }
    } else if (dist < 19) { w('charge', 2.2); w('slam', 3); w('spit', 1.5); w('bite', dist < 12 ? 1.5 : 0); }
    else { w('charge', 3); w('spit', 3); }
    if (this.enraged) w('erupt', 1.6);
    let sum = 0; for (const e of o) sum += e[1];
    let r = Math.random() * sum;
    for (const e of o) { r -= e[1]; if (r <= 0) return e[0]; }
    return o[0][0];
  }

  _ai(dt, player) {
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz), ang = Math.atan2(dx, dz), rel = angDiff(this.yaw, ang);
    const fx = this.fx, au = this.audio, D = CFG.dmg, rage = this.enraged, sp = rage ? 1.18 : 1;
    this.t += dt * (this.state === 'hunt' || this.state === 'rest' || this.state === 'topple' || this.state === 'flinch' || this.state === 'dead' ? 1 : sp);
    const t = this.t;
    this.hYawT = 0; this.hPitchT = 0; this.hExtT = 1; this.jawT = 0; this.speed = 0;
    let rideT = 2.5, pitchT = 0, rollT = 0, lungeT = 0;

    if (rage && this.state !== 'dead') { this.rageT -= dt; if (this.rageT <= 0) { this.enraged = false; } }

    switch (this.state) {
      case 'rest': // 플레이어를 발견하기 전
        this.headTrack = false; this.hYawT = Math.sin(t * 0.4) * 0.5; this.hPitchT = -0.15;
        if (dist < 26 || this.aware) { this.aware = true; this.setState('roar', { intro: true }); }
        break;
      case 'hunt': {
        if (this.pendingRage) { this.pendingRage = false; this.setState('roar', {}); break; }
        const d = this._turn(ang, CFG.turn * (rage ? 1.35 : 1), dt);
        if (dist > 8 && Math.abs(d) < 1.3) { this.speed = CFG.walk * (rage ? 1.35 : 1); this._move(this.speed, dt); }
        this.cool -= dt;
        if (this.cool <= 0 && !player.dead) {
          const a = this._choose(dist, rel); this.lastAtk = a;
          if (a === 'claw') this.setState('claw', { side: rel > 0 ? 0 : 1, chain: rage ? 1 : 0 });
          else if (a === 'tail') this.setState('tail', { dir: rel > 0 ? 1 : -1, y0: this.yaw });
          else if (a === 'slam') {
            const td = clamp(dist, 5, 22); const tx = this.pos.x + dx / (dist || 1) * td, tz = this.pos.z + dz / (dist || 1) * td;
            const p = V().set(tx, 0, tz); this.world.clampToArena(p, 5);
            this.setState('slam', { from: this.pos.clone(), to: p }); fx.telegraph(p.x, p.z, 7.5, 1.62 / sp); au.play('growl');
          } else this.setState(a, {});
        }
        break;
      }
      case 'roar': {
        this.headTrack = false; this.hPitchT = 0.55; this.jawT = t > 0.35 && t < 2.1 ? 1 : 0; pitchT = -0.14; rideT = 2.7;
        if (!this.data.s && t > 0.35) { this.data.s = 1; au.play('roar'); if (!this.data.intro) { this.enraged = true; this.rageT = CFG.enrageTime; } }
        if (t > 0.35 && t < 2.0) { fx.addShake(dt * 3.2 * clamp(1.6 - dist / 30, 0.2, 1)); if (Math.random() < dt * 5) { this.mouthPos(_a); fx.ring(_a.x, _a.z, 12, 0.6, 0xffc090); } }
        if (t > 2.4) { this.setState('hunt'); this.cool = 0.3; }
        break;
      }
      case 'bite': {
        if (t < 0.7) { this._turn(ang, 1.0, dt); this.hPitchT = 0.45; this.hExtT = 0.72; this.jawT = t / 0.7; lungeT = -0.7; pitchT = -0.06; }
        else if (t < 1.0) {
          if (!this.data.s) { this.data.s = 1; au.play('growl'); }
          this.headTrack = false; this.hYawT = this.headYaw; this.hPitchT = -0.42; this.hExtT = 1.3; this.jawT = t < 0.86 ? 1 : 0; lungeT = 1.4; pitchT = 0.1;
          this._move(9, dt);
          if (t > 0.74) this.hitPlayer(player, this.headPos, 1.75, D.bite);
        } else { this.hPitchT = -0.2; if (t > 1.9) this._endAtk(0.5); }
        break;
      }
      case 'claw': {
        const i = this.data.side, leg = this.legs[i];
        if (!leg.override) leg.override = leg.pos.clone();
        if (t < 0.68) {
          this._turn(ang, 0.9, dt);
          this._toWorld(_a.copy(this.hipLocal[i]).add(_b.set(leg.side * 0.9, 1.5, 1.4)));
          leg.override.lerp(_a, 1 - Math.exp(-9 * dt)); rollT = -leg.side * 0.16; pitchT = -0.1; this.hPitchT = 0.2;
          if (!this.data.tg) { // 내려찍을 지점 결정은 마지막 순간에
            this.data.tg = V();
          }
          const reach = clamp(dist, 3.5, 7.2);
          this._flat(_b.set(Math.sin(clamp(rel, -0.7, 0.7)) * reach, 0, Math.cos(clamp(rel, -0.7, 0.7)) * reach), this.data.tg);
        } else if (t < 0.84) {
          leg.override.lerp(this.data.tg, clamp((t - 0.68) / 0.14, 0, 1)); rollT = leg.side * 0.1; pitchT = 0.08; lungeT = 0.5;
        } else {
          if (!this.data.s) {
            this.data.s = 1; leg.override.copy(this.data.tg); au.play('thud', 1); fx.addShake(0.45); fx.dust(this.data.tg, 14, 1.6, 0.9); fx.ring(this.data.tg.x, this.data.tg.z, 3.4, 0.35);
            this.hitPlayer(player, _a.copy(this.data.tg).setY(this.data.tg.y + 0.8), 2.5, D.claw);
          }
          if (t > (this.data.chain ? 1.15 : 1.75)) {
            leg.override = null;
            if (this.data.chain) this.setState('claw', { side: 1 - i, chain: 0 }); else this._endAtk(0.5);
          }
        }
        break;
      }
      case 'tail': {
        const dir = this.data.dir;
        if (t < 0.75) { this.yaw = this.data.y0 - dir * 0.45 * easeInOut(t / 0.75); rideT = 2.2; this.hYawT = -dir * 0.6; }
        else if (t < 1.5) {
          if (!this.data.s) { this.data.s = 1; au.play('swingHeavy'); }
          const p = easeInOut((t - 0.75) / 0.75);
          this.yaw = this.data.y0 - dir * 0.45 + dir * (Math.PI * 1.95) * p; rollT = dir * 0.12;
          const n = this.tailCut ? 5 : this.TN;
          for (let k = 2; k < n; k += 1) if (this.hitPlayer(player, this.tail[k], k === this.TN - 1 ? 1.5 : 1.15, D.tail)) break;
        } else if (t > 2.35) this._endAtk(0.6);
        break;
      }
      case 'charge': {
        if (t < 1.0) {
          this._turn(ang, 2.4, dt); this.hPitchT = -0.35; rideT = 2.25; pitchT = 0.08; lungeT = -0.5;
          const leg = this.legs[0]; if (!leg.override) leg.override = leg.pos.clone();
          this._flat(_a.copy(this.homeLocal[0]).add(_b.set(0, 0, Math.sin(t * 14) * 0.8)), leg.override); leg.override.y += Math.max(0, Math.sin(t * 14 + 1.5)) * 0.5;
          if (Math.random() < dt * 12) fx.dust(leg.override, 1, 0.4, 0.5);
          if (!this.data.s && t > 0.15) { this.data.s = 1; au.play('growl'); }
        } else if (!this.data.skid) {
          this.legs[0].override = null;
          const ct = t - 1.0; this.speed = Math.min(18, 6 + ct * 40);
          this._turn(ang, 0.5, dt); this._move(this.speed, dt); this.hPitchT = -0.3; pitchT = 0.07; this.jawT = 0.5;
          this._toWorld(_a.set(0, -0.3, 2.2)); this.hitPlayer(player, _a, 2.5, D.charge); this.hitPlayer(player, this.headPos, 1.7, D.charge);
          if (Math.random() < dt * 30) fx.dust(this.pos, 1, 2, 0.9);
          const f = this.fwd; const passed = (dx * f.x + dz * f.z) < -5;
          if (ct > 1.7 || (passed && ct > 0.5) || Math.hypot(this.pos.x, this.pos.z) > ARENA_R - 6) { this.data.skid = t; this.data.v = this.speed; }
        } else {
          const st = t - this.data.skid; const v = this.data.v * Math.max(0, 1 - st / 0.6);
          this._move(v, dt); this.speed = v; if (v > 1 && Math.random() < dt * 40) fx.dust(this.pos, 1, 2.2, 1.0);
          if (st > 1.5) this._endAtk(0.4);
        }
        break;
      }
      case 'slam': {
        const T0 = 0.85, T1 = 1.62;
        if (t < T0) { this._turn(Math.atan2(this.data.to.x - this.pos.x, this.data.to.z - this.pos.z), 2.5, dt); rideT = 1.75; pitchT = -0.12; this.hPitchT = 0.2; }
        else if (t < T1) {
          if (!this.air) { this.air = true; au.play('swingHeavy'); fx.dust(this.pos, 12, 2.5, 1.0); }
          const p = (t - T0) / (T1 - T0);
          this.pos.lerpVectors(this.data.from, this.data.to, p); this.bodyY = Math.sin(Math.PI * p) * 5.5; pitchT = lerp(-0.35, 0.3, p); rideT = 2.5;
        } else {
          if (this.air) {
            this.air = false; this.bodyY = 0; this.pos.copy(this.data.to);
            for (let i = 0; i < 4; i++) this._home(i, this.legs[i].pos);
            au.play('slam'); fx.addShake(1.0); fx.ring(this.pos.x, this.pos.z, 9, 0.55); fx.ring(this.pos.x, this.pos.z, 6, 0.4, 0xff7030);
            fx.dust(this.pos, 34, 5, 1.4); fx.embers(this.pos, 30, 4, 7);
            if (!player.airborne) this.hitPlayer(player, _a.copy(this.pos).setY(player.pos.y + 1), 7.3, D.slam);
          }
          rideT = t < T1 + 0.3 ? 1.6 : 2.5;
          if (t > 3.0) this._endAtk(0.5);
        }
        break;
      }
      case 'spit': {
        const shots = rage ? 3 : 1;
        this._turn(ang, 1.2, dt);
        if (t < 0.7) { this.hPitchT = 0.5; this.hExtT = 0.8; this.jawT = t / 0.7; }
        else { this.hPitchT = 0.05; this.jawT = 1; }
        this.mouthGlow.intensity = this.jawOpen * 60;
        this.data.n = this.data.n || 0;
        if (this.data.n < shots && t > 0.7 + this.data.n * 0.32) {
          const k = this.data.n++;
          const tp = V().copy(player.pos).addScaledVector(player.vel, 0.55);
          if (k > 0) { tp.x += (Math.random() - 0.5) * 9; tp.z += (Math.random() - 0.5) * 9; }
          this.world.clampToArena(tp, 1);
          this._fire(tp, player);
        }
        if (t > 0.7 + shots * 0.32 + 0.9) { this.mouthGlow.intensity = 0; this._endAtk(0.4); }
        break;
      }
      case 'erupt': {
        this.headTrack = false;
        if (t < 1.1) { pitchT = -0.3; rideT = 3.0; this.hPitchT = 0.5; this.jawT = 1; if (!this.data.s) { this.data.s = 1; au.play('growl'); } }
        else {
          if (!this.data.f) {
            this.data.f = 1; au.play('slam'); fx.addShake(0.7); this._toWorld(_a.set(0, -2, 2.4)); fx.dust(_a, 16, 2.5, 1.1); fx.ring(_a.x, _a.z, 6, 0.4, 0xff7030);
            for (let k = 0; k < 8; k++) {
              const a = Math.random() * 6.28, d = k === 0 ? 0 : 2.5 + Math.random() * 8;
              const p = V().set(player.pos.x + Math.cos(a) * d, 0, player.pos.z + Math.sin(a) * d); this.world.clampToArena(p, 1);
              fx.telegraph(p.x, p.z, 3.1, 1.05 + k * 0.16, () => this._explode(p, 3.1, D.erupt, player));
            }
          }
          pitchT = 0.1; rideT = 2.2; this.hPitchT = -0.3;
          if (t > 2.7) this._endAtk(0.6);
        }
        break;
      }
      case 'flinch': {
        this.headTrack = false; const p = t / this.data.dur;
        this.hPitchT = 0.5 * Math.sin(Math.min(1, p * 2.5) * Math.PI) + 0.1; this.hYawT = Math.sin(t * 9) * 0.5 * (1 - p); this.jawT = 0.8 * (1 - p);
        lungeT = -0.9 * (1 - p); rollT = Math.sin(t * 11) * 0.08 * (1 - p);
        if (p >= 1) { this.setState('hunt'); this.cool = 0.35; }
        break;
      }
      case 'topple': {
        this.headTrack = false; const s = this.data.side;
        const down = t < 4.3;
        rollT = down ? s * 1.25 : 0; rideT = down ? 1.35 : 2.5; this.hPitchT = down ? -0.35 : 0; this.hYawT = down ? Math.sin(t * 5) * 0.3 : 0; this.jawT = down ? 0.5 + Math.sin(t * 7) * 0.3 : 0;
        if (down) for (let i = 0; i < 4; i++) {
          const leg = this.legs[i]; if (!leg.override) leg.override = leg.pos.clone();
          this._toWorld(_a.copy(this.hipLocal[i]).add(_b.set(leg.side * 1.3, -1.6 + Math.sin(t * 6 + i * 1.7) * 0.5, (leg.front ? 0.8 : -0.8) + Math.cos(t * 5 + i) * 0.6)));
          leg.override.lerp(_a, 1 - Math.exp(-8 * dt));
        } else if (this.legs[0].override) for (let i = 0; i < 4; i++) { this.legs[i].override = null; this._home(i, this.legs[i].pos); }
        if (!this.data.s && t > 0.35) { this.data.s = 1; fx.dust(this.pos, 26, 4, 1.3); fx.addShake(0.7); this.audio.play('slam'); }
        if (t > 5.3) { this.setState('hunt'); this.cool = 0.4; }
        break;
      }
      case 'dead': {
        this.headTrack = false; this.deadT += dt; const s = this.data.side;
        rollT = s * 1.1 * smooth(0.3, 1.6, t); rideT = lerp(2.5, 1.3, smooth(0.2, 1.5, t)); this.hPitchT = t < 1 ? 0.5 : -0.45; this.jawT = t < 1.2 ? 1 : 0.35; this.hYawT = s * 0.4;
        if (!this.data.s && t > 1.3) { this.data.s = 1; fx.dust(this.pos, 30, 4.5, 1.4); fx.addShake(0.8); this.audio.play('slam'); }
        break;
      }
    }
    this.world.clampToArena(this.pos, 4.5);
    const k = 1 - Math.exp(-7 * dt);
    this.rideH = lerp(this.rideH, rideT, k); this.pitch = lerp(this.pitch, pitchT, k); this.roll = lerp(this.roll, rollT, 1 - Math.exp(-5 * dt)); this.lunge = lerp(this.lunge, lungeT, 1 - Math.exp(-10 * dt));
    this._ctx = { dist, ang };
  }
  _endAtk(cool) { this.setState('hunt'); this.cool = cool * (this.enraged ? 0.45 : 1) + Math.random() * 0.35; }

  _fire(target, player) {
    const m = this.pjPool.find(p => !p.visible); if (!m) return;
    const from = this.mouthPos(V()); const dur = 0.95;
    m.visible = true; m.position.copy(from);
    this.projectiles.push({ m, from, to: target.clone().setY(this.world.heightAt(target.x, target.z)), t: 0, dur, player });
    this.fx.telegraph(target.x, target.z, 2.9, dur);
    this.audio.play('spit'); this.fx.embers(from, 10, 0.4, 3);
  }
  _explode(p, r, dmg, player) {
    this.audio.play('explode'); this.fx.column(p.x, p.z, r * 0.3, 11); this.fx.ring(p.x, p.z, r * 1.3, 0.4, 0xff7030);
    _a.copy(p).setY(this.world.heightAt(p.x, p.z)); this.fx.embers(_a, 26, r * 0.6, 12); this.fx.dust(_a, 8, r * 0.7, 1.0, [0.22, 0.18, 0.16], 3);
    _a.y += 1; this.fx.flashLight(_a, 45);
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    this.fx.addShake(clamp(0.5 - d / 40, 0.1, 0.5));
    if (d < r + 0.3 && !this.dead && !player.dead) player.takeHit(dmg * (this.enraged ? 1.2 : 1), _b.copy(p), true);
  }

  // ── 매 프레임 ──────────────────────────────────────────
  update(dt, player) {
    this.breath += dt * (this.enraged ? 3.2 : 1.8);
    this._ai(dt, player);
    this._bodyXform();
    this.torsoG.position.copy(this.bodyPos); this.torsoG.quaternion.copy(this.bodyQ);
    const br = 1 + Math.sin(this.breath) * 0.018; this.torsoG.scale.set(br, br, 1);

    // 다리
    const grounded = [true, true];
    for (const l of this.legs) if (l.stepping) grounded[l.group] = false;
    for (let i = 0; i < 4; i++) {
      const l = this.legs[i];
      const home = this._home(i, _a);
      const hv = _b.subVectors(home, l.prevHome).divideScalar(Math.max(dt, 1e-4)); l.prevHome.copy(home);
      if (this.air) { this._toWorld(l.pos.copy(this.hipLocal[i]).add(_c.set(l.side * 0.7, -1.9, l.front ? 0.9 : -0.6))); l.stepping = false; }
      else if (l.override) { l.pos.copy(l.override); l.stepping = false; }
      else if (l.stepping) {
        l.stepT += dt / l.dur; const p = Math.min(1, l.stepT);
        l.to.copy(home).addScaledVector(hv, l.dur * 0.45 * (1 - p)); l.to.y = this.world.heightAt(l.to.x, l.to.z);
        l.pos.lerpVectors(l.from, l.to, easeInOut(p)); l.pos.y += Math.sin(Math.PI * p) * l.lift;
        if (p >= 1) {
          l.stepping = false;
          const near = player ? clamp(1.4 - Math.hypot(player.pos.x - l.pos.x, player.pos.z - l.pos.z) / 22, 0, 1) : 0;
          if (!this.dead) { this.audio.play('thud', 0.35 + near * 0.45); this.fx.addShake(near * 0.10); this.fx.dust(l.pos, 3, 0.5, 0.6); }
        }
      } else if (this.state !== 'dead' && this.state !== 'topple') {
        const d = Math.hypot(home.x - l.pos.x, home.z - l.pos.z), hs = hv.length();
        const thr = 0.9 + Math.min(1.2, hs * 0.05);
        if ((d > thr && grounded[1 - l.group]) || d > thr * 2.4) {
          l.stepping = true; l.stepT = 0; l.from.copy(l.pos); l.dur = clamp(0.34 - hs * 0.011, 0.11, 0.34); l.lift = clamp(0.45 + d * 0.25, 0.4, 1.3);
          grounded[l.group] = false;
        }
        l.pos.y = damp(l.pos.y, this.world.heightAt(l.pos.x, l.pos.z), 20, dt);
      }
      // IK
      this._toWorld(l.hipW.copy(this.hipLocal[i]));
      _c.copy(l.pos); _c.y += 0.42; // 발목
      const bend = _k.set(l.side * (l.front ? 0.6 : 0.5), l.front ? 0.25 : 0.5, l.front ? -0.8 : 0.75).applyQuaternion(this.bodyQ);
      solveIK(l.hipW, _c, this.L1, this.L2, bend, l.kneeW);
      placeSegment(l.up, l.hipW, l.kneeW); placeSegment(l.lo, l.kneeW, _c);
      l.knee.position.copy(l.kneeW); l.hip.position.copy(l.hipW); l.hip.quaternion.copy(this.bodyQ);
      l.foot.position.copy(_c).y -= 0.42; l.foot.rotation.set(0, this.yaw + l.side * 0.25, 0);
    }

    // 머리
    const nb = this._toWorld(_a.set(0, 0.45, 2.75));
    if (this.headTrack && player) {
      const dx = player.pos.x - nb.x, dz = player.pos.z - nb.z, hd = Math.hypot(dx, dz);
      this.hYawT += clamp(angDiff(this.yaw, Math.atan2(dx, dz)), -1.05, 1.05);
      this.hPitchT += clamp(Math.atan2(player.pos.y + 1.3 - nb.y, hd + 2.5), -0.7, 0.2);
    }
    const hk = 1 - Math.exp(-(this.state === 'bite' ? 16 : 7) * dt);
    this.headYaw = lerp(this.headYaw, this.hYawT, hk); this.headPitch = lerp(this.headPitch, this.hPitchT, hk);
    this.headExt = lerp(this.headExt, this.hExtT, hk); this.jawOpen = lerp(this.jawOpen, this.jawT, 1 - Math.exp(-14 * dt));
    const ny = this.yaw + this.headYaw * 0.7, np = this.headPitch * 0.75 + 0.12;
    this.headPos.set(Math.sin(ny) * Math.cos(np), Math.sin(np), Math.cos(ny) * Math.cos(np)).multiplyScalar(2.5 * this.headExt).add(nb);
    const minY = this.world.heightAt(this.headPos.x, this.headPos.z) + 0.75; if (this.headPos.y < minY) this.headPos.y = minY;
    _e.set(-this.headPitch + this.roll * 0.0, this.yaw + this.headYaw, this.roll * 0.6, 'YXZ');
    this.head.position.copy(this.headPos); this.head.quaternion.setFromEuler(_e);
    this.jaw.rotation.x = this.jawOpen * 0.75;
    placeSegment(this.neck, nb, _b.set(0, 0.05, -0.75).applyQuaternion(this.head.quaternion).add(this.headPos));
    this.neckJ.position.copy(nb); this.neckJ.quaternion.copy(this.bodyQ); this.headJ.position.copy(_b); this.headJ.quaternion.copy(this.head.quaternion);

    // 꼬리
    const wag = Math.sin(this.breath * 0.9) * 0.5;
    for (let i = 0; i < this.TN; i++) {
      this._toWorld(_a.set(Math.sin(this.breath * 0.9 - i * 0.5) * 0.12 * i + wag * 0.05 * i, 0.0 - i * 0.2 + (i > 4 ? (i - 4) * (i - 4) * 0.075 : 0), -2.85 - i * this.TSP));
      const gy = this.world.heightAt(_a.x, _a.z) + 0.55; if (_a.y < gy) _a.y = gy;
      if (i === 0) { this.tail[0].copy(_a); continue; }
      const n = this.tail[i];
      n.lerp(_a, 1 - Math.exp(-(11 - i * 0.75) * dt));
      _b.subVectors(n, this.tail[i - 1]); const l = _b.length() || 1; n.copy(this.tail[i - 1]).addScaledVector(_b, this.TSP / l);
    }
    for (let i = 0; i < this.TN - 1; i++) if (this.tailSeg[i].visible) placeSegment(this.tailSeg[i], this.tail[i], this.tail[i + 1]);
    if (this.clubLoose) {
      if (this.clubVel) {
        this.clubVel.y -= 22 * dt; this.clubPos.addScaledVector(this.clubVel, dt);
        this.world.clampToArena(this.clubPos, 2);
        const gy = this.world.heightAt(this.clubPos.x, this.clubPos.z) + 0.55;
        if (this.clubPos.y < gy) { this.clubPos.y = gy; this.fx.dust(this.clubPos, 8, 0.8, 0.7); this.audio.play('thud', 0.6); this.clubVel = null; }
        this.club.rotation.x += dt * 7;
      }
      this.club.position.copy(this.clubPos);
    } else { this.club.position.copy(this.tail[this.TN - 1]); this.club.rotation.y += dt * 0.0; this.club.quaternion.copy(this.tailSeg[this.TN - 2].quaternion); }

    // 발광
    const gT = this.dead ? Math.max(0, 1 - this.deadT / 4.5) * 0.9 : (this.enraged ? 2.6 + Math.sin(this.breath * 2.3) * 0.7 : 0.85 + Math.sin(this.breath) * 0.2);
    this.glow = damp(this.glow, gT, 3, dt);
    this.hide.emissiveIntensity = this.glow; this.plateMat.emissiveIntensity = this.glow * 0.85;
    this.eyeMat.color.setRGB(4 * Math.min(1, this.glow + 0.2), (this.enraged ? 0.6 : 1.6) * Math.min(1, this.glow), 0.3 * Math.min(1, this.glow));
    this.chestLight.position.copy(this.bodyPos).y -= 1.0; this.chestLight.intensity = this.glow * 14;
    if (this.enraged && Math.random() < dt * 22) { this._toWorld(_a.set((Math.random() - 0.5) * 2, 1.4, (Math.random() - 0.5) * 5)); this.fx.embers(_a, 1, 0.3, 3.5); }

    // 투사체
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; p.t += dt; const k = Math.min(1, p.t / p.dur);
      p.m.position.lerpVectors(p.from, p.to, k); p.m.position.y += Math.sin(Math.PI * k) * 6;
      p.m.scale.setScalar(0.9 + Math.sin(p.t * 30) * 0.12);
      if (Math.random() < 0.8) this.fx.embers(p.m.position, 1, 0.2, 1);
      if (k >= 1) { p.m.visible = false; this._explode(p.to, 2.9, CFG.dmg.spit, p.player); this.projectiles.splice(i, 1); }
    }

    this._collectSpheres();
  }

  _collectSpheres() {
    const s = this.spheres; let n = 0;
    const put = (c, r, part) => { const e = s[n] || (s[n] = { c: V(), r: 0, part: '' }); e.c.copy(c); e.r = r; e.part = part; n++; };
    put(this.headPos, 1.2, 'head');
    put(_a.addVectors(this.headPos, this.neck.position).multiplyScalar(0.5), 0.95, 'head');
    put(this._toWorld(_a.set(0, 0, 1.6)), 1.75, 'body');
    put(this._toWorld(_a.set(0, 0.1, -0.2)), 1.65, 'body');
    put(this._toWorld(_a.set(0, 0, -1.9)), 1.45, 'body');
    for (const l of this.legs) { put(l.kneeW, 0.7, 'legs'); put(_a.copy(l.pos).setY(l.pos.y + 0.6), 0.8, 'legs'); put(_a.addVectors(l.kneeW, l.pos).multiplyScalar(0.5).setY(_a.y + 0.3), 0.6, 'legs'); }
    const tn = this.tailCut ? 6 : this.TN;
    for (let i = 1; i < tn; i++) put(this.tail[i], i === this.TN - 1 ? 1.0 : lerp(0.85, 0.5, i / this.TN), 'tail');
    s.length = n;
  }
  // 록온 조준점
  focusPoint(out) { return out.copy(this.bodyPos).lerp(this.headPos, 0.35); }
}
