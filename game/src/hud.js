// hud.js — the DOM overlay: wanted stars, cash, health, speed, mission
// objective, messages, and the canvas minimap (streets, player, cops, marker).
import { CITY, STREET_COORDS } from './config.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hud');
    this.starsEl = document.getElementById('wanted');
    this.cashEl = document.getElementById('cash');
    this.healthFill = document.getElementById('health-fill');
    this.healthEl = document.getElementById('health');
    this.speedEl = document.getElementById('speed');
    this.carHealthEl = document.getElementById('car-health');
    this.objectiveEl = document.getElementById('objective');
    this.messageEl = document.getElementById('message');
    this.centerEl = document.getElementById('center-toast');
    this.minimap = document.getElementById('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.vignette = document.getElementById('vignette');
    this._messageTimer = null;
    this._lastCash = -1;
    this._lastWanted = -1;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setObjective(text) {
    this.objectiveEl.textContent = text;
  }

  showMessage(text, kind, seconds) {
    this.messageEl.textContent = text;
    this.messageEl.className = 'show ' + (kind || 'info');
    if (this._messageTimer) clearTimeout(this._messageTimer);
    this._messageTimer = setTimeout(() => {
      this.messageEl.className = '';
    }, (seconds || 4) * 1000);
  }

  flashWanted() {
    this.starsEl.classList.remove('flash');
    void this.starsEl.offsetWidth;
    this.starsEl.classList.add('flash');
  }

  toast(text, seconds) {
    this.centerEl.textContent = text;
    this.centerEl.classList.add('show');
    setTimeout(() => this.centerEl.classList.remove('show'), (seconds || 2.5) * 1000);
  }

  update() {
    const g = this.game;
    const wanted = g.police ? g.police.wantedLevel : 0;
    if (wanted !== this._lastWanted) {
      this._lastWanted = wanted;
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < wanted ? '★' : '☆';
      this.starsEl.textContent = stars;
      this.starsEl.classList.toggle('hot', wanted > 0);
    }
    const cash = g.save.data.cash;
    if (cash !== this._lastCash) {
      this._lastCash = cash;
      this.cashEl.textContent = '$' + cash.toLocaleString('en-US');
    }
    const hp = Math.max(0, Math.round(g.player.health));
    this.healthFill.style.width = hp + '%';
    this.healthFill.classList.toggle('low', hp < 30);
    if (g.player.inCar) {
      const kmh = Math.round(Math.abs(g.player.inCar.speed) * 3.6);
      this.speedEl.textContent = kmh + ' km/h';
      this.speedEl.classList.remove('hidden');
      const ch = Math.max(0, Math.round(g.player.inCar.health));
      this.carHealthEl.textContent = 'CAR ' + ch + '%';
      this.carHealthEl.classList.remove('hidden');
      this.carHealthEl.classList.toggle('low', ch < 30);
    } else {
      this.speedEl.classList.add('hidden');
      this.carHealthEl.classList.add('hidden');
    }
    this.vignette.style.opacity = hp < 35 ? String((35 - hp) / 35 * 0.85) : '0';
    this._drawMinimap();
  }

  _drawMinimap() {
    const ctx = this.mctx;
    const S = this.minimap.width;
    const half = CITY.bound + 10;
    const toMap = (v) => ((v + half) / (half * 2)) * S;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(12, 20, 28, 0.88)';
    ctx.fillRect(0, 0, S, S);
    // Blocks.
    ctx.fillStyle = '#3a4a55';
    for (let ix = 0; ix < STREET_COORDS.length - 1; ix++) {
      for (let iz = 0; iz < STREET_COORDS.length - 1; iz++) {
        const x0 = STREET_COORDS[ix] + CITY.roadHalf;
        const z0 = STREET_COORDS[iz] + CITY.roadHalf;
        const w = CITY.pitch - CITY.roadHalf * 2;
        ctx.fillRect(toMap(x0), toMap(z0), w / (half * 2) * S, w / (half * 2) * S);
      }
    }
    // Roads.
    ctx.strokeStyle = '#8a97a3';
    ctx.lineWidth = 3;
    for (const s of STREET_COORDS) {
      ctx.beginPath(); ctx.moveTo(0, toMap(s)); ctx.lineTo(S, toMap(s)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toMap(s), 0); ctx.lineTo(toMap(s), S); ctx.stroke();
    }
    // Ocean strip at the bottom (south).
    ctx.fillStyle = '#2a6f8f';
    ctx.fillRect(0, toMap(150), S, S - toMap(150));
    // Cash pickups.
    ctx.fillStyle = '#2ecc71';
    for (const pk of this.game.missions.pickups) {
      if (pk.taken) continue;
      ctx.fillRect(toMap(pk.x) - 2, toMap(pk.z) - 2, 4, 4);
    }
    // Mission marker (pulsing yellow diamond).
    const target = this.game.missions.currentTarget();
    if (target) {
      const pulse = 5 + Math.sin(this.game.time * 5) * 2;
      ctx.fillStyle = '#ffd23c';
      ctx.save();
      ctx.translate(toMap(target.x), toMap(target.z));
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      ctx.restore();
    }
    // Traffic (grey dots).
    ctx.fillStyle = '#b0b8c0';
    for (const e of this.game.traffic.cars) {
      ctx.fillRect(toMap(e.car.pos.x) - 1.5, toMap(e.car.pos.z) - 1.5, 3, 3);
    }
    // Police (red dots with a ring).
    ctx.fillStyle = '#ff4040';
    for (const c of this.game.police.cars) {
      ctx.beginPath(); ctx.arc(toMap(c.pos.x), toMap(c.pos.z), 3.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const c of this.game.police.cops) {
      ctx.beginPath(); ctx.arc(toMap(c.x), toMap(c.z), 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow (white, rotated to heading).
    const p = this.game.player;
    const heading = p.inCar ? p.inCar.heading : p.heading;
    ctx.save();
    ctx.translate(toMap(p.pos.x), toMap(p.pos.z));
    // Heading 0 faces +z (down on the map); the arrow points up at rotation 0.
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North marker.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', 6, 14);
  }
}
