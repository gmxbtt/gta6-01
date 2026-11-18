// crowd.js — pedestrians on the sidewalks: they stroll between intersections,
// scatter when a car bears down on them, and go down (then get back up)
// when Rico lands a punch. A few of them stop and watch a fight.

import * as THREE from 'three';
import { WORLD } from './tuning.js';

const SHIRTS = [0xd96a1e, 0x3fae6a, 0x7a4fd0, 0xe8e8e8, 0xc23b2e, 0x2e6fc2, 0xe8c832, 0x8a5a3b];

function makePedMesh(shirt) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 0.5), mat(shirt));
  torso.position.y = 1.35;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(0xc98a5e));
  head.position.y = 2.15;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, 0.3), mat(0x2e4a6b));
  legL.position.set(-0.22, 0.5, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.22;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.9, 0.24), mat(shirt));
  armL.position.set(-0.58, 1.4, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.58;
  g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

class Ped {
  constructor(scene, x, z) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = Math.random() * Math.PI * 2;
    this.speed = 1.2 + Math.random() * 1.4;
    this.state = 'walk'; // walk | flee | down
    this.downTimer = 0;
    this.fleeTimer = 0;
    this.target = this._pickTarget();
    this.mesh = makePedMesh(SHIRTS[Math.floor(Math.random() * SHIRTS.length)]);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
    this.phase = Math.random() * 6;
  }

  _pickTarget() {
    const av = WORLD.avenues[Math.floor(Math.random() * WORLD.avenues.length)];
    const along = (Math.random() - 0.5) * 320;
    const vertical = Math.random() < 0.5;
    // Walk on the sidewalk, just off the avenue.
    return vertical
      ? { x: av + 8.5, z: along }
      : { x: along, z: av + 8.5 };
  }

  knockback(fx, fz) {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downTimer = 2.5;
    this.pos.x += fx * 1.2;
    this.pos.z += fz * 1.2;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.4;
  }

  fleeFrom(x, z) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.fleeTimer = 2.2;
    const dx = this.pos.x - x;
    const dz = this.pos.z - z;
    const d = Math.hypot(dx, dz) || 1;
    this.yaw = Math.atan2(dx / d, dz / d);
  }

  update(dt) {
    this.phase += dt * (this.state === 'walk' ? 5 : 9);
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.state = 'walk';
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
        this.target = this._pickTarget();
      }
      return;
    }
    let speed = this.speed;
    if (this.state === 'flee') {
      speed = 5.5;
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) this.state = 'walk';
    } else {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 3) {
        this.target = this._pickTarget();
      } else {
        this.yaw = Math.atan2(dx / d, dz / d);
      }
    }
    this.pos.x += Math.sin(this.yaw) * speed * dt;
    this.pos.z += Math.cos(this.yaw) * speed * dt;
    this.pos.x = Math.max(-WORLD.bound, Math.min(WORLD.bound, this.pos.x));
    this.pos.z = Math.max(-WORLD.bound, Math.min(WORLD.bound, this.pos.z));
    const swing = Math.sin(this.phase) * 0.5;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.6;
    u.armR.rotation.x = swing * 0.6;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }
}

export class Crowd {
  constructor(scene) {
    this.scene = scene;
    this.peds = [];
    this.onBark = null;
    this._barkTimer = 0;
    for (let i = 0; i < 26; i++) {
      const av = WORLD.avenues[i % WORLD.avenues.length];
      const along = -150 + i * 12;
      const vertical = i % 2 === 0;
      this.peds.push(new Ped(scene, vertical ? av + 8.5 : along, vertical ? along : av + 8.5));
    }
  }

  nearestPed(x, z, radius) {
    let best = null;
    let bestD = radius;
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  update(dt, hero, heroRide) {
    this._barkTimer = Math.max(0, this._barkTimer - dt);
    for (const p of this.peds) {
      p.update(dt);
      // Scatter when a car (player or traffic) comes at them on the road.
      const threat = heroRide || null;
      if (threat) {
        const d = Math.hypot(p.pos.x - threat.pos.x, p.pos.z - threat.pos.z);
        if (d < 7 && Math.abs(threat.speed) > 4) {
          p.fleeFrom(threat.pos.x, threat.pos.z);
          if (this._barkTimer <= 0 && this.onBark) {
            this._barkTimer = 8;
            this.onBark();
          }
        }
      }
      const dh = Math.hypot(p.pos.x - hero.pos.x, p.pos.z - hero.pos.z);
      if (dh < 2 && hero.inRide) p.fleeFrom(hero.pos.x, hero.pos.z);
    }
  }
}
