// cops.js — the Solmar Bay Police Department. Heat rises when Rico steals,
// punches or speeds past a cruiser; the wanted level decides how many
// interceptors and foot cops hunt him, and at level 3 and up they throw
// roadblocks across the avenue ahead of him.

import * as THREE from 'three';
import { WANTED, WORLD } from './tuning.js';

function makeCopMesh() {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.2, 0.55), mat(0x1c2f57));
  torso.position.y = 1.4;
  g.add(torso);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), mat(0xffd23f));
  badge.position.set(0.25, 1.6, 0.3);
  g.add(badge);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(0xc98a5e));
  head.position.y = 2.2;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.18, 0.56), mat(0x101828));
  cap.position.y = 2.5;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.05, 0.32), mat(0x141c2e));
  legL.position.set(-0.24, 0.52, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.24;
  g.add(legR);
  g.userData = { legL, legR };
  return g;
}

class FootCop {
  constructor(scene, x, z) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.health = 100;
    this.arrestTimer = 0;
    this.phase = Math.random() * 6;
    this.mesh = makeCopMesh();
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, hero) {
    const dx = hero.pos.x - this.pos.x;
    const dz = hero.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const speed = d > 30 ? 0 : 6.2; // foot cops jog after Rico, never sprint
    if (d > 0.1) {
      const yaw = Math.atan2(dx / d, dz / d);
      this.pos.x += Math.sin(yaw) * speed * dt;
      this.pos.z += Math.cos(yaw) * speed * dt;
      this.mesh.rotation.y = yaw;
    }
    this.phase += dt * 8;
    const swing = speed > 0 ? Math.sin(this.phase) * 0.55 : 0;
    this.mesh.userData.legL.rotation.x = swing;
    this.mesh.userData.legR.rotation.x = -swing;
    this.mesh.position.copy(this.pos);
    // Arrest: standing next to Rico on foot, hands on him.
    if (!hero.inRide && d < 1.9 && hero.speed < 2.5) {
      this.arrestTimer += dt;
    } else {
      this.arrestTimer = Math.max(0, this.arrestTimer - dt * 2);
    }
  }
}

export class Cops {
  constructor(scene, yard, city, sfx) {
    this.scene = scene;
    this.yard = yard;
    this.city = city;
    this.sfx = sfx;
    this.heat = 0;
    this.wanted = 0;
    this.quietTimer = 0;
    this.cars = [];    // Ride objects, kind 'cop', driver 'cop'
    this.cops = [];    // FootCop objects
    this.spawnTimer = 0;
    this.blockTimer = 12;
    this.roadblock = null; // { meshes, x, z, timer }
    this._flash = 0;
  }

  get levelName() { return WANTED.names[this.wanted]; }

  addHeat(n, reason) {
    this.heat = Math.min(260, this.heat + n * 20);
    this.quietTimer = 0;
    this._recompute();
  }

  clearWanted() {
    this.heat = 0;
    this.wanted = 0;
    this.quietTimer = 0;
    this._despawnAll();
  }

  setWanted(level) {
    this.wanted = Math.max(0, Math.min(5, level));
    this.heat = WANTED.thresholds[this.wanted] + 5;
    this.quietTimer = 0;
  }

  _recompute() {
    let lvl = 0;
    for (let i = 0; i < WANTED.thresholds.length; i++) {
      if (this.heat >= WANTED.thresholds[i]) lvl = i;
    }
    if (lvl !== this.wanted) this.wanted = lvl;
  }

  _despawnAll() {
    for (const c of this.cars) this.yard.removeRide(c);
    this.cars = [];
    for (const c of this.cops) this.scene.remove(c.mesh);
    this.cops = [];
    this._clearRoadblock();
  }

  _clearRoadblock() {
    if (!this.roadblock) return;
    for (const m of this.roadblock.meshes) this.scene.remove(m);
    for (const r of this.roadblock.rides) this.yard.removeRide(r);
    this.roadblock = null;
  }

  _spawnCopCar(hero) {
    // Drop the interceptor on a road 55-70m from Rico, ahead of his travel.
    const angle = Math.random() * Math.PI * 2;
    let x = hero.pos.x + Math.cos(angle) * 60;
    let z = hero.pos.z + Math.sin(angle) * 60;
    x = this.city.nearestAvenue(x);
    z = Math.max(-WORLD.bound, Math.min(WORLD.bound, z));
    if (this.city.isWater(x)) x = 120;
    const ride = this.yard.addRide('cop', x, z, Math.atan2(hero.pos.x - x, hero.pos.z - z), 0x1c2f57);
    ride.driver = 'cop';
    this.cars.push(ride);
  }

  _spawnFootCop(hero) {
    const angle = Math.random() * Math.PI * 2;
    const x = hero.pos.x + Math.cos(angle) * 18;
    const z = hero.pos.z + Math.sin(angle) * 18;
    const cop = new FootCop(this.scene, x, z);
    this.cops.push(cop);
  }

  _throwRoadblock(hero) {
    this._clearRoadblock();
    // Block the avenue Rico is on (or nearest to it), 35m ahead of him.
    const fx = Math.sin(hero.yaw);
    const fz = Math.cos(hero.yaw);
    const ax = hero.pos.x + fx * 35;
    const az = hero.pos.z + fz * 35;
    const onVertical = Math.abs(fx) < Math.abs(fz);
    const bx = onVertical ? this.city.nearestAvenue(ax) : ax;
    const bz = onVertical ? az : this.city.nearestAvenue(az);
    const meshes = [];
    const rides = [];
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    for (const off of [-4, 0, 4]) {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 0.5), mat(0xff6a00));
      barrier.position.set(onVertical ? bx + off : bx, 0.55, onVertical ? bz : bz + off);
      barrier.rotation.y = onVertical ? 0 : Math.PI / 2;
      this.scene.add(barrier);
      meshes.push(barrier);
    }
    for (const side of [-7, 7]) {
      const r = this.yard.addRide('cop', onVertical ? bx + side : bx, onVertical ? bz : bz + side, onVertical ? Math.PI / 2 : 0, 0x1c2f57);
      r.driver = 'cop';
      rides.push(r);
      this.cars.push(r);
    }
    const cop1 = new FootCop(this.scene, bx - 3, bz - 3);
    const cop2 = new FootCop(this.scene, bx + 3, bz + 3);
    this.cops.push(cop1, cop2);
    this.roadblock = { meshes, rides, x: bx, z: bz, timer: 0 };
  }

  nearestFootCop(x, z, radius) {
    let best = null;
    let bestD = radius;
    for (const c of this.cops) {
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  update(dt, hero, game) {
    this.quietTimer += dt;
    const prevWanted = this.wanted;
    if (this.wanted > 0 && this.quietTimer > WANTED.decayDelay) {
      this.heat = Math.max(0, this.heat - WANTED.decayPerSec * dt);
      this._recompute();
      if (this.wanted === 0) this._despawnAll();
    }
    if (this.wanted > prevWanted && this.wanted >= 2 && game.barks) {
      game.overlay.toast(game.barks.cop());
    }
    // Keep the force at the level's strength.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      const wantCars = WANTED.copCars[this.wanted];
      const wantCops = WANTED.footCops[this.wanted];
      if (this.cars.length < wantCars && this.wanted > 0) this._spawnCopCar(hero);
      if (this.cops.length < wantCops && this.wanted > 0) this._spawnFootCop(hero);
      if (this.cars.length > wantCars) {
        const extra = this.cars.pop();
        this.yard.removeRide(extra);
      }
      if (this.cops.length > wantCops) {
        const extra = this.cops.pop();
        this.scene.remove(extra.mesh);
      }
    }
    // Roadblocks at high heat.
    if (this.wanted >= 3) {
      this.blockTimer -= dt;
      if (this.blockTimer <= 0) {
        this.blockTimer = 22;
        this._throwRoadblock(hero);
      }
    }
    if (this.roadblock) {
      this.roadblock.timer += dt;
      const d = Math.hypot(hero.pos.x - this.roadblock.x, hero.pos.z - this.roadblock.z);
      if (d > 90 || this.roadblock.timer > 40) this._clearRoadblock();
    }
    // Pursuit: interceptors steer at Rico and ram.
    const target = hero.inRide || hero;
    for (const car of this.cars) {
      if (car.driver !== 'cop') continue;
      const dx = target.pos.x - car.pos.x;
      const dz = target.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));
      const cruise = Math.min(car.tune.top, d > 25 ? car.tune.top : 20);
      car.speed += Math.sign(cruise - car.speed) * Math.min(Math.abs(cruise - car.speed), car.tune.accel * dt);
      car._move(dt, this.city, null, null);
      if (d < 3.4) {
        // Ram: shove the player's ride and shake things up.
        if (hero.inRide) {
          hero.inRide.speed *= 0.82;
          hero.inRide.pos.x += dx / (d || 1) * 0.4;
          hero.inRide.pos.z += dz / (d || 1) * 0.4;
          game.shake(0.35);
          this.sfx.crash(0.5);
        } else {
          hero.takeHit(9 * dt * 10);
          hero.pos.x -= dx / (d || 1) * 0.6;
          hero.pos.z -= dz / (d || 1) * 0.6;
          game.shake(0.3);
        }
        car.speed *= 0.5;
      }
    }
    // Foot cops chase and arrest.
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      if (cop.health <= 0) {
        this.scene.remove(cop.mesh);
        this.cops.splice(i, 1);
        continue;
      }
      cop.update(dt, hero);
      if (cop.arrestTimer > 1.3) {
        game.busted();
        return;
      }
    }
    this.sfx.sirenSet(this.wanted > 0);
  }
}
