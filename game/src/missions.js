// missions.js — the story of Rico Vega: four jobs for Lena and Mr. Okafor,
// with waypoints, timers, payouts, and cash pickups hidden around the city.
import { MISSION_DEFS, PICKUP_SPOTS } from './config.js';

export class MissionManager {
  constructor(world, game) {
    this.world = world;
    this.game = game;
    this.defs = MISSION_DEFS;
    this.active = null; // {def, stepIndex, timeLeft}
    this.done = new Set(game.save.data.missionsDone);
    this.pickups = []; // {mesh, x, z, taken}
  }

  get nextMission() {
    return this.defs.find((d) => !this.done.has(d.id)) || null;
  }

  get allDone() {
    return this.defs.every((d) => this.done.has(d.id));
  }

  startMission(def) {
    if (this.active) return false;
    this.active = { def, stepIndex: 0, timeLeft: def.timeLimit || 0 };
    if (!this.game.shotMode) this.game.hud.showMessage(`${def.title} — ${def.brief}`, 'info', 7);
    this.game.audio.click();
    this._refreshObjective();
    return true;
  }

  _refreshObjective() {
    if (!this.active) {
      this.game.hud.setObjective(this.allDone
        ? 'All jobs done. Solmar Bay is yours, Rico.'
        : 'Press M to take the next job.');
      this.world.setBeacon(0, 0, false);
      return;
    }
    const step = this.active.def.steps[this.active.stepIndex];
    if (!step) return;
    this.game.hud.setObjective(`${this.active.def.title}: ${step.text}`);
    if (step.target) this.world.setBeacon(step.target.x, step.target.z, true);
    else this.world.setBeacon(0, 0, false);
  }

  currentTarget() {
    if (!this.active) return null;
    const step = this.active.def.steps[this.active.stepIndex];
    return step && step.target ? step.target : null;
  }

  update(dt) {
    if (!this.active) return;
    const m = this.active;
    const step = m.def.steps[m.stepIndex];
    if (!step) return;
    if (m.def.timeLimit) {
      m.timeLeft -= dt;
      if (m.timeLeft <= 0) {
        this._failMission('Out of time — the job fell through.');
        return;
      }
    }
    if (step.kind === 'steal') {
      if (this.game.player.inCar) this._advanceStep();
      return;
    }
    if (step.kind === 'grab') {
      // Wait for the player to press E near the vault (main.js calls tryGrab).
      return;
    }
    if (step.kind === 'goto' && step.target) {
      const p = this.game.player.pos;
      const d = Math.hypot(p.x - step.target.x, p.z - step.target.z);
      if (d < step.radius) {
        if (step.heat) this.game.police.setWanted(Math.max(this.game.police.wantedLevel, step.heat));
        this._advanceStep();
      }
    }
  }

  // The vault grab (mission 4): press E at the bank.
  tryGrab() {
    if (!this.active) return false;
    const step = this.active.def.steps[this.active.stepIndex];
    if (!step || step.kind !== 'grab') return false;
    const p = this.game.player.pos;
    const d = Math.hypot(p.x - step.target.x, p.z - step.target.z);
    if (d > step.radius + 2) return false;
    this.game.audio.cash();
    this.game.effects.burst(p.x, 1.5, p.z, 'cash');
    this._advanceStep();
    return true;
  }

  _advanceStep() {
    const m = this.active;
    m.stepIndex++;
    if (m.stepIndex >= m.def.steps.length) {
      this._completeMission();
    } else {
      this.game.audio.pickup();
      this._refreshObjective();
    }
  }

  _completeMission() {
    const def = this.active.def;
    this.done.add(def.id);
    this.active = null;
    this.game.addCash(def.payout);
    this.game.save.data.missionsDone = [...this.done];
    this.game.save.data.totalEarned += def.payout;
    this.game.save.save();
    this.game.audio.cash();
    this.game.hud.showMessage(`Job complete: ${def.title} — $${def.payout}`, 'good', 6);
    this.game.hud.setObjective(this.allDone
      ? 'All jobs done. Solmar Bay is yours, Rico.'
      : 'Press M to take the next job.');
    this.world.setBeacon(0, 0, false);
    if (this.allDone) {
      this.game.hud.showMessage('STORY COMPLETE — Rico Vega owns Solmar Bay.', 'good', 10);
    }
  }

  _failMission(reason) {
    this.active = null;
    this.game.audio.fail();
    this.game.hud.showMessage(reason, 'bad', 6);
    this.game.hud.setObjective('Press M to take the next job.');
    this.world.setBeacon(0, 0, false);
  }

  abortMission() {
    if (this.active) this._failMission('Job abandoned.');
  }

  // Cash pickups: spinning green bundles worth $100, hidden around the city.
  initPickups(scene, THREE) {
    const taken = new Set(this.game.save.data.pickups);
    PICKUP_SPOTS.forEach((spot, i) => {
      if (taken.has(i)) return;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.35, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.5, emissive: 0x1a5c2a })
      );
      mesh.position.set(spot.x, 0.9, spot.z);
      mesh.castShadow = true;
      scene.add(mesh);
      this.pickups.push({ mesh, x: spot.x, z: spot.z, index: i, taken: false });
    });
  }

  updatePickups(dt, time) {
    const p = this.game.player.pos;
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      pk.mesh.rotation.y += dt * 2;
      pk.mesh.position.y = 0.9 + Math.sin(time * 3 + pk.index) * 0.15;
      const d = Math.hypot(p.x - pk.x, p.z - pk.z);
      if (d < 2.2) {
        pk.taken = true;
        pk.mesh.visible = false;
        this.game.addCash(100);
        this.game.save.data.pickups.push(pk.index);
        this.game.save.save();
        this.game.audio.pickup();
        this.game.effects.burst(pk.x, 1.2, pk.z, 'cash');
        this.game.hud.showMessage('Found a hidden stash: +$100', 'good');
      }
    }
  }
}
