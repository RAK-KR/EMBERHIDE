// 밸런스 수치 모음 — 이 파일만 고치면 전투 감각을 조절할 수 있습니다
export const ARENA_R = 46;

export const PLAYER = {
  hp: 100, stamina: 100,
  walk: 5.4, sprint: 8.2,
  staminaRegen: 30, staminaDelay: 0.8, sprintCost: 11,
  rollCost: 22, rollTime: 0.62, rollIframe: 0.40, rollSpeed: 10.5,
  counterCost: 18, counterWindow: 0.42, counterTime: 0.8,
  potions: 5, potionHeal: 45, potionTime: 1.3,
  lives: 3,
  gaugeMax: 300, gaugeSeg: 100,
};

// 태도 모션: wind=준비, act=[판정 시작, 끝], dur=전체 길이, mv=위력, gain=검기 획득
// swing: axis 축을 기준으로 from→to (도) 만큼 칼날이 회전
export const ATTACKS = {
  l1: { dur: 0.60, wind: 0.13, act: [0.13, 0.29], mv: 24, gain: 10, step: 1.3, next: 'l2', swing: { axis: [0.28, 1, 0], from: -120, to: 105 } },
  l2: { dur: 0.60, wind: 0.13, act: [0.13, 0.29], mv: 27, gain: 10, step: 1.1, next: 'l3', swing: { axis: [0.35, -1, 0], from: -115, to: 110 } },
  l3: { dur: 0.70, wind: 0.18, act: [0.18, 0.34], mv: 34, gain: 12, step: 1.0, next: 'l4', swing: { axis: [1, 0, 0], from: -135, to: 62 } },
  l4: { dur: 0.92, wind: 0.22, act: [0.22, 0.46], mv: 46, gain: 18, step: 2.2, next: 'l1', swing: { axis: [-0.12, 1, 0], from: -170, to: 215 }, spin: true },
  heavy: { dur: 0.98, wind: 0.27, act: [0.27, 0.45], mv: 60, gain: 14, step: 1.6, next: 'l1', swing: { axis: [0.75, 0.66, 0], from: -140, to: 80 }, heavy: true },
  heavyG: { dur: 0.98, wind: 0.24, act: [0.24, 0.44], mv: 118, gain: 0, step: 2.4, next: 'l1', swing: { axis: [0.75, 0.66, 0], from: -150, to: 95 }, heavy: true, charged: true },
  counter: { dur: 0.95, wind: 0.10, act: [0.10, 0.30], mv: 150, gain: 150, step: 4.5, next: 'l1', swing: { axis: [0.1, 1, 0], from: -130, to: 130 }, heavy: true, charged: true },
};
// 오의: 연속 참격 후 마무리 일격
export const ULT = { hits: 6, interval: 0.22, mv: 42, finishMv: 190, finishAt: 1.68, dur: 2.5 };

export const MONSTER = {
  name: '켈드락', title: '흑요 갑수',
  hp: 7000,
  walk: 4.6, turn: 1.7,
  enrageAt: [0.7, 0.35], enrageTime: 45,
  parts: {
    head: { ratio: 0.13, mult: 1.25, brokenMult: 1.45, label: '머리' },
    body: { ratio: 0.17, mult: 0.8, brokenMult: 1.1, label: '등 갑각' },
    legs: { ratio: 0.11, mult: 0.7, brokenMult: 0.7, label: '다리' },
    tail: { ratio: 0.12, mult: 1.0, brokenMult: 1.0, label: '꼬리' },
  },
  dmg: { bite: 22, claw: 26, tail: 24, charge: 30, slam: 28, spit: 18, erupt: 20 },
};
