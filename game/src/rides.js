// rides.js — every drivable thing in Solmar Bay: sedans, taxis, trucks, the
// motorcycle at the pier, the boat at the dock, and SBPD interceptors.
// One Ride class covers them all; the kind only changes the mesh, the tune
// and whether it floats.

import * as THREE from 'three';
import { RIDES, PALETTE, PAYOUTS } from './tuning.js';

function box(w, h, d, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
}

function wheel() {
  const w = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10),
    new THREE.MeshLambertMaterial({ color: 0x141414 }),
  );
  w.rotation.z = Math.PI / 2;
  return w;
}

export class Ride {
  constructor(scene, kind, x, z, heading, color) {
    this.scene = scene;
    this.kind = kind;
    this.tune = RIDES[kind];
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.driver = null; // 'hero' | 'npc' | 'cop' | null (parked)
    this.stolen = false;
    this.airTime = 0;
    this.airborne = false;
    this.vy = 0;
    this.y = 0;
    this.color = color ?? PALETTE.carPaint[Math.floor(Math.random() * PALETTE.carPaint.length)];
    this.mesh = this._buildMesh();
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this._wheelSpin = 0;
  }

  _buildMesh() {
    const g = new THREE.Group();
    this.wheels = [];
    if (this.kind === 'bike') {
      const body = box(0.5, 0.5, 2.2, this.color);
      body.position.y = 0.75;
      g.add(body);
      const tank = box(0.55, 0.4, 0.9, 0x222226);
      tank.position.set(0, 1.05, 0.1);
      g.add(tank);
      for (const dz of [-0.85, 0.85]) {
        const w = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.18, 10),
          new THREE.MeshLambertMaterial({ color: 0x141414 }),
        );
        w.rotation.z = Math.PI / 2;
        w.position.set(0, 0.42, dz);
        g.add(w);
        this.wheels.push(w);
      }
      const rider = box(0.5, 0.7, 0.5, 0x1f8a70);
      rider.position.set(0, 1.25, -0.35);
      rider.visible = false;
      this.riderMesh = rider;
      g.add(rider);
      return g;
    }
    if (this.kind === 'boat') {
      const hull = box(3.2, 1.4, 8.5, this.color);
      hull.position.y = 0.7;
      g.add(hull);
      const bow = new THREE.Mesh(
        new THREE.ConeGeometry(1.6, 2.4, 4),
        new THREE.MeshLambertMaterial({ color: this.color }),
      );
      bow.rotation.x = Math.PI / 2;
      bow.rotation.y = Math.PI / 4;
      bow.position.set(0, 0.7, 5.2);
      g.add(bow);
      const cabin = box(2.4, 1.4, 3, 0xe8e8e8);
      cabin.position.set(0, 2, -0.8);
      g.add(cabin);
      return g;
    }
    const long = this.kind === 'truck' ? 5.6 : 4.4;
    const wide = this.kind === 'truck' ? 2.2 : 2.0;
    const body = box(wide, 0.85, long, this.color);
    body.position.y = 0.75;
    g.add(body);
    const cabin = box(wide * 0.85, 0.7, this.kind === 'truck' ? 1.6 : 2.2, this.kind === 'truck' ? 0x2a2a2e : 0x1c2733);
    cabin.position.set(0, 1.45, this.kind === 'truck' ? 1.2 : -0.2);
    g.add(cabin);
    if (this.kind === 'taxi') {
      const sign = box(1.0, 0.35, 0.5, 0xffd23f);
      sign.position.set(0, 2.0, -0.2);
      g.add(sign);
    }
    if (this.kind === 'cop') {
      const bar = box(1.2, 0.25, 0.4, 0x222226);
      bar.position.set(0, 1.95, -0.2);
      g.add(bar);
      this.lightL = box(0.5, 0.22, 0.42, 0xff2222);
      this.lightL.position.set(-0.35, 2.0, -0.2);
      g.add(this.lightL);
      this.lightR = box(0.5, 0.22, 0.42, 0x2244ff);
      this.lightR.position.set(0.35, 2.0, -0.2);
      g.add(this.lightR);
    }
    for (const [wx, wz] of [[-wide / 2, long / 2 - 0.8], [wide / 2, long / 2 - 0.8], [-wide / 2, -long / 2 + 0.8], [wide / 2, -long / 2 + 0.8]]) {
      const w = wheel();
      w.position.set(wx, 0.42, wz);
      g.add(w);
      this.wheels.push(w);
    }
    return g;
  }

  get speedKmh() { return Math.abs(this.speed) * 3.6; }

  // Hero driving: throttle/steer from input, arcade physics, ramp jumps.
  drive(dt, pad, city, fx, onStunt) {
    const axes = pad.moveAxes();
    const t = this.tune;
    if (axes.f > 0) this.speed += t.accel * dt;
    else if (axes.f < 0) this.speed -= (this.speed > 0.5 ? t.brake : t.accel * 0.5) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 8 * dt);
    this.speed = Math.max(-t.top * 0.35, Math.min(t.top, this.speed));
    const steer = axes.s * t.grip * dt * (this.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(this.speed) / 8 + 0.25);
    this.heading -= steer * Math.sign(this.speed || 1);
    this._move(dt, city, fx, onStunt);
  }

  // NPC driving: follow a target heading at a cruise speed.
  cruise(dt, targetHeading, cruiseSpeed, city) {
    let diff = targetHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
    const want = Math.min(this.tune.top * 0.55, cruiseSpeed);
    this.speed += Math.sign(want - this.speed) * Math.min(Math.abs(want - this.speed), this.tune.accel * dt);
    this._move(dt, city, null, null);
  }

  _move(dt, city, fx, onStunt) {
    const fx2 = Math.sin(this.heading);
    const fz2 = Math.cos(this.heading);
    let nx = this.pos.x + fx2 * this.speed * dt;
    const nz = this.pos.z + fz2 * this.speed * dt;
    const inWater = city.isWater(nx);
    if (this.kind === 'boat') {
      if (!inWater && this.pos.x < 214) {
        // Boats beach themselves: stop at the sand.
        this.speed *= 0.9;
      }
    } else if (inWater) {
      // Cars cannot drive into the bay; the beach stops them.
      this.speed = 0;
      nx = Math.min(nx, 170);
    }
    this.pos.x = nx;
    this.pos.z = nz;
    if (this.kind !== 'boat') {
      const probe = { x: this.pos.x, z: this.pos.z };
      city.collideCircle(probe, 1.4);
      if (probe.x !== this.pos.x || probe.z !== this.pos.z) {
        if (Math.abs(this.speed) > 12 && fx) fx.spawnCrash(this.pos.x, this.pos.z, 0.5);
        this.speed *= 0.35;
        this.pos.x = probe.x;
        this.pos.z = probe.z;
      }
    }
    // Stunt ramps: cross one fast and the ride goes airborne.
    if (!this.airborne && Math.abs(this.speed) > 17 && this.kind !== 'boat') {
      const ramp = city.rampAt(this.pos.x, this.pos.z);
      if (ramp) {
        this.airborne = true;
        this.vy = 7 + Math.abs(this.speed) * 0.12;
        this.airTime = 0;
      }
    }
    if (this.airborne) {
      this.airTime += dt;
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.airborne = false;
        if (this.airTime > 0.6 && onStunt) {
          onStunt(Math.round(this.airTime * PAYOUTS.stuntPerSec));
        }
        if (fx) fx.spawnDust(this.pos.x, this.pos.z, 8);
        this.airTime = 0;
      }
    }
    this.mesh.position.set(this.pos.x, this.y + (this.kind === 'boat' ? 0.1 : 0), this.pos.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.z = this.kind === 'bike' ? -axesLean(this) : 0;
    this.mesh.rotation.x = this.airborne ? -0.12 : 0;
    if (this.lightL) {
      const on = Math.floor(performance.now() / 260) % 2 === 0;
      this.lightL.material.color.setHex(on ? 0xff2222 : 0x550000);
      this.lightR.material.color.setHex(on ? 0x000055 : 0x2244ff);
    }
    this._wheelSpin += this.speed * dt * 2;
    for (const w of this.wheels) w.rotation.x = this._wheelSpin;
  }
}

function axesLean(ride) {
  return 0; // lean is applied by the caller through mesh rotation when steering
}

export class RideYard {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rides = [];
  }

  spawnParked(spots) {
    for (const s of spots) {
      this.rides.push(new Ride(this.scene, s.kind, s.x, s.z, s.heading));
    }
  }

  addRide(kind, x, z, heading, color) {
    const r = new Ride(this.scene, kind, x, z, heading, color);
    this.rides.push(r);
    return r;
  }

  removeRide(ride) {
    this.scene.remove(ride.mesh);
    this.rides = this.rides.filter((r) => r !== ride);
  }

  nearestRide(x, z, radius, opts = {}) {
    let best = null;
    let bestD = radius;
    for (const r of this.rides) {
      if (opts.excludeCop && r.kind === 'cop') continue;
      if (opts.onlyParked && r.driver) continue;
      const d = Math.hypot(r.pos.x - x, r.pos.z - z);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  get parked() { return this.rides.filter((r) => !r.driver); }
}
