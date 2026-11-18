// hero.js — Rico Vega on foot: walk, sprint, punch, steal a ride, and take
// a beating. The mesh is a simple articulated figure built from boxes so it
// reads at any distance without an asset file.

import * as THREE from 'three';
import { HERO } from './tuning.js';

function limb(color, w, h, d) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  return m;
}

export class Hero {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 24);
    this.yaw = Math.PI; // facing the plaza
    this.vel = new THREE.Vector3();
    this.health = HERO.health;
    this.inRide = null;   // Ride | null
    this.punchTimer = 0;
    this.punchCooldown = 0;
    this.walkPhase = 0;
    this.airborne = false;
    this.mesh = this._buildMesh();
    scene.add(this.mesh);
  }

  _buildMesh() {
    const g = new THREE.Group();
    const jacket = 0x1f8a70; // teal jacket, Rico's signature
    const skin = 0xc98a5e;
    const jeans = 0x2e4a6b;
    this.torso = limb(jacket, 1.0, 1.3, 0.55);
    this.torso.position.y = 1.45;
    g.add(this.torso);
    this.head = limb(skin, 0.55, 0.55, 0.55);
    this.head.position.y = 2.35;
    g.add(this.head);
    const hair = limb(0x1a1a1a, 0.58, 0.2, 0.58);
    hair.position.y = 2.66;
    g.add(hair);
    this.armL = limb(jacket, 0.28, 1.1, 0.28);
    this.armL.position.set(-0.66, 1.5, 0);
    g.add(this.armL);
    this.armR = limb(jacket, 0.28, 1.1, 0.28);
    this.armR.position.set(0.66, 1.5, 0);
    g.add(this.armR);
    this.legL = limb(jeans, 0.34, 1.1, 0.34);
    this.legL.position.set(-0.26, 0.55, 0);
    g.add(this.legL);
    this.legR = limb(jeans, 0.34, 1.1, 0.34);
    this.legR.position.set(0.26, 0.55, 0);
    g.add(this.legR);
    return g;
  }

  get speed() { return this.vel.length(); }

  // Try to step into the nearest stealable ride. Returns the ride or null.
  tryEnterRide(yard) {
    const ride = yard.nearestRide(this.pos.x, this.pos.z, 4, { excludeCop: true });
    if (!ride) return null;
    this.inRide = ride;
    ride.driver = 'hero';
    this.mesh.visible = false;
    return ride;
  }

  exitRide(city) {
    if (!this.inRide) return;
    const ride = this.inRide;
    ride.driver = null;
    ride.speed = 0;
    this.inRide = null;
    // Step out to the ride's left side, clear of the body.
    const sideX = Math.cos(ride.heading + Math.PI / 2);
    const sideZ = -Math.sin(ride.heading + Math.PI / 2);
    this.pos.set(ride.pos.x + sideX * 2.4, 0, ride.pos.z + sideZ * 2.4);
    city.collideCircle(this.pos, 0.7);
    this.mesh.visible = true;
  }

  // Swing at whatever is in front: a pedestrian, a foot cop, or a cop car's
  // driver-side window. Returns what was hit, if anything.
  punch(crowd, cops) {
    if (this.punchCooldown > 0 || this.inRide) return null;
    this.punchCooldown = HERO.punchCooldown;
    this.punchTimer = 0.22;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const hx = this.pos.x + fx * HERO.punchRange;
    const hz = this.pos.z + fz * HERO.punchRange;
    const ped = crowd ? crowd.nearestPed(hx, hz, 1.6) : null;
    if (ped) {
      ped.knockback(fx, fz);
      return { kind: 'ped', target: ped };
    }
    const cop = cops ? cops.nearestFootCop(hx, hz, 1.6) : null;
    if (cop) {
      cop.health -= HERO.punchDamage;
      return { kind: 'cop', target: cop };
    }
    return { kind: 'air' };
  }

  takeHit(dmg) {
    this.health = Math.max(0, this.health - dmg);
  }

  heal(amount) {
    this.health = Math.min(HERO.health, this.health + amount);
  }

  update(dt, pad, camYaw, city, yard, crowd, cops, game) {
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    if (this.inRide) {
      this.pos.copy(this.inRide.pos);
      this.yaw = this.inRide.heading;
      return;
    }
    const axes = pad.moveAxes();
    const sprint = pad.sprinting();
    const speed = sprint ? HERO.sprintSpeed : HERO.walkSpeed;
    // Movement is camera-relative: W walks away from the camera.
    const fwdX = -Math.sin(camYaw);
    const fwdZ = -Math.cos(camYaw);
    const rightX = Math.cos(camYaw);
    const rightZ = -Math.sin(camYaw);
    let mx = fwdX * axes.f + rightX * axes.s;
    let mz = fwdZ * axes.f + rightZ * axes.s;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      this.vel.set(mx * speed, 0, mz * speed);
      this.yaw = Math.atan2(mx, mz);
      this.walkPhase += dt * speed * 1.6;
    } else {
      this.vel.set(0, 0, 0);
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    city.collideCircle(this.pos, 0.7);
    // Stepping into the bay on foot just pushes Rico back onto the sand.
    if (city.isWater(this.pos.x)) this.pos.x = WORLD_WATER_EDGE;
    this._animate(dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  _animate(dt) {
    const swing = this.vel.length() > 0.5 ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    if (this.punchTimer > 0) {
      this.armR.rotation.x = -1.9; // fist out
    } else {
      this.armR.rotation.x = -swing * 0.7;
      this.armL.rotation.x = swing * 0.7;
    }
  }
}

const WORLD_WATER_EDGE = 170;
