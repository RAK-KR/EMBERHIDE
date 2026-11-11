// 입력: 키보드/마우스 + 터치(가상 스틱과 버튼)
const KEYMAP = {
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'roll', KeyE: 'counter', KeyF: 'ult', KeyQ: 'potion', KeyR: 'lock', Tab: 'lock', KeyM: 'mute', Escape: 'pause',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = {}; this.buffer = {}; // buffer[action] = 남은 유효 시간
    this.lookX = 0; this.lookY = 0; this.moveX = 0; this.moveY = 0;
    this.enabled = false; this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; this.lookTouch = null;

    addEventListener('keydown', e => {
      const a = KEYMAP[e.code]; if (!a) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.press(a);
      this.held[a] = true;
    });
    addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) this.held[a] = false; });
    addEventListener('blur', () => { this.held = {}; });
    canvas.addEventListener('mousedown', e => {
      if (!this.enabled) return;
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); }
      if (e.button === 0) this.press('attack'); else if (e.button === 2) this.press('heavy'); else if (e.button === 1) { this.press('lock'); e.preventDefault(); }
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (document.pointerLockElement === canvas) { this.lookX += e.movementX; this.lookY += e.movementY; }
    });
    if (this.touch) this._initTouch();
  }
  press(a) { this.buffer[a] = 0.28; }
  // 눌린 입력을 한 번만 소비
  take(a) { if (this.buffer[a] > 0) { this.buffer[a] = 0; return true; } return false; }
  peek(a) { return this.buffer[a] > 0; }
  update(dt) {
    for (const k in this.buffer) if (this.buffer[k] > 0) this.buffer[k] -= dt;
    let x = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0), y = (this.held.up ? 1 : 0) - (this.held.down ? 1 : 0);
    if (this.stick.id !== null) { x = this.stick.x; y = -this.stick.y; }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    this.moveX = x; this.moveY = y;
  }
  consumeLook() { const r = [this.lookX, this.lookY]; this.lookX = this.lookY = 0; return r; }
  releasePointer() { if (document.pointerLockElement) document.exitPointerLock(); }

  _initTouch() {
    document.body.classList.add('touch');
    const base = document.getElementById('stick'), knob = document.getElementById('stickKnob');
    const R = 56;
    const onStart = e => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.target.closest('.tbtn')) continue;
        if (t.clientX < innerWidth * 0.42 && this.stick.id === null) {
          this.stick.id = t.identifier; this.stick.ox = t.clientX; this.stick.oy = t.clientY; this.stick.x = this.stick.y = 0;
          base.style.display = 'block'; base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px'; knob.style.transform = 'translate(-50%,-50%)';
        } else if (!this.lookTouch) this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    };
    const onMove = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy; const l = Math.hypot(dx, dy);
          if (l > R) { dx *= R / l; dy *= R / l; }
          this.stick.x = dx / R; this.stick.y = dy / R; this.held.sprint = l > R * 1.7;
          knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
          this.lookX += (t.clientX - this.lookTouch.x) * 2.2; this.lookY += (t.clientY - this.lookTouch.y) * 2.2;
          this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) { this.stick.id = null; this.stick.x = this.stick.y = 0; this.held.sprint = false; base.style.display = 'none'; }
        if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
      }
    };
    const zone = document.getElementById('touchZone');
    zone.addEventListener('touchstart', onStart, { passive: false });
    zone.addEventListener('touchmove', onMove, { passive: false });
    zone.addEventListener('touchend', onEnd); zone.addEventListener('touchcancel', onEnd);
    for (const b of document.querySelectorAll('.tbtn')) {
      b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); if (this.enabled) this.press(b.dataset.act); b.classList.add('on'); }, { passive: false });
      b.addEventListener('touchend', () => b.classList.remove('on'));
    }
  }
}
