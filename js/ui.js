// HUD 와 메뉴
import { PLAYER as PCFG, MONSTER as MCFG } from './config.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor() {
    this.hud = $('hud'); this.boss = $('boss'); this.notice = $('notice'); this.lock = $('lock');
    this.hpFill = $('hpFill'); this.hpGhost = $('hpGhost'); this.stFill = $('stFill');
    this.bossFill = $('bossFill'); this.bossGhost = $('bossGhost');
    this.segEls = [...document.querySelectorAll('#gauge span')]; this.gauge = $('gauge');
    $('bossNm').textContent = MCFG.name; $('bossTitle').textContent = MCFG.title;
    this.parts = {};
    const pe = $('parts');
    for (const k in MCFG.parts) { const s = document.createElement('span'); s.textContent = MCFG.parts[k].label; pe.appendChild(s); this.parts[k] = s; }
    this.hpG = 1; this.bossG = 1; this.bossDelay = 0; this.hpDelay = 0; this.lastBoss = 1; this.lastHp = 1;
  }
  show(on) { this.hud.classList.toggle('hidden', !on); document.body.classList.toggle('playing', on); }
  note(text, cls = '') {
    const d = document.createElement('div'); d.textContent = text; d.className = cls;
    this.notice.innerHTML = ''; this.notice.appendChild(d);
  }
  hitPulse() { this.boss.classList.remove('hitpulse'); void this.boss.offsetWidth; this.boss.classList.add('hitpulse'); }
  update(rdt, player, monster) {
    const hp = player.hp / PCFG.hp, bh = monster.hp / monster.maxHp;
    if (hp < this.lastHp) this.hpDelay = 0.5; this.lastHp = hp;
    if (bh < this.lastBoss) this.bossDelay = 0.55; this.lastBoss = bh;
    this.hpDelay -= rdt; this.bossDelay -= rdt;
    if (this.hpG < hp) this.hpG = hp; else if (this.hpDelay <= 0) this.hpG = Math.max(hp, this.hpG - rdt * 0.6);
    if (this.bossG < bh) this.bossG = bh; else if (this.bossDelay <= 0) this.bossG = Math.max(bh, this.bossG - rdt * 0.35);
    this.hpFill.style.transform = `scaleX(${hp})`; this.hpGhost.style.transform = `scaleX(${this.hpG})`;
    this.hpFill.parentElement.classList.toggle('low', hp < 0.3);
    this.stFill.style.transform = `scaleX(${player.stamina / PCFG.stamina})`;
    this.bossFill.style.transform = `scaleX(${bh})`; this.bossGhost.style.transform = `scaleX(${this.bossG})`;
    for (let i = 0; i < 3; i++) {
      const v = Math.max(0, Math.min(1, player.gauge / PCFG.gaugeSeg - i));
      this.segEls[i].firstChild.style.transform = `scaleX(${v})`; this.segEls[i].classList.toggle('full', v >= 1);
    }
    this.gauge.classList.toggle('max', player.gauge >= PCFG.gaugeMax);
    $('potions').lastChild.textContent = player.potions; $('lives').lastChild.textContent = player.lives;
    this.boss.classList.toggle('on', monster.aware); this.boss.classList.toggle('rage', monster.enraged && !monster.dead);
    for (const k in this.parts) this.parts[k].classList.toggle('broken', monster.parts[k].broken);
  }
  setLock(x, y, on) { this.lock.style.display = on ? 'block' : 'none'; if (on) this.lock.style.transform = `translate(${x}px,${y}px) rotate(45deg)`; }
  result(win, player, monster) {
    $('resTitle').textContent = win ? '수렵 완료' : '수렵 실패';
    const t = player.stats.time, mm = Math.floor(t / 60), ss = String(Math.floor(t % 60)).padStart(2, '0');
    const broken = Object.keys(monster.parts).filter(k => monster.parts[k].broken).map(k => MCFG.parts[k].label);
    const rows = [['소요 시간', `${mm}:${ss}`], ['총 대미지', player.stats.dmg.toLocaleString()], ['최대 일격', player.stats.maxHit], ['명중 횟수', player.stats.hits], ['흘려베기 성공', player.stats.counters], ['부위 파괴', broken.length ? broken.join(' · ') : '없음']];
    $('resStats').innerHTML = rows.map(r => `<div><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
    $('result').classList.remove('hidden');
  }
}
