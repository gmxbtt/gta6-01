// player.js — Rico Vega on foot: third-person movement, jump, punch combat,
// and getting in and out of cars. The camera lives in main.js.
import * as THREE from 'three';
import { isOnRoad } from './config.js';

function makePlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2e86c1, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1f2a36, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.36), jacket);
  torso.position.y = 1.2;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), skin);
  head.position.y = 1.9;
  head.castShadow = true;
  // A flat cap, Rico's trademark.
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 }));
  cap.position.y = 2.08;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.22),
    new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 }));
  brim.position.set(0, 2.03, 0.28);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.26), pants);
  legL.position.set(-0.17, 0.4, 0);
  const legR = legL.clone();
  legR.position.x = 0.17;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.2), jacket);
  armL.position.set(-0.43, 1.2, 0);
  const armR = armL.clone();
  armR.position.x = 0.43;
  group.add(torso, head, cap, brim, legL, legR, armL, armR);
  group.userData = { legL, legR, armL, armR, torso, head };
  return group;
}

export class Player {
  constructor(scene, world, game) {
    this.scene = scene;
    this.world = world;
    this.game = game; // callbacks: addHeat, onCarStolen, onPunch, onExitCar...
    this.mesh = makePlayerMesh();
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(0, 0, 27);
    this.heading = Math.PI;
    this.velY = 0;
    this.onGround = true;
    this.health = 100;
    this.inCar = null; // Car instance or null
    this.walkPhase = 0;
    this.punchTimer = 0;
    this.punchCooldown = 0;
    this.invuln = 0;
    this.mesh.position.copy(this.pos);
  }

  get speed() {
    return this.inCar ? Math.abs(this.inCar.speed) : this._footSpeed || 0;
  }

  get onFoot() { return !this.inCar; }

  resetTo(x, z) {
    this.pos.set(x, 0, z);
    this.heading = Math.PI;
    this.velY = 0;
    this.health = 100;
    if (this.inCar) {
      this.game.returnCar(this.inCar);
      this.inCar = null;
    }
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
  }

  enterCar(car) {
    this.inCar = car;
    this.mesh.visible = false;
    this.game.audio.door();
  }

  exitCar() {
    if (!this.inCar) return;
    const car = this.inCar;
    this.inCar = null;
    // Step out to the driver's side.
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    this.pos.set(car.pos.x + sideX * 2.2, 0, car.pos.z + sideZ * 2.2);
    this.world.collideCircle(this.pos, 0.6);
    this.heading = car.heading;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.game.audio.door();
    this.game.onExitCar(car);
  }

  hurt(amount) {
    if (this.invuln > 0) return;
    this.health = Math.max(0, this.health - amount);
    this.invuln = 0.6;
    this.game.onPlayerHurt(this.health);
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
  }

  update(dt, input, camYaw) {
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.inCar) {
      this._drive(dt, input);
      return;
    }
    const move = input.moveAxis();
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? 9.5 : 5.6;
    // Movement is relative to the camera yaw.
    const fwdX = Math.sin(camYaw);
    const fwdZ = Math.cos(camYaw);
    const rightX = Math.cos(camYaw);
    const rightZ = -Math.sin(camYaw);
    let mx = fwdX * -move.z + rightX * move.x;
    let mz = fwdZ * -move.z + rightZ * move.x;
    const mag = Math.hypot(mx, mz);
    this._footSpeed = 0;
    if (mag > 0.01) {
      mx /= mag;
      mz /= mag;
      const step = speed * dt;
      const nx = this.pos.x + mx * step;
      const nz = this.pos.z + mz * step;
      const before = { x: this.pos.x, z: this.pos.z };
      this.pos.x = nx;
      this.pos.z = nz;
      this.world.collideCircle(this.pos, 0.55);
      const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
      this._footSpeed = moved / dt;
      this.heading = Math.atan2(mx, mz);
      this.walkPhase += dt * speed * 1.6;
    }
    // Jump.
    if (input.hit('Space') && this.onGround) {
      this.velY = 6.5;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.velY -= 18 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.velY = 0;
        this.onGround = true;
      }
    }
    // Punch (F): a quick swing that can knock a ped down.
    if (input.hit('KeyF') && this.punchCooldown <= 0) {
      this.punchTimer = 0.28;
      this.punchCooldown = 0.45;
      this.game.tryPunch(this);
    }
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      const t = 1 - this.punchTimer / 0.28;
      const swing = Math.sin(t * Math.PI);
      this.mesh.userData.armR.rotation.x = -1.6 * swing;
      this.mesh.userData.armR.rotation.z = -0.5 * swing;
    } else {
      this.mesh.userData.armR.rotation.x = Math.sin(this.walkPhase) * 0.45 * (mag > 0.01 ? 1 : 0);
      this.mesh.userData.armR.rotation.z = 0;
      this.mesh.userData.armL.rotation.x = -Math.sin(this.walkPhase) * 0.45 * (mag > 0.01 ? 1 : 0);
    }
    this.mesh.userData.legL.rotation.x = Math.sin(this.walkPhase) * 0.6 * (mag > 0.01 ? 1 : 0);
    this.mesh.userData.legR.rotation.x = -Math.sin(this.walkPhase) * 0.6 * (mag > 0.01 ? 1 : 0);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Enter a car (E) — handled by main.js, which finds the nearest car.
  }

  _drive(dt, input) {
    const car = this.inCar;
    const move = input.moveAxis();
    const throttle = move.z < 0 ? 1 : move.z > 0 ? -1 : 0;
    const steer = move.x;
    const others = this.game.allCars().filter((c) => c !== car);
    car.step({ throttle, steer }, dt, this.world, others);
    // While driving, the player's position IS the car's (police, missions and
    // the minimap all track player.pos).
    this.pos.copy(car.pos);
    // Crash feedback.
    if (car.collisionImpact > 7) {
      this.game.onCrash(car.collisionImpact, car.pos);
      car.collisionImpact = 0;
    }
    // Horn.
    if (input.hit('KeyH')) this.game.audio.horn();
    // Running over a pedestrian while driving.
    const ped = this.game.peds.nearest(car.pos.x, car.pos.z, 2.4);
    if (ped && Math.abs(car.speed) > 4) {
      this.game.peds.knockDown(ped);
      this.game.effects.burst(ped.x, 1, ped.z, 'stars');
      this.game.audio.punch();
      this.game.addHeat(1, 'You ran someone over!');
      this.game.peds.scare(car.pos.x, car.pos.z, 18);
      car.damage(2);
    }
    // Smoke when wrecked.
    if (car.smoking && Math.random() < dt * 8) {
      this.game.effects.burst(car.pos.x, 1.6, car.pos.z, 'smoke');
    }
    if (car.wrecked) {
      this.game.onCarWrecked(car);
    }
    // Dust kicked up at speed off the road.
    if (Math.abs(car.speed) > 14 && !isOnRoad(car.pos.x, car.pos.z) && Math.random() < dt * 6) {
      this.game.effects.burst(car.pos.x, 0.3, car.pos.z, 'dust');
    }
  }
}
