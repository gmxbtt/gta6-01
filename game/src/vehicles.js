// vehicles.js — builds every car from boxes and runs the arcade driving model
// (acceleration, steering, drift, collisions) shared by the player and police.
import * as THREE from 'three';
import { CAR_TYPES } from './config.js';

const BODY_COLORS = [0x4a6fa5, 0xc0392b, 0x2e7d32, 0xe0e0e0, 0x222226, 0xd97b29, 0x7a4a9a, 0x3a9a8a];

export function makeCarMesh(type, colorHex) {
  const spec = CAR_TYPES[type] || CAR_TYPES.sedan;
  const color = colorHex !== undefined ? colorHex : spec.color;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.1, metalness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

  const isTruck = type === 'truck';
  const isVan = type === 'van';
  const len = isTruck ? 5.6 : isVan ? 4.9 : type === 'coupe' ? 4.1 : 4.4;
  const wid = isTruck || isVan ? 2.2 : 1.9;
  const bodyH = isVan ? 1.5 : 0.72;
  const bodyY = isVan ? 0.95 : 0.62;

  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, bodyH, len), bodyMat);
  body.position.y = bodyY;
  body.castShadow = true;
  group.add(body);

  if (isTruck) {
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.1, 1.5, 3.1), new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 0.9 }));
    cargo.position.set(0, 1.6, -1.0);
    cargo.castShadow = true;
    group.add(cargo);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.2, 1.0, 1.4), glassMat);
    cab.position.set(0, 1.5, 1.9);
    group.add(cab);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.3, 0.62, len * (isVan ? 0.72 : 0.5)), glassMat);
    cabin.position.set(0, bodyY + bodyH / 2 + 0.28, isVan ? -0.2 : -0.15);
    cabin.castShadow = true;
    group.add(cabin);
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const wx = wid / 2 - 0.05;
  const wz = len / 2 - 0.85;
  for (const [x, z] of [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(x, 0.36, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  // Headlights + taillights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const x of [-wid / 2 + 0.35, wid / 2 - 0.35]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
    hl.position.set(x, bodyY, len / 2 + 0.02);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tl.position.set(x, bodyY, -len / 2 - 0.02);
    group.add(tl);
  }

  if (type === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.22, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffe14d })
    );
    sign.position.set(0, bodyY + bodyH / 2 + 0.72, -0.15);
    group.add(sign);
  }
  if (type === 'coupe') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(wid - 0.2, 0.08, 0.4), darkMat);
    spoiler.position.set(0, bodyY + bodyH / 2 + 0.32, -len / 2 + 0.2);
    group.add(spoiler);
  }
  if (type === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), darkMat);
    bar.position.set(0, bodyY + bodyH / 2 + 0.72, -0.15);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.28, bodyY + bodyH / 2 + 0.72, -0.15);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.42), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.set(0.28, bodyY + bodyH / 2 + 0.72, -0.15);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
    // White doors read as a patrol car at a glance.
    const door = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.02, 0.5, 1.6), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.4, metalness: 0.4 }));
    door.position.set(0, bodyY, 0.1);
    group.add(door);
  }

  group.userData.wheels = wheels;
  group.userData.length = len;
  group.userData.width = wid;
  return group;
}

export function randomBodyColor() {
  return BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)];
}

// One car's driving state. Physics are arcade: no suspension model, just speed,
// heading and a little drift, plus circle collision against buildings and cars.
export class Car {
  constructor(type, x, z, heading) {
    this.type = type;
    this.spec = CAR_TYPES[type] || CAR_TYPES.sedan;
    this.mesh = makeCarMesh(type);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading || 0;
    this.speed = 0;
    this.health = 100;
    this.steerVis = 0;
    this.smoking = false;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  get forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // input: {throttle: -1..1, steer: -1..1}; dt seconds.
  step(input, dt, world, others) {
    const spec = this.spec;
    const topSpeed = spec.topSpeed * (this.health < 30 ? 0.55 : 1);
    const accel = spec.accel;
    if (input.throttle > 0) this.speed += accel * input.throttle * dt;
    else if (input.throttle < 0) {
      if (this.speed > 0.5) this.speed -= accel * 1.6 * dt; // brake
      else this.speed = Math.max(-8, this.speed - accel * 0.6 * dt); // reverse
    } else {
      // Engine braking + rolling drag.
      this.speed -= this.speed * 0.55 * dt;
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    this.speed = Math.max(-8, Math.min(topSpeed, this.speed));
    const spd = Math.abs(this.speed);
    const steerAmount = input.steer * spec.grip * 0.55 * Math.min(1, spd / 6) * (this.speed < 0 ? -1 : 1);
    this.heading += steerAmount * dt * (spd > 0.1 ? 1 : 0);
    this.steerVis += (input.steer - this.steerVis) * Math.min(1, dt * 8);

    const f = this.forward;
    const nx = this.pos.x + f.x * this.speed * dt;
    const nz = this.pos.z + f.z * this.speed * dt;
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x = nx;
    this.pos.z = nz;
    const hitWall = world.collideCircle(this.pos, 1.6);
    if (hitWall) {
      const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
      const wanted = Math.abs(this.speed) * dt;
      if (wanted > 0.01 && moved < wanted * 0.45) {
        // Hard hit: kill most of the speed, damage the car.
        const impact = Math.abs(this.speed);
        this.speed *= -0.18;
        if (impact > 6) this.damage(impact * 0.9);
        this.collisionImpact = impact;
      }
    } else {
      this.collisionImpact = 0;
    }
    // Soft collision with other cars (circle push).
    if (others) {
      for (const o of others) {
        if (o === this) continue;
        const dx = this.pos.x - o.pos.x;
        const dz = this.pos.z - o.pos.z;
        const d = Math.hypot(dx, dz);
        const minD = 2.6;
        if (d > 0.001 && d < minD) {
          const push = (minD - d) / 2;
          const ux = dx / d;
          const uz = dz / d;
          this.pos.x += ux * push;
          this.pos.z += uz * push;
          o.pos.x -= ux * push;
          o.pos.z -= uz * push;
          const rel = Math.abs(this.speed - o.speed);
          if (rel > 4) {
            this.damage(rel * 0.4);
            o.damage(rel * 0.4);
            this.collisionImpact = Math.max(this.collisionImpact || 0, rel);
            o.collisionImpact = Math.max(o.collisionImpact || 0, rel);
          }
        }
      }
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Spin the wheels.
    const spin = (this.speed * dt) / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    // Front wheels show the steering angle.
    this.mesh.userData.wheels[0].rotation.y = this.steerVis * 0.4;
    this.mesh.userData.wheels[1].rotation.y = this.steerVis * 0.4;
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.smoking = this.health < 35;
  }

  get wrecked() { return this.health <= 0; }
}
