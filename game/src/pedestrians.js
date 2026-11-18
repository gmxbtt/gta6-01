// pedestrians.js — people on the sidewalks: they stroll between sidewalk
// points, bob as they walk, flee from danger, and fall when hit.
import * as THREE from 'three';

const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xecf0f1, 0x2ecc71];
const SKINS = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac, 0xc68642];

function makePedMesh() {
  const group = new THREE.Group();
  const shirt = SHIRTS[Math.floor(Math.random() * SHIRTS.length)];
  const skin = SKINS[Math.floor(Math.random() * SKINS.length)];
  const pants = Math.random() < 0.5 ? 0x2c3e50 : 0x5d6d7e;
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.85, 0.34),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 })
  );
  torso.position.y = 1.15;
  torso.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 })
  );
  head.position.y = 1.82;
  head.castShadow = true;
  const legL = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.75, 0.24),
    new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 })
  );
  legL.position.set(-0.16, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;
  const armL = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.7, 0.18),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 })
  );
  armL.position.set(-0.4, 1.15, 0);
  const armR = armL.clone();
  armR.position.x = 0.4;
  group.add(torso, head, legL, legR, armL, armR);
  group.userData = { legL, legR, armL, armR, torso, head };
  return group;
}

export class PedestrianManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.peds = []; // {mesh, x, z, heading, speed, target, state, timer, walkPhase}
  }

  spawn(count) {
    for (let i = 0; i < count; i++) {
      const p = this.world.randomSidewalkPoint();
      const mesh = makePedMesh();
      mesh.position.set(p.x, 0, p.z);
      this.scene.add(mesh);
      this.peds.push({
        mesh, x: p.x, z: p.z, heading: Math.random() * Math.PI * 2,
        speed: 1.1 + Math.random() * 0.9, target: this.world.randomSidewalkPoint(),
        state: 'walk', timer: 0, walkPhase: Math.random() * 6, downTimer: 0,
      });
    }
  }

  // Flee from a danger point (a speeding car, a punch, a crash).
  scare(x, z, radius) {
    for (const p of this.peds) {
      if (p.state !== 'walk') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) {
        p.state = 'flee';
        p.timer = 2.5 + Math.random() * 2;
        p.fleeFrom = { x, z };
        p.speed = 3.6 + Math.random();
      }
    }
  }

  // Knock one down (punched or run over). Returns true if it was standing.
  knockDown(ped) {
    if (ped.state === 'down') return false;
    ped.state = 'down';
    ped.downTimer = 4;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.3;
    return true;
  }

  // Nearest standing ped within maxDist of (x, z), roughly in front of heading.
  nearestInFront(x, z, heading, maxDist, cone) {
    let best = null;
    let bestD = maxDist;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      const dx = p.x - x;
      const dz = p.z - z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        const dot = (dx * fx + dz * fz) / (d || 1);
        if (dot > (cone || 0.2)) { bestD = d; best = p; }
      }
    }
    return best;
  }

  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  update(dt) {
    for (const p of this.peds) {
      if (p.state === 'down') {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          p.state = 'walk';
          p.mesh.rotation.x = 0;
          p.mesh.position.y = 0;
          const np = this.world.randomSidewalkPoint();
          p.x = np.x;
          p.z = np.z;
          p.target = this.world.randomSidewalkPoint();
        }
        continue;
      }
      if (p.state === 'flee') {
        p.timer -= dt;
        const dx = p.x - p.fleeFrom.x;
        const dz = p.z - p.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        const tx = p.x + (dx / d) * 10;
        const tz = p.z + (dz / d) * 10;
        this._moveToward(p, tx, tz, dt, p.speed);
        if (p.timer <= 0) {
          p.state = 'walk';
          p.speed = 1.1 + Math.random() * 0.9;
          p.target = this.world.randomSidewalkPoint();
        }
        continue;
      }
      const dx = p.target.x - p.x;
      const dz = p.target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) {
        p.target = this.world.randomSidewalkPoint();
        continue;
      }
      this._moveToward(p, p.target.x, p.target.z, dt, p.speed);
    }
  }

  _moveToward(p, tx, tz, dt, speed) {
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const desired = Math.atan2(dx, dz);
    let diff = desired - p.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
    const step = speed * dt;
    const nx = p.x + Math.sin(p.heading) * step;
    const nz = p.z + Math.cos(p.heading) * step;
    if (!this.world.pointInBuilding(nx, nz)) {
      p.x = nx;
      p.z = nz;
    }
    p.walkPhase += dt * speed * 4.5;
    const s = Math.sin(p.walkPhase);
    p.mesh.userData.legL.rotation.x = s * 0.55;
    p.mesh.userData.legR.rotation.x = -s * 0.55;
    p.mesh.userData.armL.rotation.x = -s * 0.45;
    p.mesh.userData.armR.rotation.x = s * 0.45;
    p.mesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.05, p.z);
    p.mesh.rotation.y = p.heading;
  }
}
