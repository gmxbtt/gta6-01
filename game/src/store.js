// store.js — save to localStorage: cash, finished jobs, found packages and
// stashes, and the best bank balance. One key, one JSON blob, written on
// every payout and pickup so a reload never loses progress.

export const SAVE_KEY = 'solmar-heat-save-v2';

export class Store {
  constructor() {
    this.data = this._fresh();
    this.load();
  }

  _fresh() {
    return { cash: 0, done: [], packages: 0, stashes: 0, best: 0 };
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return false;
      this.data = { ...this._fresh(), ...parsed };
      if (!Array.isArray(this.data.done)) this.data.done = [];
      return true;
    } catch (e) {
      return false;
    }
  }

  save() {
    try {
      this.data.best = Math.max(this.data.best, this.data.cash);
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
      return true;
    } catch (e) {
      return false;
    }
  }

  reset() {
    this.data = this._fresh();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
  }
}
