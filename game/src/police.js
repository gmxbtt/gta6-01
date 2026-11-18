// police.js — the Solmar Bay Police Department: the wanted level, pursuit
// cars that ram, and foot officers who chase Rico down and arrest him.
import * as THREE from 'three';
import { CITY, GAME } from './config.js';
import { Car } from './vehicles.js';

function makeCopMesh() {
  const group = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.9, 0.38), navy);
  torso.position.y = 1.2;
  torso.castShadow = true;
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xffd23c }));
  badge.position.set(-0.18, 1.42, 0.2);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), skin);
  head.position.y = 1.9;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.12, 12), navy);
  hat.position.y = 2.1;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.26), navy);
  legL.position.set(-0.17, 0.4, 0);
  const legR = legL.clone();
  legR.position.x = 0.17;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.2), navy);
  armL.position.set(-0.44, 1.2, 0);
  const armR = armL.clone();
  armR.position.x = 0.44;
  group.add(torso, badge, head, hat, legL, legR, armL, armR);
  group.userData = { legL, legR, armL, armR };
  return group;
}

export class PoliceManager {
  constructor(scene, world, game) {
    this.scene = scene;
    this.world = world;
    this.game = game;
    this.wanted = 0;
    this.lastCrimeAt = -999;
    this.lastDecayAt = 0;
    this.cars = []; // Car instances
    this.cops = []; // {mesh, x, z, heading, walkPhase, punchTimer, arrestTimer}
    this.spawnTimer = 0;
    this.sirenPhase = 0;
  }

  get wantedLevel() { return this.wanted; }

  addHeat(n, reason) {
    if (n <= 0) return;
    const before = this.wanted;
    this.wanted = Math.min(GAME.maxWanted, this.wanted + n);
    this.lastCrimeAt = this.game.time;
    if (before === 0 && this.wanted > 0) this.spawnTimer = 0; // respond at once
    if (this.wanted > before) {
      this.game.hud.flashWanted();
      if (reason) this.game.hud.showMessage(reason, 'bad');
      if (this.wanted >= 3) this.game.hud.showMessage('The whole SBPD is after you!', 'bad');
    }
  }

  setWanted(n) {
    const before = this.wanted;
    this.wanted = Math.max(0, Math.min(GAME.maxWanted, n));
    this.lastCrimeAt = this.game.time;
    if (before === 0 && this.wanted > 0) this.spawnTimer = 0; // respond at once
  }

  clearWanted() {
    this.wanted = 0;
    this._despawnAll();
  }

  _despawnAll() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    for (const c of this.cops) this.scene.remove(c.mesh);
    this.cars = [];
    this.cops = [];
  }

  _spawnPointNear(playerPos, minDist, maxDist) {
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = minDist + Math.random() * (maxDist - minDist);
      const x = playerPos.x + Math.cos(a) * d;
      const z = playerPos.z + Math.sin(a) * d;
      if (Math.abs(x) > CITY.bound - 5 || Math.abs(z) > CITY.bound - 5) continue;
      if (this.world.pointInBuilding(x, z)) continue;
      return { x, z };
    }
    return { x: playerPos.x + 40, z: playerPos.z };
  }

  _spawnPoliceCar(playerPos) {
    // Spawn on a road so the car can drive.
    const road = this.world.randomRoadPoint();
    const car = new Car('police', road.x, road.z, Math.random() * Math.PI * 2);
    car.speed = 8;
    this.scene.add(car.mesh);
    this.cars.push(car);
    return car;
  }

  _spawnCop(playerPos) {
    const p = this._spawnPointNear(playerPos, 25, 45);
    const mesh = makeCopMesh();
    mesh.position.set(p.x, 0, p.z);
    this.scene.add(mesh);
    const cop = { mesh, x: p.x, z: p.z, heading: 0, walkPhase: Math.random() * 6, punchTimer: 0, arrestTimer: 0 };
    this.cops.push(cop);
    return cop;
  }

  update(dt) {
    const player = this.game.player;
    const time = this.game.time;
    // Wanted decay: quiet for a while, far from any cop, and it fades.
    if (this.wanted > 0 && time - this.lastCrimeAt > GAME.heatDecayDelay) {
      const nearestCop = this._nearestUnitDist(player);
      if (nearestCop > 45 && time - this.lastDecayAt > GAME.heatDecayStep) {
        this.wanted--;
        this.lastDecayAt = time;
        if (this.wanted === 0) this.game.hud.showMessage('You lost the heat.', 'good');
      }
    }
    // Keep the response proportional to the wanted level.
    const wantCars = this.wanted === 0 ? 0 : Math.min(2 + this.wanted, 8);
    const wantCops = this.wanted === 0 ? 0 : Math.min(this.wanted + 1, 5);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      if (this.cars.length < wantCars) this._spawnPoliceCar(player.pos);
      if (this.cops.length < wantCops) this._spawnCop(player.pos);
    }
    // Despawn units that fell far behind when the heat is gone.
    if (this.wanted === 0) {
      this.cars = this.cars.filter((c) => {
        const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
        if (d > 90) { this.scene.remove(c.mesh); return false; }
        return true;
      });
      this.cops = this.cops.filter((c) => {
        const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
        if (d > 70) { this.scene.remove(c.mesh); return false; }
        return true;
      });
    }

    // Siren audio + light bar flash.
    this.game.audio.setSiren(this.wanted > 0 && this.cars.length > 0);
    this.sirenPhase += dt * 6;
    const redOn = Math.sin(this.sirenPhase) > 0;
    for (const c of this.cars) {
      if (c.mesh.userData.lightRed) c.mesh.userData.lightRed.material.color.setHex(redOn ? 0xff2020 : 0x551010);
      if (c.mesh.userData.lightBlue) c.mesh.userData.lightBlue.material.color.setHex(redOn ? 0x101055 : 0x2040ff);
    }

    this._updateCars(dt, player);
    this._updateCops(dt, player);
  }

  _nearestUnitDist(player) {
    let best = 999;
    for (const c of this.cars) best = Math.min(best, Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z));
    for (const c of this.cops) best = Math.min(best, Math.hypot(c.x - player.pos.x, c.z - player.pos.z));
    return best;
  }

  _updateCars(dt, player) {
    const allCars = this.game.allCars();
    for (const car of this.cars) {
      const dx = player.pos.x - car.pos.x;
      const dz = player.pos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      // Full speed when far, ease off to ram when close.
      const throttle = dist > 10 ? 1 : 0.85;
      car.step({ throttle, steer }, dt, this.world, allCars);
      // Ramming the player's car: damage + shake.
      if (player.inCar && dist < 3.4) {
        const impact = Math.abs(car.speed);
        if (impact > 5) {
          player.inCar.damage(impact * 0.5);
          this.game.onCrash(impact, player.inCar.pos);
          player.hurt(impact * 0.25);
          // Shove the player's car sideways.
          player.inCar.pos.x += (dx / (dist || 1)) * 0.4;
          player.inCar.pos.z += (dz / (dist || 1)) * 0.4;
        }
        car.speed *= 0.6;
      }
      // Ramming the player on foot.
      if (!player.inCar && dist < 2.2 && Math.abs(car.speed) > 3) {
        player.hurt(12);
        this.game.onCrash(8, player.pos);
        this.game.effects.burst(player.pos.x, 1, player.pos.z, 'stars');
        // Knock the player away from the car.
        player.pos.x += (player.pos.x - car.pos.x) * 0.3;
        player.pos.z += (player.pos.z - car.pos.z) * 0.3;
        car.speed *= 0.4;
      }
      if (car.smoking && Math.random() < dt * 6) {
        this.game.effects.burst(car.pos.x, 1.6, car.pos.z, 'smoke');
      }
      // Give up on a wrecked cruiser and replace it later.
      if (car.wrecked) {
        this.scene.remove(car.mesh);
        this.cars.splice(this.cars.indexOf(car), 1);
      }
    }
  }

  _updateCops(dt, player) {
    for (const cop of this.cops) {
      const dx = player.pos.x - cop.x;
      const dz = player.pos.z - cop.z;
      const dist = Math.hypot(dx, dz);
      const speed = player.inCar ? 5.2 : 4.6; // cops run; they cannot catch a car, they try to box it in
      if (dist > 1.6) {
        const desired = Math.atan2(dx, dz);
        let diff = desired - cop.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        cop.heading += Math.max(-4 * dt, Math.min(4 * dt, diff));
        const nx = cop.x + Math.sin(cop.heading) * speed * dt;
        const nz = cop.z + Math.cos(cop.heading) * speed * dt;
        if (!this.world.pointInBuilding(nx, nz)) {
          cop.x = nx;
          cop.z = nz;
        }
        cop.walkPhase += dt * speed * 2.2;
        cop.arrestTimer = Math.max(0, cop.arrestTimer - dt);
      } else {
        // On top of the player: punch on foot, or arrest if the player is cornered.
        cop.punchTimer -= dt;
        if (!player.inCar && cop.punchTimer <= 0) {
          cop.punchTimer = 0.9;
          player.hurt(9);
          this.game.audio.punch();
          this.game.effects.burst(player.pos.x, 1.4, player.pos.z, 'stars');
          this.game.hud.showMessage('An officer is beating you down!', 'bad');
        }
        if (player.inCar) {
          // Player is in a stopped car with a cop at the window: arrest builds.
          if (Math.abs(player.inCar.speed) < 1) {
            cop.arrestTimer += dt;
            if (cop.arrestTimer > 3) {
              this.game.onBusted();
              return;
            }
          } else {
            cop.arrestTimer = 0;
          }
        } else {
          cop.arrestTimer += dt;
          if (cop.arrestTimer > 2.5) {
            this.game.onBusted();
            return;
          }
        }
      }
      const s = Math.sin(cop.walkPhase);
      cop.mesh.userData.legL.rotation.x = s * 0.6;
      cop.mesh.userData.legR.rotation.x = -s * 0.6;
      cop.mesh.userData.armL.rotation.x = -s * 0.5;
      cop.mesh.userData.armR.rotation.x = s * 0.5;
      cop.mesh.position.set(cop.x, Math.abs(Math.sin(cop.walkPhase)) * 0.04, cop.z);
      cop.mesh.rotation.y = cop.heading;
    }
  }
}
