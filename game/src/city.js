// city.js — builds Solmar Bay: the avenue grid, beach and pier, the skyline
// with lit windows and neon signs, stunt ramps, hidden packages and cash
// stashes. Also owns collision: every building is an AABB the player, cars
// and cops all respect.

import * as THREE from 'three';
import { WORLD, LANDMARKS, RAMPS, PACKAGE_SPOTS, STASH_SPOTS, PALETTE, mulberry32 } from './tuning.js';

const NEON_WORDS = ['SOLMAR', 'PIER 9', 'TACOS', 'NEON', 'HOTEL', 'CASINO', 'BAR', '24H', 'SURF', 'DANCE', 'RAMEN', 'MOTEL'];

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function windowTexture(baseColor, litRatio, rng) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = baseColor;
    g.fillRect(0, 0, w, h);
    const cols = 6, rows = 14;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = rng() < litRatio;
        g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#9adcff') : '#2b2f38';
        g.fillRect(6 + x * 20, 8 + y * 17, 12, 10);
      }
    }
  });
}

function neonTexture(word, color) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#101018';
    g.fillRect(0, 0, w, h);
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.fillStyle = color;
    g.fillText(word, w / 2, h / 2 + 2);
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff';
    g.fillText(word, w / 2, h / 2 + 2);
  });
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.rng = mulberry32(WORLD.seed);
    this.colliders = [];   // { x0, z0, x1, z1 }
    this.buildings = [];   // { x, z, w, d, color } for the minimap
    this.ramps = RAMPS.map((r) => ({ ...r }));
    this.packages = [];    // { x, z, mesh, taken }
    this.stashes = [];     // { x, z, mesh, taken }
    this.boatDock = { x: 196, z: 12 };
    this._buildGround();
    this._buildRoads();
    this._buildSkyline();
    this._buildPier();
    this._buildRamps();
    this._buildPickups();
  }

  _mat(color, opts = {}) {
    return new THREE.MeshLambertMaterial({ color, ...opts });
  }

  _box(w, h, d, color, x, y, z, opts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this._mat(color, opts));
    m.position.set(x, y, z);
    this.scene.add(m);
    return m;
  }

  _buildGround() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.bound * 2 + 120, WORLD.bound * 2 + 120),
      this._mat(PALETTE.ground),
    );
    g.rotation.x = -Math.PI / 2;
    g.position.set(30, -0.05, 0);
    this.scene.add(g);
    // Sand strip along the east beach: a thin edge, then open water.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(12, WORLD.bound * 2 + 120),
      this._mat(PALETTE.sand),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(172, 0.0, 0);
    this.scene.add(sand);
    // The bay itself, east of the beach.
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(300, WORLD.bound * 2 + 120),
      new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(320, 0.06, 0);
    this.scene.add(water);
  }

  _buildRoads() {
    const roadMat = this._mat(PALETTE.asphalt);
    const walkMat = this._mat(PALETTE.sidewalk);
    for (const a of WORLD.avenues) {
      for (const vertical of [true, false]) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadHalf * 2, WORLD.bound * 2), roadMat);
        road.rotation.x = -Math.PI / 2;
        if (vertical) road.rotation.z = Math.PI / 2;
        road.position.set(vertical ? a : 0, 0.02, vertical ? 0 : a);
        this.scene.add(road);
        // Sidewalk ribbons flanking each avenue.
        for (const side of [-1, 1]) {
          const walk = new THREE.Mesh(new THREE.PlaneGeometry(3, WORLD.bound * 2), walkMat);
          walk.rotation.x = -Math.PI / 2;
          if (vertical) walk.rotation.z = Math.PI / 2;
          const off = WORLD.roadHalf + 1.5;
          walk.position.set(vertical ? a + side * off : 0, 0.03, vertical ? 0 : a + side * off);
          this.scene.add(walk);
        }
        // Dashed centre line.
        for (let t = -WORLD.bound + 6; t < WORLD.bound; t += 12) {
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 5), this._mat(0xe8d84a));
          dash.rotation.x = -Math.PI / 2;
          if (vertical) dash.rotation.z = Math.PI / 2;
          dash.position.set(vertical ? a : t, 0.04, vertical ? t : a);
          this.scene.add(dash);
        }
      }
    }
  }

  _buildSkyline() {
    const rng = this.rng;
    const mids = [-90, -30, 30, 90]; // block centres between avenues
    let neonIdx = 0;
    for (const bx of mids) {
      for (const bz of mids) {
        const count = 1 + Math.floor(rng() * 3);
        for (let i = 0; i < count; i++) {
          const w = 16 + rng() * 18;
          const d = 16 + rng() * 18;
          const h = 9 + rng() * rng() * 34; // a few towers, mostly low-rise
          const x = bx + (rng() - 0.5) * (48 - w - 4);
          const z = bz + (rng() - 0.5) * (48 - d - 4);
          const color = PALETTE.building[Math.floor(rng() * PALETTE.building.length)];
          const hex = '#' + color.toString(16).padStart(6, '0');
          const tex = windowTexture(hex, 0.45, rng);
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            new THREE.MeshLambertMaterial({ map: tex }),
          );
          mesh.position.set(x, h / 2, z);
          this.scene.add(mesh);
          // Flat roof cap + a rooftop box on the tall ones.
          this._box(w * 0.96, 0.5, d * 0.96, 0x4a4238, x, h + 0.25, z);
          if (h > 26) this._box(5, 3, 5, 0x5a5248, x + w * 0.2, h + 1.8, z - d * 0.15);
          this.colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
          this.buildings.push({ x, z, w, d, color });
          // Neon sign on roughly every other building.
          if (rng() < 0.55) {
            const word = NEON_WORDS[neonIdx++ % NEON_WORDS.length];
            const neon = PALETTE.neon[Math.floor(rng() * PALETTE.neon.length)];
            const css = '#' + neon.toString(16).padStart(6, '0');
            const sign = new THREE.Mesh(
              new THREE.PlaneGeometry(14, 3.5),
              new THREE.MeshBasicMaterial({ map: neonTexture(word, css) }),
            );
            const face = rng() < 0.5 ? 0 : Math.PI / 2;
            sign.position.set(x + (face === 0 ? 0 : w / 2 + 0.2), h * 0.72, z + (face === 0 ? d / 2 + 0.2 : 0));
            sign.rotation.y = face;
            this.scene.add(sign);
          }
        }
      }
    }
    // Solmar Plaza: a fountain ring and palm trees at the centre.
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 8, 1.2, 20),
      this._mat(0x7fb5c9),
    );
    fountain.position.set(0, 0.6, 0);
    this.scene.add(fountain);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this._palm(Math.cos(a) * 26, Math.sin(a) * 26);
    }
    // Palm rows along the beachfront avenue.
    for (let z = -150; z <= 150; z += 30) {
      this._palm(132, z + 6);
      this._palm(-132, z - 6);
    }
  }

  _palm(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, 7, 6),
      this._mat(0x8a6a42),
    );
    trunk.position.set(x, 3.5, z);
    trunk.rotation.z = 0.12;
    this.scene.add(trunk);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(3.2, 2.4, 7),
      this._mat(0x3f8f4f),
    );
    top.position.set(x + 0.8, 7.6, z);
    this.scene.add(top);
  }

  _buildPier() {
    // Wooden pier deck running east from the beach into the bay.
    const deck = this._box(56, 1, 12, 0x9a7a52, 188, 0.6, 0);
    deck.receiveShadow = false;
    for (let x = 164; x <= 212; x += 8) {
      this._box(1, 3, 1, 0x7a5f3e, x, -0.5, -5);
      this._box(1, 3, 1, 0x7a5f3e, x, -0.5, 5);
    }
    // Pier rails are solid so cars cannot drive off the end by accident.
    this.colliders.push({ x0: 160, z0: -7, x1: 216, z1: -5.4 });
    this.colliders.push({ x0: 160, z0: 5.4, x1: 216, z1: 7 });
    // A couple of moored boats for scenery.
    this._boatHull(206, -14, 0.4, 0x3a6ea5);
    this._boatHull(200, 18, -0.3, 0xd96a1e);
    // Pier 9 sign.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({ map: neonTexture('PIER 9', '#00e5ff') }),
    );
    sign.position.set(168, 7, 0);
    sign.rotation.y = -Math.PI / 2;
    this.scene.add(sign);
  }

  _boatHull(x, z, yaw, color) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 2, 3.4), this._mat(color));
    hull.position.set(x, 0.6, z);
    hull.rotation.y = yaw;
    this.scene.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 2.6), this._mat(0xe8e8e8));
    cabin.position.set(x, 2.4, z);
    cabin.rotation.y = yaw;
    this.scene.add(cabin);
  }

  _buildRamps() {
    for (const r of this.ramps) {
      const ramp = new THREE.Mesh(
        new THREE.BoxGeometry(10, 1.2, 6),
        this._mat(0xffd23f),
      );
      ramp.position.set(r.x, 0.6, r.z);
      ramp.rotation.y = Math.atan2(r.dirX, r.dirZ);
      ramp.rotation.x = 0;
      // Tilt the slab so it reads as a jump: rotate around the axis across travel.
      ramp.rotation.z = 0;
      ramp.rotateOnWorldAxis(new THREE.Vector3(r.dirZ, 0, -r.dirX).normalize(), -0.35);
      this.scene.add(ramp);
      // Chevron paint on the approach.
      const chev = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 3),
        this._mat(0xff6a00),
      );
      chev.rotation.x = -Math.PI / 2;
      chev.rotation.z = Math.atan2(r.dirX, r.dirZ);
      chev.position.set(r.x - r.dirX * 8, 0.05, r.z - r.dirZ * 8);
      this.scene.add(chev);
    }
  }

  _buildPickups() {
    for (const [x, z] of PACKAGE_SPOTS) {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.1),
        new THREE.MeshBasicMaterial({ color: 0x00e5ff }),
      );
      mesh.position.set(x, 1.4, z);
      this.scene.add(mesh);
      this.packages.push({ x, z, mesh, taken: false });
    }
    for (const [x, z] of STASH_SPOTS) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.7, 1.2),
        this._mat(0x2fae4f, { emissive: 0x0a3a14 }),
      );
      mesh.position.set(x, 0.4, z);
      this.scene.add(mesh);
      this.stashes.push({ x, z, mesh, taken: false });
    }
  }

  // Push a circle (x, z, radius) out of every collider it overlaps.
  collideCircle(pos, radius) {
    for (const c of this.colliders) {
      const cx = Math.max(c.x0, Math.min(pos.x, c.x1));
      const cz = Math.max(c.z0, Math.min(pos.z, c.z1));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          pos.x += radius;
        }
      }
    }
    const b = WORLD.bound;
    pos.x = Math.max(-b, Math.min(b, pos.x));
    pos.z = Math.max(-b, Math.min(b, pos.z));
  }

  isWater(x) { return x > WORLD.waterX; }

  isOnRoad(x, z) {
    for (const a of WORLD.avenues) {
      if (Math.abs(x - a) < WORLD.roadHalf + 1) return true;
      if (Math.abs(z - a) < WORLD.roadHalf + 1) return true;
    }
    return false;
  }

  // Nearest avenue coordinate on one axis, for traffic and roadblocks.
  nearestAvenue(v) {
    let best = WORLD.avenues[0];
    for (const a of WORLD.avenues) if (Math.abs(a - v) < Math.abs(best - v)) best = a;
    return best;
  }

  // A ramp the ride is crossing right now, or null.
  rampAt(x, z) {
    for (const r of this.ramps) {
      if (Math.abs(x - r.x) < r.w / 2 + 1 && Math.abs(z - r.z) < 4) return r;
    }
    return null;
  }

  update(dt, time) {
    // Bob the packages so they read as collectibles from a distance.
    for (const p of this.packages) {
      if (p.taken) continue;
      p.mesh.position.y = 1.4 + Math.sin(time * 2 + p.x) * 0.3;
      p.mesh.rotation.y += dt * 1.5;
    }
  }
}
