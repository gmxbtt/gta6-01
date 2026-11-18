// overlay.js — everything drawn over the 3D view: cash, health, speed,
// wanted stars with the level's name, the objective line, toasts, the canvas
// minimap (with a zoom toggle), and the start / pause / busted / wasted /
// job-complete menus.

import { WORLD, WANTED } from './tuning.js';

export class Overlay {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of [
      'hud', 'cash', 'health-fill', 'speed-num', 'wanted-stars', 'wanted-name',
      'objective', 'objective-timer', 'minimap', 'toast', 'menu-start',
      'menu-pause', 'menu-busted', 'menu-wasted', 'mission-card',
      'mission-title', 'mission-payout', 'btn-play', 'btn-continue',
      'btn-resume', 'btn-quit', 'btn-busted-retry', 'btn-wasted-retry',
      'btn-mission-ok', 'save-line', 'heat-flash',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.map = this.el.minimap.getContext('2d');
    this.zoomLevels = [1, 1.8, 3];
    this.zoomIdx = 0;
    this._toastTimer = 0;
    this._bindButtons();
  }

  _bindButtons() {
    const g = this.game;
    this.el['btn-play'].addEventListener('click', () => { g.sfx.boot(); g.sfx.ui(); g.startGame(false); });
    this.el['btn-continue'].addEventListener('click', () => { g.sfx.boot(); g.sfx.ui(); g.startGame(true); });
    this.el['btn-resume'].addEventListener('click', () => { g.sfx.ui(); g.resume(); });
    this.el['btn-quit'].addEventListener('click', () => { g.sfx.ui(); g.toMenu(); });
    this.el['btn-busted-retry'].addEventListener('click', () => { g.sfx.ui(); g.startGame(true); });
    this.el['btn-wasted-retry'].addEventListener('click', () => { g.sfx.ui(); g.startGame(true); });
    this.el['btn-mission-ok'].addEventListener('click', () => {
      g.sfx.ui();
      this.el['mission-card'].classList.add('hidden');
    });
  }

  showStart(hasSave, cash, doneCount) {
    this._hideAllMenus();
    this.el['menu-start'].classList.remove('hidden');
    this.el['btn-continue'].classList.toggle('hidden', !hasSave);
    this.el['save-line'].textContent = hasSave
      ? `Save found — $${cash} banked, ${doneCount}/5 jobs done.`
      : 'No save yet — a fresh start in Solmar Bay.';
  }

  showPause() {
    this._hideAllMenus();
    this.el['menu-pause'].classList.remove('hidden');
  }

  showBusted() {
    this._hideAllMenus();
    this.el['menu-busted'].classList.remove('hidden');
  }

  showWasted() {
    this._hideAllMenus();
    this.el['menu-wasted'].classList.remove('hidden');
  }

  showMissionCard(def) {
    this.el['mission-title'].textContent = `${def.name} — complete`;
    this.el['mission-payout'].textContent = `Payout $${def.payout} — ${def.blurb}`;
    this.el['mission-card'].classList.remove('hidden');
  }

  hideMenus() { this._hideAllMenus(); }

  _hideAllMenus() {
    for (const id of ['menu-start', 'menu-pause', 'menu-busted', 'menu-wasted', 'mission-card']) {
      this.el[id].classList.add('hidden');
    }
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    this._toastTimer = 4;
  }

  toggleZoom() {
    this.zoomIdx = (this.zoomIdx + 1) % this.zoomLevels.length;
    this.toast(`Minimap zoom ${this.zoomLevels[this.zoomIdx].toFixed(1)}x`);
  }

  update(dt) {
    const g = this.game;
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.el.toast.classList.add('hidden');
    }
    this.el.cash.textContent = `$${g.store.data.cash}`;
    this.el['health-fill'].style.width = `${Math.max(0, g.hero.health)}%`;
    const ride = g.hero.inRide;
    this.el['speed-num'].textContent = ride ? `${Math.round(ride.speedKmh)}` : '0';
    const w = g.cops.wanted;
    this.el['wanted-stars'].textContent = '★'.repeat(w) + '☆'.repeat(5 - w);
    this.el['wanted-name'].textContent = WANTED.names[w];
    this.el['wanted-name'].classList.toggle('hot', w >= 3);
    this.el.objective.textContent = g.jobs.objectiveText();
    const a = g.jobs.active;
    this.el['objective-timer'].textContent = a && a.def.timeLimit ? `⏱ ${Math.max(0, Math.ceil(a.timer))}s` : '';
    this.el['heat-flash'].style.opacity = w > 0 ? String(0.12 + 0.08 * Math.sin(g.time * 6)) : '0';
    this._drawMinimap();
  }

  _drawMinimap() {
    const ctx = this.map;
    const S = 180;
    const zoom = this.zoomLevels[this.zoomIdx];
    const span = (WORLD.bound * 2) / zoom;
    const px = this.game.hero.pos.x;
    const pz = this.game.hero.pos.z;
    const toMap = (x, z) => [
      S / 2 + ((x - px) / span) * S,
      S / 2 + ((z - pz) / span) * S,
    ];
    ctx.fillStyle = '#10141c';
    ctx.fillRect(0, 0, S, S);
    // Water on the east edge.
    const [wx0] = toMap(WORLD.waterX, 0);
    ctx.fillStyle = '#1d5a73';
    ctx.fillRect(wx0, 0, S - wx0, S);
    // Roads.
    ctx.strokeStyle = '#3a3f4a';
    ctx.lineWidth = Math.max(2, 7 * zoom / 2);
    for (const a of WORLD.avenues) {
      let [x0, y0] = toMap(a, -WORLD.bound);
      let [x1, y1] = toMap(a, WORLD.bound);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      [x0, y0] = toMap(-WORLD.bound, a);
      [x1, y1] = toMap(WORLD.bound, a);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#5a6274';
    for (const b of this.game.city.buildings) {
      const [x, y] = toMap(b.x, b.z);
      const w = Math.max(1.5, (b.w / span) * S);
      const h = Math.max(1.5, (b.d / span) * S);
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
    }
    // Pier.
    ctx.fillStyle = '#8a6a42';
    const [px0, py0] = toMap(162, -6);
    const [px1, py1] = toMap(216, 6);
    ctx.fillRect(px0, py0, px1 - px0, py1 - py0);
    // Packages still out there, in cyan.
    ctx.fillStyle = '#00e5ff';
    for (const p of this.game.city.packages) {
      if (p.taken) continue;
      const [x, y] = toMap(p.x, p.z);
      if (x < 0 || x > S || y < 0 || y > S) continue;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // Waypoint: pulsing gold ring.
    const wp = this.game.jobs.waypoint();
    if (wp) {
      const [x, y] = toMap(wp.x, wp.z);
      const r = 7 + 3 * Math.sin(this.game.time * 4);
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, Math.max(3, r), 0, Math.PI * 2); ctx.stroke();
    }
    // Cops as red dots.
    ctx.fillStyle = '#ff3b30';
    for (const c of this.game.cops.cars) {
      const [x, y] = toMap(c.pos.x, c.pos.z);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    for (const c of this.game.cops.cops) {
      const [x, y] = toMap(c.pos.x, c.pos.z);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // Player: white arrow pointing where Rico faces.
    const [hx, hy] = toMap(px, pz);
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(Math.PI - this.game.hero.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North marker.
    ctx.fillStyle = '#9aa3b2';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', 8, 16);
  }
}
