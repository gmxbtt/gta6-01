// save.js — localStorage persistence: cash, mission progress, pickups, bests.
import { GAME } from './config.js';

export class SaveManager {
  constructor() {
    this.data = this._default();
    this.load();
  }

  _default() {
    return {
      cash: GAME.startCash,
      missionsDone: [],
      pickups: [],
      bustedCount: 0,
      wastedCount: 0,
      totalEarned: 0,
      musicOn: true,
    };
  }

  load() {
    try {
      const raw = localStorage.getItem(GAME.saveKey);
      if (!raw) return this.data;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.data = Object.assign(this._default(), parsed);
      }
    } catch (e) {
      // Corrupt save: start fresh rather than crash.
      this.data = this._default();
    }
    return this.data;
  }

  save() {
    try {
      localStorage.setItem(GAME.saveKey, JSON.stringify(this.data));
      return true;
    } catch (e) {
      return false;
    }
  }

  clear() {
    this.data = this._default();
    try { localStorage.removeItem(GAME.saveKey); } catch (e) { /* ignore */ }
    this.save();
  }

  get hasSave() {
    return this.data.missionsDone.length > 0 || this.data.cash !== GAME.startCash || this.data.pickups.length > 0;
  }
}
