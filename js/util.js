// 공용 수학/노이즈/절차적 텍스처 도구
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeIn = t => { t = clamp(t, 0, 1); return t * t * t; };
export const easeInOut = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function h2(x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += noise2(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
export function noise3(x, y, z) {
  // 2D 노이즈 두 장을 섞은 간이 3D 노이즈
  const zi = Math.floor(z), zf = z - zi, w = zf * zf * (3 - 2 * zf);
  const a = noise2(x + zi * 37.7, y + zi * 17.3), b = noise2(x + (zi + 1) * 37.7, y + (zi + 1) * 17.3);
  return a + (b - a) * w;
}

// 주기적(타일링) 노이즈 — 텍스처용
function pnoise(x, y, p) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (i, j) => h2(((i % p) + p) % p, ((j % p) + p) % p);
  const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function pfbm(x, y, p, oct) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += pnoise(x, y, p) * a; n += a; a *= 0.5; x *= 2; y *= 2; p *= 2; }
  return s / n;
}

function canvasTex(size, fill) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const img = g.createImageData(size, size);
  fill(img.data);
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// 높이맵에서 디테일 맵 + 노멀 맵 생성
export function makeSurfaceTextures(size, { base = 8, oct = 5, ridge = false, strength = 3.0, lo = 0.62, hi = 1.0 } = {}) {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = pfbm(x / size * base, y / size * base, base, oct);
    if (ridge) v = 1 - Math.abs(v * 2 - 1);
    H[y * size + x] = v;
  }
  const at = (x, y) => H[((y + size) % size) * size + ((x + size) % size)];
  const map = canvasTex(size, d => {
    for (let i = 0; i < size * size; i++) {
      const v = Math.round(255 * lerp(lo, hi, H[i]));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
  });
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = canvasTex(size, d => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (-dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  });
  return { map, normalMap };
}

// 용암 균열(보로노이 경계) 발광 맵
export function makeCrackTexture(size, cells = 7, seed = 5) {
  const rnd = mulberry32(seed);
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + rnd()) / cells, (j + rnd()) / cells]);
  const t = canvasTex(size, d => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
      let d1 = 9, d2 = 9;
      for (let oj = -1; oj <= 1; oj++) for (let oi = -1; oi <= 1; oi++) {
        const ii = ((ci + oi) % cells + cells) % cells, jj = ((cj + oj) % cells + cells) % cells;
        const p = pts[jj * cells + ii];
        let dx = Math.abs(p[0] - u), dy = Math.abs(p[1] - v);
        dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy);
        const dd = Math.hypot(dx, dy);
        if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
      }
      const e = (d2 - d1) * cells;
      const glow = Math.pow(1 - smooth(0.0, 0.085, e), 2.0) * smooth(0.38, 0.62, pfbm(u * 5, v * 5, 5, 3));
      const i = (y * size + x) * 4;
      d[i] = 255 * glow; d[i + 1] = 255 * glow * glow * 0.75; d[i + 2] = 255 * glow * glow * glow * 0.4; d[i + 3] = 255;
    }
  });
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeDotTexture(size = 64, hard = 0) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, size * 0.5 * hard, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// 두 점 사이에 단위 길이(+Z) 메시를 배치
const _Z = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3();
export function placeSegment(mesh, a, b) {
  _d.subVectors(b, a);
  const len = _d.length() || 0.0001;
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(_Z, _d.divideScalar(len));
  mesh.scale.z = len;
}

// 2관절 IK: 관절 위치를 out 에 기록, 닿지 않으면 끝점을 당겨 옴
const _n = new THREE.Vector3(), _b = new THREE.Vector3();
export function solveIK(root, target, l1, l2, bend, out) {
  _n.subVectors(target, root);
  let d = _n.length();
  const max = (l1 + l2) * 0.995;
  if (d > max) { target.copy(root).addScaledVector(_n, max / d); d = max; }
  if (d < 0.001) d = 0.001;
  _n.divideScalar(d);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _b.copy(bend).addScaledVector(_n, -bend.dot(_n));
  if (_b.lengthSq() < 1e-6) _b.set(0, 1, 0);
  _b.normalize();
  out.copy(root).addScaledVector(_n, a).addScaledVector(_b, h);
  return out;
}

// +Z 방향 단위 길이 테이퍼 원기둥
export function segGeo(r0, r1, radial = 10) {
  const g = new THREE.CylinderGeometry(r1, r0, 1, radial, 1);
  g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5);
  return g;
}
