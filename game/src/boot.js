// boot.js — the game itself: renderer, lights, camera, the main loop, the
// state machine (menu / playing / paused / busted / wasted), pickups,
// stunt payouts, and the deterministic ?shot= staging the screenshots use.

import * as THREE from 'three';
import { WORLD, LANDMARKS, PARKED_RIDES, PAYOUTS, PALETTE } from './tuning.js';
import { SoundBank } from './sfx.js';
import { KeyPad } from './keys.js';
import { City } from './city.js';
import { Hero } from './hero.js';
import { RideYard } from './rides.js';
import { Traffic } from './flow.js';
import { Crowd } from './crowd.js';
import { Cops } from './cops.js';
import { Jobs } from './jobs.js';
import { Overlay } from './overlay.js';
import { Fx } from './fx.js';
import { Store } from './store.js';
import { Barks } from './barks.js';

export class Game {
  constructor() {
    this.time = 0;
    this.state = 'menu';
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this._shake = { x: 0, y: 0 };
    this.store = new Store();
    this.sfx = new SoundBank();
    this.pad = new KeyPad();
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.id = 'view';
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.pad.bind(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.sky, 130, 460);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.95);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(PALETTE.sun, 1.6);
    sun.position.set(120, 180, 60);
    this.scene.add(sun);
    this.city = new City(this.scene);
    this.yard = new RideYard(this.scene, this.city);
    this.yard.spawnParked(PARKED_RIDES);
    this.hero = new Hero(this.scene);
    this.crowd = new Crowd(this.scene);
    this.traffic = new Traffic(this.yard, this.city);
    this.cops = new Cops(this.scene, this.yard, this.city, this.sfx);
    this.fx = new Fx(this.scene);
    this.barks = new Barks();
    this.crowd.onBark = () => this.overlay.toast(this.barks.ped());
    this.overlay = new Overlay(this);
    this.jobs = new Jobs(this);
    this.jobs.done = new Set(this.store.data.done || []);
    this._applySaveToWorld();
    this._shot = new URLSearchParams(window.location.search).get('shot');
    window.addEventListener('resize', () => this._resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.__game = this;
    this.overlay.showStart(this.store.data.cash > 0 || this.store.data.done.length > 0, this.store.data.cash, this.store.data.done.length);
    if (this._shot) this._stageShot(this._shot);
    this._last = performance.now();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  get save() { return this.store; }

  addHeat(n, reason) { this.cops.addHeat(n, reason); }

  shake(amount) { this.fx.shake(amount); }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _applySaveToWorld() {
    const takenP = this.store.data.packages || 0;
    const takenS = this.store.data.stashes || 0;
    this.city.packages.forEach((p, i) => {
      if (i < takenP) { p.taken = true; p.mesh.visible = false; }
    });
    this.city.stashes.forEach((s, i) => {
      if (i < takenS) { s.taken = true; s.mesh.visible = false; }
    });
  }

  startGame(fromSave) {
    if (!fromSave) {
      this.store.reset();
      this.jobs.done = new Set();
      this._applySaveToWorld();
      for (const p of this.city.packages) { p.taken = false; p.mesh.visible = true; }
      for (const s of this.city.stashes) { s.taken = false; s.mesh.visible = true; }
    }
    this.hero.pos.set(0, 0, 24);
    this.hero.yaw = Math.PI;
    this.hero.health = 100;
    this.hero.vel.set(0, 0, 0);
    if (this.hero.inRide) {
      this.hero.inRide.driver = null;
      this.hero.inRide = null;
      this.hero.mesh.visible = true;
    }
    this.hero.mesh.position.copy(this.hero.pos);
    this.cops.clearWanted();
    this.jobs.active = null;
    this.state = 'playing';
    this.overlay.hideMenus();
    document.getElementById('hud').classList.remove('hidden');
    this.sfx.setMusic('cruise');
  }

  toMenu() {
    this.state = 'menu';
    document.getElementById('hud').classList.add('hidden');
    this.overlay.showStart(this.store.data.cash > 0 || this.store.data.done.length > 0, this.store.data.cash, this.store.data.done.length);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.overlay.showPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.overlay.hideMenus();
  }

  busted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    const fine = Math.floor(this.store.data.cash * 0.15);
    this.store.data.cash -= fine;
    this.store.save();
    this.cops.clearWanted();
    this.sfx.busted();
    this.sfx.sirenSet(false);
    this.overlay.showBusted();
    document.getElementById('busted-fine').textContent = fine > 0 ? `The SBPD fined you $${fine}.` : 'The SBPD let you off with a warning.';
  }

  wasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.sfx.busted();
    this.sfx.sirenSet(false);
    this.overlay.showWasted();
  }

  _stageShot(shot) {
    this.startGame(false);
    const hero = this.hero;
    if (shot === 'chase') {
      const ride = this.yard.rides.find((r) => r.kind === 'sedan');
      hero.pos.set(ride.pos.x + 2, 0, ride.pos.z);
      hero.tryEnterRide(this.yard);
      ride.speed = 18;
      this.cops.setWanted(3);
      this.jobs.startJob(this.jobs.defs[0]);
      this.jobs.active.stepIndex = 1; // already stolen: deliver to the Chop Shop
      this.camYaw = ride.heading + Math.PI;
      // Park two interceptors right on Rico's tail so the chase reads at once.
      const fx = Math.sin(ride.heading);
      const fz = Math.cos(ride.heading);
      for (let i = 0; i < 2; i++) {
        this.cops._spawnCopCar(hero);
        const cop = this.cops.cars[this.cops.cars.length - 1];
        const back = 18 + i * 9;
        const side = (i === 0 ? 3 : -3);
        cop.pos.set(ride.pos.x - fx * back - fz * side, 0, ride.pos.z - fz * back + fx * side);
        cop.mesh.position.copy(cop.pos);
        cop.heading = ride.heading;
        cop.mesh.rotation.y = ride.heading;
        cop.speed = 22;
      }
    } else if (shot === 'drive') {
      const ride = this.yard.rides.find((r) => r.kind === 'taxi');
      hero.pos.set(ride.pos.x + 2, 0, ride.pos.z);
      hero.tryEnterRide(this.yard);
      ride.speed = 22;
      this.camYaw = ride.heading + Math.PI;
    } else if (shot === 'foot') {
      // On foot at the plaza's south-east corner, facing the fountain and the
      // skyline, with pedestrians on the sidewalk beside him.
      hero.pos.set(-18, 0, 18);
      hero.yaw = Math.PI * 0.75;
      this.camYaw = -Math.PI / 4;
    } else if (shot === 'mission') {
      const boat = this.yard.rides.find((r) => r.kind === 'boat');
      hero.pos.set(boat.pos.x - 3, 0, boat.pos.z);
      hero.tryEnterRide(this.yard);
      boat.speed = 6;
      this.jobs.startJob(this.jobs.defs[4]);
      this.jobs.active.stepIndex = 1; // already aboard: sail to the buoy ring
      this.camYaw = boat.heading + Math.PI;
    }
  }

  _frame() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    if (this.state === 'playing') {
      this.time += dt;
      this._update(dt);
    }
    this._updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.pad.endFrame();
  }

  _update(dt) {
    const pad = this.pad;
    const hero = this.hero;
    // Pause.
    if (pad.wasPressed('Escape') || pad.wasPressed('KeyP')) { this.pause(); return; }
    // Minimap zoom.
    if (pad.wasPressed('KeyM')) this.overlay.toggleZoom();
    // Start the next job.
    if (pad.wasPressed('KeyJ') && !this.jobs.active) {
      const next = this.jobs.nextDef;
      if (next) {
        this.jobs.startJob(next);
        this.overlay.toast(`${next.name}: ${this.barks.job(next.id)}`);
        this.sfx.ui();
      }
    }
    // Camera orbit from mouse drag.
    const drag = pad.consumeDrag();
    this.camYaw -= drag.x * 0.005;
    this.camPitch = Math.max(0.08, Math.min(1.1, this.camPitch + drag.y * 0.003));
    // Get in / out of a ride.
    if (pad.wasPressed('KeyE')) {
      if (hero.inRide) {
        hero.exitRide(this.city);
        this.sfx.ui();
      } else {
        const target = this.yard.nearestRide(hero.pos.x, hero.pos.z, 4, { excludeCop: true });
        if (target) {
          const wasDriven = target.driver === 'npc';
          hero.tryEnterRide(this.yard);
          if (!target.stolen) {
            target.stolen = true;
            this.cops.addHeat(wasDriven ? 2 : 1, wasDriven ? 'carjacking' : 'theft');
            this.overlay.toast(wasDriven ? 'Carjacked! The SBPD is on its way.' : 'Stolen! Lay low or lose them.');
          }
          this.sfx.ui();
        }
      }
    }
    // Punch.
    if (pad.wasPressed('KeyF')) {
      const hit = hero.punch(this.crowd, this.cops);
      if (hit) {
        this.sfx.punch();
        if (hit.kind === 'ped') {
          this.cops.addHeat(1, 'assault');
          this.fx.spawnSparks(hero.pos.x, 1.5, hero.pos.z);
        } else if (hit.kind === 'cop') {
          this.cops.addHeat(2, 'assault on an officer');
          this.fx.spawnSparks(hero.pos.x, 1.5, hero.pos.z);
        }
      }
    }
    // Drive or walk.
    if (hero.inRide) {
      hero.pos.copy(hero.inRide.pos);
      hero.yaw = hero.inRide.heading;
      hero.inRide.drive(dt, pad, this.city, this.fx, (amount) => {
        this.store.data.cash += amount;
        this.store.save();
        this.overlay.toast(`${this.barks.stunt()} +$${amount}`);
        this.sfx.coin();
      });
      // Ease the camera behind the car.
      const target = hero.inRide.heading + Math.PI;
      let diff = target - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.camYaw += diff * Math.min(1, dt * 1.5);
    } else {
      hero.update(dt, pad, this.camYaw, this.city, this.yard, this.crowd, this.cops, this);
    }
    this.traffic.update(dt, hero);
    this.crowd.update(dt, hero, hero.inRide);
    this.cops.update(dt, hero, this);
    this.jobs.update(dt);
    this.city.update(dt, this.time);
    this.fx.update(dt);
    this._collectPickups();
    // Slow health regen while clean.
    if (this.cops.wanted === 0 && hero.health > 0 && hero.health < 100) {
      hero.heal(1.5 * dt);
    }
    // Music follows the heat.
    if (this.cops.wanted >= 2) this.sfx.setMusic('chase');
    else if (this.jobs.active && (this.jobs.active.def.id === 'm3' || this.jobs.active.def.id === 'm5')) this.sfx.setMusic('night');
    else this.sfx.setMusic('cruise');
    this.sfx.engineSet(!!hero.inRide, hero.inRide ? Math.abs(hero.inRide.speed) / hero.inRide.tune.top : 0);
    this.sfx.tick();
    this.overlay.update(dt);
    if (hero.health <= 0) this.wasted();
  }

  _collectPickups() {
    const hero = this.hero;
    for (const p of this.city.packages) {
      if (p.taken) continue;
      if (Math.hypot(hero.pos.x - p.x, hero.pos.z - p.z) < 2.2) {
        p.taken = true;
        p.mesh.visible = false;
        this.store.data.packages += 1;
        this.store.data.cash += 150;
        this.sfx.coin();
        const left = this.city.packages.length - this.store.data.packages;
        this.overlay.toast(left > 0 ? `Hidden package! $${150} — ${left} left out there.` : 'All 12 packages! Bonus $1,000.');
        if (left === 0) this.store.data.cash += 1000;
        this.store.save();
      }
    }
    for (const s of this.city.stashes) {
      if (s.taken) continue;
      if (Math.hypot(hero.pos.x - s.x, hero.pos.z - s.z) < 2.2) {
        s.taken = true;
        s.mesh.visible = false;
        this.store.data.stashes += 1;
        this.store.data.cash += 250;
        this.sfx.coin();
        this.overlay.toast(`Cash stash! +$250`);
        this.store.save();
      }
    }
  }

  _updateCamera(dt) {
    const hero = this.hero;
    const dist = hero.inRide ? 13 : 9.5;
    const height = hero.inRide ? 5.5 : 4.2;
    const focus = hero.inRide ? hero.inRide.pos : hero.pos;
    const cx = focus.x + Math.sin(this.camYaw) * dist;
    const cz = focus.z + Math.cos(this.camYaw) * dist;
    const off = this.fx.shakeOffset(this.time);
    this.camera.position.set(cx + off.x, height + Math.sin(this.camPitch) * dist * 0.55 + off.y, cz);
    this.camera.lookAt(focus.x, 1.6, focus.z);
  }
}

new Game();
