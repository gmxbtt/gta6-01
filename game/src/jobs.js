// jobs.js — Rico's five story jobs. Each job is a list of steps; a step is
// one clear verb (steal a ride, reach a place, grab a bag, lose the heat,
// sail the boat) so the HUD can always say exactly what to do next.
// Payouts land in the save the moment a job closes.

import { LANDMARKS } from './tuning.js';

const DEFS = [
  {
    id: 'm1',
    name: 'Hot Wheels',
    blurb: 'Steal any ride and drop it at the Chop Shop. No questions asked.',
    payout: 450,
    steps: [
      { type: 'steal', text: 'Steal a car, bike or truck (E to get in)' },
      { type: 'deliver', pos: LANDMARKS.chopShop, radius: 9, text: 'Deliver it to the Chop Shop' },
    ],
  },
  {
    id: 'm2',
    name: 'Bank Run',
    blurb: 'Walk into Solmar Bank, grab the bag, and get to the Safehouse with the SBPD on your tail.',
    payout: 800,
    steps: [
      { type: 'goto', pos: LANDMARKS.bank, radius: 8, onFoot: true, text: 'Get to Solmar Bank on foot' },
      { type: 'grab', pos: LANDMARKS.bank, radius: 8, text: 'Grab the money bag (it is yours now)' },
      { type: 'goto', pos: LANDMARKS.safehouse, radius: 9, text: 'Escape to the Safehouse' },
    ],
  },
  {
    id: 'm3',
    name: 'Pier Pressure',
    blurb: 'A package is waiting on Pier 9. Pick it up and run it to the Marina Bar before the clock runs out.',
    payout: 1200,
    timeLimit: 90,
    steps: [
      { type: 'goto', pos: LANDMARKS.pier, radius: 9, text: 'Reach Pier 9' },
      { type: 'grab', pos: LANDMARKS.pier, radius: 9, text: 'Pick up the package' },
      { type: 'deliver', pos: LANDMARKS.marinaBar, radius: 9, text: 'Deliver it to the Marina Bar' },
    ],
  },
  {
    id: 'm4',
    name: 'Heat Wave',
    blurb: 'The whole SBPD is after you. Survive the manhunt for 45 seconds.',
    payout: 1500,
    steps: [
      { type: 'evade', seconds: 45, text: 'Survive the manhunt — stay free for 45s' },
    ],
  },
  {
    id: 'm5',
    name: 'Harbor Run',
    blurb: 'Take the boat from Pier 9, round the buoy ring in the bay, and bring her home.',
    payout: 2500,
    steps: [
      { type: 'board', pos: LANDMARKS.pier, radius: 10, text: 'Board the boat at Pier 9 (E to get in)' },
      { type: 'sail', pos: LANDMARKS.buoy, radius: 12, text: 'Sail out to the buoy ring' },
      { type: 'sail', pos: LANDMARKS.pier, radius: 12, text: 'Bring the boat back to Pier 9' },
    ],
  },
];

export class Jobs {
  constructor(game) {
    this.game = game;
    this.defs = DEFS;
    this.done = new Set(game.store.data.done || []);
    this.active = null; // { def, stepIndex, timer, evadeTimer }
  }

  get nextDef() {
    return this.defs.find((d) => !this.done.has(d.id)) || null;
  }

  startJob(def) {
    if (this.active) return false;
    this.active = { def, stepIndex: 0, timer: def.timeLimit || 0, evadeTimer: 0 };
    if (def.id === 'm4') this.game.cops.setWanted(3);
    if (def.id === 'm2') this.game.overlay.toast('The bank job is on. Walk in quiet.');
    return true;
  }

  abandon() {
    this.active = null;
  }

  currentStep() {
    return this.active ? this.active.def.steps[this.active.stepIndex] : null;
  }

  waypoint() {
    const step = this.currentStep();
    return step && step.pos ? step.pos : null;
  }

  objectiveText() {
    if (!this.active) {
      const next = this.nextDef;
      return next ? `Next job: ${next.name} — press J to start` : 'All jobs done. Solmar Bay is yours.';
    }
    const step = this.currentStep();
    return `${this.active.def.name}: ${step.text}`;
  }

  _advance() {
    this.active.stepIndex++;
    if (this.active.stepIndex >= this.active.def.steps.length) {
      this._complete();
    }
  }

  _complete() {
    const def = this.active.def;
    this.done.add(def.id);
    this.game.store.data.cash += def.payout;
    this.game.store.data.done = [...this.done];
    this.game.store.save();
    this.active = null;
    this.game.sfx.missionDone();
    this.game.overlay.showMissionCard(def);
    this.game.overlay.toast(`Job done: ${def.name} — $${def.payout}`);
  }

  _fail(reason) {
    this.game.overlay.toast(reason);
    this.active = null;
    this.game.cops.clearWanted();
  }

  update(dt) {
    if (!this.active) return;
    const a = this.active;
    const step = a.def.steps[a.stepIndex];
    const hero = this.game.hero;
    if (a.def.timeLimit) {
      a.timer -= dt;
      if (a.timer <= 0) {
        this._fail(`Out of time on ${a.def.name}.`);
        return;
      }
    }
    const distTo = (pos) => Math.hypot(hero.pos.x - pos.x, hero.pos.z - pos.z);
    switch (step.type) {
      case 'steal':
        if (hero.inRide) this._advance();
        break;
      case 'goto':
        if (step.onFoot && hero.inRide) break;
        if (distTo(step.pos) < step.radius) this._advance();
        break;
      case 'grab':
        if (distTo(step.pos) < step.radius) {
          if (a.def.id === 'm2') this.game.cops.addHeat(2, 'bank robbery');
          this.game.sfx.pickup();
          this._advance();
        }
        break;
      case 'deliver':
        if (hero.inRide && distTo(step.pos) < step.radius) this._advance();
        break;
      case 'board':
        if (hero.inRide && hero.inRide.kind === 'boat') this._advance();
        break;
      case 'sail':
        if (hero.inRide && hero.inRide.kind === 'boat' && distTo(step.pos) < step.radius) this._advance();
        break;
      case 'evade': {
        if (this.game.cops.wanted >= 2) {
          a.evadeTimer += dt;
          if (a.evadeTimer >= step.seconds) this._advance();
        }
        break;
      }
      default:
        break;
    }
  }
}
