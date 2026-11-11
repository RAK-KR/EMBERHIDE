// 효과음: Web Audio 합성 (외부 파일 없음). 저역 위주로 묵직하게.
export class GameAudio {
  constructor() { this.ctx = null; this.muted = false; this.vol = 0.8; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.18;
    this.master.connect(comp); comp.connect(c.destination);
    const len = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = w * 0.5 + last * 6; }
    this.shaper = c.createWaveShaper(); const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const x = i / 256 - 1; curve[i] = Math.tanh(x * 3.2); }
    this.shaper.curve = curve; this.shaper.connect(this.master);
    this._wind();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.vol; }
  _noise(dur, type, f0, f1, q, vol, at = 0, dest) {
    const c = this.ctx, t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  _tone(type, f0, f1, dur, vol, at = 0, dest) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _wind() {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.10;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.11; const lg = c.createGain(); lg.gain.value = 140;
    lfo.connect(lg); lg.connect(f.frequency);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(); lfo.start();
  }
  play(name, p = 1) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'swing': this._noise(0.20, 'bandpass', 380 * p, 1250 * p, 1.4, 0.26); break;
      case 'swingHeavy': this._noise(0.32, 'bandpass', 220, 980, 1.2, 0.40); this._tone('sine', 110, 55, 0.25, 0.18); break;
      case 'hit': // 살을 가르는 묵직한 타격
        this._tone('sine', 150, 46, 0.20, 0.75); this._noise(0.14, 'lowpass', 2400, 240, 0.8, 0.55);
        this._tone('triangle', 310 * p, 190, 0.09, 0.22); break;
      case 'hitHeavy':
        this._tone('sine', 120, 34, 0.42, 1.0, 0, this.shaper); this._noise(0.30, 'lowpass', 3200, 160, 0.7, 0.75);
        this._tone('sawtooth', 240, 90, 0.16, 0.20); break;
      case 'counter': // 쇠가 맞부딪는 소리 — 중역대 비정수배 배음
        for (const [f, v] of [[412, 0.30], [655, 0.22], [987, 0.13], [233, 0.26]]) this._tone('triangle', f, f * 0.985, 0.55, v);
        this._noise(0.08, 'bandpass', 1800, 900, 2, 0.40); this._tone('sine', 90, 40, 0.3, 0.6); break;
      case 'roll': this._noise(0.26, 'lowpass', 700, 180, 0.7, 0.30); break;
      case 'step': this._noise(0.07, 'lowpass', 420, 150, 0.8, 0.10 * p); break;
      case 'hurt': this._tone('sine', 190, 52, 0.30, 0.8); this._noise(0.22, 'lowpass', 1500, 200, 0.8, 0.5); break;
      case 'thud': this._tone('sine', 62, 28, 0.38, 0.85 * p, 0, this.shaper); this._noise(0.25, 'lowpass', 300, 60, 0.7, 0.45 * p); break;
      case 'slam': this._tone('sine', 78, 22, 0.9, 1.0, 0, this.shaper); this._noise(0.8, 'lowpass', 900, 50, 0.7, 0.85); this._noise(0.35, 'bandpass', 1400, 300, 0.9, 0.3); break;
      case 'explode': this._tone('sine', 95, 26, 0.6, 0.9, 0, this.shaper); this._noise(0.55, 'lowpass', 1800, 80, 0.7, 0.7); break;
      case 'spit': this._noise(0.35, 'bandpass', 260, 900, 1.5, 0.4); this._tone('sawtooth', 130, 70, 0.3, 0.2); break;
      case 'break': this._noise(0.45, 'bandpass', 900, 220, 1.1, 0.7); this._tone('sine', 140, 36, 0.5, 0.9, 0, this.shaper);
        for (let i = 0; i < 4; i++) this._noise(0.08, 'bandpass', 700 + i * 160, 380, 3, 0.25, 0.05 + i * 0.05); break;
      case 'roar': this._roar(1.9, 1); break;
      case 'growl': this._roar(0.7, 0.55); break;
      case 'potion': this._tone('sine', 260, 390, 0.5, 0.16); this._tone('sine', 195, 292, 0.6, 0.12, 0.08); break;
      case 'gauge': this._tone('triangle', 196, 294, 0.35, 0.22); this._tone('triangle', 294, 440, 0.4, 0.14, 0.07); break;
      case 'ult': this._noise(0.7, 'bandpass', 240, 1500, 1.2, 0.45); this._tone('sawtooth', 73, 147, 0.7, 0.3, 0, this.shaper); break;
      case 'ui': this._tone('triangle', 330, 300, 0.09, 0.2); break;
      case 'down': this._tone('sine', 55, 24, 1.3, 1.0, 0, this.shaper); this._noise(1.1, 'lowpass', 700, 50, 0.7, 0.7); break;
    }
  }
  _roar(dur, vol) {
    const c = this.ctx, t = c.currentTime;
    const out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(vol, t + 0.12);
    out.gain.setValueAtTime(vol, t + dur * 0.65); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(this.shaper);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 2.2; f1.frequency.setValueAtTime(330, t); f1.frequency.linearRampToValueAtTime(520, t + dur * 0.3); f1.frequency.linearRampToValueAtTime(240, t + dur);
    const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 900;
    f1.connect(out); f2.connect(out);
    for (const [det, type] of [[0, 'sawtooth'], [7, 'sawtooth'], [-11, 'square']]) {
      const o = c.createOscillator(); o.type = type; o.detune.value = det * 6;
      o.frequency.setValueAtTime(64, t); o.frequency.linearRampToValueAtTime(96, t + dur * 0.25); o.frequency.exponentialRampToValueAtTime(44, t + dur);
      const lfo = c.createOscillator(); lfo.frequency.value = 23 + det; const lg = c.createGain(); lg.gain.value = 14; lfo.connect(lg); lg.connect(o.frequency);
      const g = c.createGain(); g.gain.value = 0.33; o.connect(g); g.connect(f1); g.connect(f2);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    }
    this._noise(dur, 'bandpass', 500, 260, 0.9, 0.35 * vol);
  }
}
