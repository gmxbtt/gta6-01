// world.js — builds the city of Solmar Bay: ground, sun-soaked sky, instanced
// buildings, palms, streetlights, the marina and the ocean. Also owns collision.
import * as THREE from 'three';
import { CITY, STREET_COORDS, isOnRoad } from './config.js';

function groundTexture() {
  // One 2048 canvas painted as the whole city floor: asphalt roads, sidewalks,
  // lane dashes, crosswalks and block paving. World maps 1:1 onto it.
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const half = CITY.bound + 20;
  const toPx = (v) => ((v + half) / (half * 2)) * S;
  const pxPerUnit = S / (half * 2);

  // Base: warm concrete / block paving.
  g.fillStyle = '#b8a88f';
  g.fillRect(0, 0, S, S);
  // Block fill: subtle paving variation per block.
  for (let ix = 0; ix < CITY.streets - 1; ix++) {
    for (let iz = 0; iz < CITY.streets - 1; iz++) {
      const x0 = STREET_COORDS[ix] + CITY.roadHalf;
      const z0 = STREET_COORDS[iz] + CITY.roadHalf;
      const w = CITY.pitch - CITY.roadHalf * 2;
      const shade = 168 + ((ix * 7 + iz * 13) % 3) * 8;
      g.fillStyle = `rgb(${shade},${shade - 12},${shade - 34})`;
      g.fillRect(toPx(x0), toPx(z0), w * pxPerUnit, w * pxPerUnit);
    }
  }
  // Sidewalk borders around every block.
  g.strokeStyle = '#8f8271';
  g.lineWidth = 2;
  for (let ix = 0; ix < CITY.streets - 1; ix++) {
    for (let iz = 0; iz < CITY.streets - 1; iz++) {
      const x0 = STREET_COORDS[ix] + CITY.roadHalf;
      const z0 = STREET_COORDS[iz] + CITY.roadHalf;
      const w = CITY.pitch - CITY.roadHalf * 2;
      g.strokeRect(toPx(x0), toPx(z0), w * pxPerUnit, w * pxPerUnit);
    }
  }
  // Asphalt roads.
  g.fillStyle = '#4b4640';
  for (const s of STREET_COORDS) {
    g.fillRect(0, toPx(s - CITY.roadHalf), S, CITY.roadHalf * 2 * pxPerUnit);
    g.fillRect(toPx(s - CITY.roadHalf), 0, CITY.roadHalf * 2 * pxPerUnit, S);
  }
  // Centre dashes (sun-faded yellow).
  g.fillStyle = '#d8b13c';
  const dash = 4;
  const gap = 5;
  for (const s of STREET_COORDS) {
    for (let v = -CITY.bound; v < CITY.bound; v += dash + gap) {
      g.fillRect(toPx(v), toPx(s - 0.3), dash * pxPerUnit, 0.6 * pxPerUnit);
      g.fillRect(toPx(s - 0.3), toPx(v), 0.6 * pxPerUnit, dash * pxPerUnit);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = '#e8e4da';
  for (const sx of STREET_COORDS) {
    for (const sz of STREET_COORDS) {
      for (let k = -2; k <= 2; k++) {
        g.fillRect(toPx(sx + k * 1.6 - 0.6), toPx(sz - CITY.roadHalf + 0.6), 1.2 * pxPerUnit, 2.4 * pxPerUnit);
        g.fillRect(toPx(sx + k * 1.6 - 0.6), toPx(sz + CITY.roadHalf - 3), 1.2 * pxPerUnit, 2.4 * pxPerUnit);
        g.fillRect(toPx(sx - CITY.roadHalf + 0.6), toPx(sz + k * 1.6 - 0.6), 2.4 * pxPerUnit, 1.2 * pxPerUnit);
        g.fillRect(toPx(sx + CITY.roadHalf - 3), toPx(sz + k * 1.6 - 0.6), 2.4 * pxPerUnit, 1.2 * pxPerUnit);
      }
    }
  }
  // South beach strip + marina water edge.
  g.fillStyle = '#e0c98f';
  g.fillRect(0, toPx(150), S, toPx(CITY.bound + 20) - toPx(150));
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildingWindowTexture() {
  // Facade: warm plaster with a grid of lit/unlit windows.
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 24) {
    for (let x = 8; x < 120; x += 20) {
      const lit = Math.random() < 0.28;
      g.fillStyle = lit ? '#ffd98a' : '#2c3e50';
      g.fillRect(x, y, 12, 15);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {minX, maxX, minZ, maxZ}
    this.buildings = [];
    this._buildSky(scene);
    this._buildGround(scene);
    this._buildCity(scene);
    this._buildOcean(scene);
    this._buildBeacons(scene);
  }

  _buildSky(scene) {
    scene.background = new THREE.Color(0xffb36b);
    scene.fog = new THREE.Fog(0xf7a55c, 180, 520);
    // Low sun, warm key light.
    this.sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
    this.sun.position.set(-120, 90, -160);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -180;
    this.sun.shadow.camera.right = 180;
    this.sun.shadow.camera.top = 180;
    this.sun.shadow.camera.bottom = -180;
    this.sun.shadow.camera.far = 600;
    this.sun.shadow.bias = -0.0004;
    scene.add(this.sun);
    scene.add(new THREE.HemisphereLight(0xffd9b0, 0x5a4a6a, 1.05));
    // A big low sun disc + a few clouds for the sunset look.
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(26, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false })
    );
    sunDisc.position.set(-260, 55, -380);
    sunDisc.lookAt(0, 40, 0);
    scene.add(sunDisc);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffe0c0, transparent: true, opacity: 0.75, fog: false });
    for (let i = 0; i < 10; i++) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(14 + Math.random() * 16, 8, 6), cloudMat);
      cloud.scale.y = 0.35;
      cloud.position.set(-260 + Math.random() * 520, 95 + Math.random() * 45, -330 + Math.random() * 120);
      scene.add(cloud);
    }
  }

  _buildGround(scene) {
    const half = CITY.bound + 20;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2, half * 2),
      new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  _buildCity(scene) {
    const facade = buildingWindowTexture();
    // One instanced box for every building: cheap draw calls, per-instance tint.
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    const boxMat = new THREE.MeshStandardMaterial({ map: facade, roughness: 0.85 });
    const placements = [];
    const palette = [0xd8a06a, 0xc98a7a, 0xe0b98a, 0xb08a9a, 0x9ab0c0, 0xd0c0a0, 0xc0a080, 0xe8c090];
    // Buildings fill each block; some blocks stay open (plaza, park, car park).
    for (let ix = 0; ix < CITY.streets - 1; ix++) {
      for (let iz = 0; iz < CITY.streets - 1; iz++) {
        const bx = (STREET_COORDS[ix] + STREET_COORDS[ix + 1]) / 2;
        const bz = (STREET_COORDS[iz] + STREET_COORDS[iz + 1]) / 2;
        const open = (ix === 2 && iz === 2) || (ix === 4 && iz === 1);
        if (open) {
          this._buildPlaza(scene, bx, bz);
          continue;
        }
        const count = 1 + Math.floor(Math.random() * 2);
        for (let k = 0; k < count; k++) {
          const w = 14 + Math.random() * 12;
          const d = 14 + Math.random() * 12;
          const h = 9 + Math.random() * Math.random() * 52;
          const ox = (Math.random() - 0.5) * (CITY.blockHalf * 2 - w - 4);
          const oz = (Math.random() - 0.5) * (CITY.blockHalf * 2 - d - 4);
          const x = bx + ox;
          const z = bz + oz;
          placements.push({ x, z, w, d, h, color: palette[Math.floor(Math.random() * palette.length)] });
          this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
          this.buildings.push({ x, z, w, d, h });
        }
      }
    }
    const inst = new THREE.InstancedMesh(boxGeo, boxMat, placements.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    placements.forEach((b, i) => {
      p.set(b.x, 0, b.z);
      s.set(b.w, b.h, b.d);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.setHex(b.color));
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    scene.add(inst);

    // Rooftop water tanks on a few towers.
    const tankGeo = new THREE.CylinderGeometry(1.4, 1.4, 2.4, 8);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 });
    const tanks = new THREE.InstancedMesh(tankGeo, tankMat, 24);
    let ti = 0;
    for (const b of this.buildings) {
      if (b.h > 26 && ti < 24) {
        p.set(b.x, b.h + 1.2, b.z);
        s.set(1, 1, 1);
        m.compose(p, q, s);
        tanks.setMatrixAt(ti++, m);
      }
    }
    tanks.count = ti;
    tanks.castShadow = true;
    scene.add(tanks);

    this._buildPalms(scene);
    this._buildStreetlights(scene);
  }

  _buildPlaza(scene, bx, bz) {
    // Open plaza: fountain disc + benches (low boxes, colliders).
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6.5, 1.1, 20),
      new THREE.MeshStandardMaterial({ color: 0x7fb8c9, roughness: 0.3, metalness: 0.1 })
    );
    fountain.position.set(bx, 0.55, bz);
    fountain.castShadow = true;
    scene.add(fountain);
    this.colliders.push({ minX: bx - 6, maxX: bx + 6, minZ: bz - 6, maxZ: bz + 6 });
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
    for (let k = 0; k < 4; k++) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 1), benchMat);
      const a = (k / 4) * Math.PI * 2;
      bench.position.set(bx + Math.cos(a) * 11, 0.4, bz + Math.sin(a) * 11);
      bench.rotation.y = -a;
      bench.castShadow = true;
      scene.add(bench);
    }
  }

  _buildPalms(scene) {
    const spots = [];
    for (const sx of STREET_COORDS) {
      for (const sz of STREET_COORDS) {
        if (Math.random() < 0.5) {
          spots.push({ x: sx + CITY.roadHalf + 2.5, z: sz + (Math.random() - 0.5) * 30 });
          spots.push({ x: sx - CITY.roadHalf - 2.5, z: sz + (Math.random() - 0.5) * 30 });
        }
      }
    }
    // Beach palms along the south shore.
    for (let x = -150; x <= 150; x += 18) {
      spots.push({ x: x + (Math.random() - 0.5) * 6, z: 156 + Math.random() * 6 });
    }
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.5, 6);
    trunkGeo.translate(0, 2.75, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const canopyGeo = new THREE.IcosahedronGeometry(2.6, 0);
    canopyGeo.scale(1, 0.45, 1);
    canopyGeo.translate(0, 5.8, 0);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 });
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    spots.forEach((sp, i) => {
      e.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.12);
      q.setFromEuler(e);
      p.set(sp.x, 0, sp.z);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);
      canopies.setMatrixAt(i, m);
      this.colliders.push({ minX: sp.x - 0.5, maxX: sp.x + 0.5, minZ: sp.z - 0.5, maxZ: sp.z + 0.5 });
    });
    trunks.castShadow = true;
    canopies.castShadow = true;
    scene.add(trunks);
    scene.add(canopies);
  }

  _buildStreetlights(scene) {
    const spots = [];
    for (const sx of STREET_COORDS) {
      for (const sz of STREET_COORDS) {
        spots.push({ x: sx + CITY.roadHalf - 0.8, z: sz });
        spots.push({ x: sx, z: sz + CITY.roadHalf - 0.8 });
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6);
    poleGeo.translate(0, 3.25, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.6, metalness: 0.5 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const lampGeo = new THREE.SphereGeometry(0.22, 8, 6);
    lampGeo.translate(0, 6.6, 0);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    spots.forEach((sp, i) => {
      p.set(sp.x, 0, sp.z);
      m.compose(p, q, s);
      poles.setMatrixAt(i, m);
      lamps.setMatrixAt(i, m);
    });
    scene.add(poles);
    scene.add(lamps);
  }

  _buildOcean(scene) {
    // The bay south of the city: animated-ish blue plane + a pier.
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 260),
      new THREE.MeshStandardMaterial({ color: 0x2a6f8f, roughness: 0.25, metalness: 0.35 })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -0.4, 320);
    scene.add(ocean);
    this.ocean = ocean;
    // Wooden pier at the south-west marina.
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 40), pierMat);
    pier.position.set(-135, 0.4, 168);
    pier.castShadow = true;
    scene.add(pier);
  }

  _buildBeacons(scene) {
    // One reusable waypoint beacon: a glowing column + ring, moved by missions.
    const group = new THREE.Group();
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 26, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    col.position.y = 13;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd23c })
    );
    marker.position.y = 9;
    group.add(col);
    group.add(ring);
    group.add(marker);
    group.visible = false;
    scene.add(group);
    this.beacon = group;
    this.beaconMarker = marker;
  }

  setBeacon(x, z, visible) {
    this.beacon.position.set(x, 0, z);
    this.beacon.visible = visible;
  }

  update(dt, time) {
    if (this.beacon.visible) {
      this.beaconMarker.position.y = 8 + Math.sin(time * 2.2) * 1.2;
      this.beaconMarker.rotation.y += dt * 1.5;
    }
    if (this.ocean) {
      this.ocean.position.y = -0.4 + Math.sin(time * 0.5) * 0.08;
    }
  }

  // Circle vs building AABBs + world bounds. Mutates pos, returns hit info.
  collideCircle(pos, radius) {
    let hit = false;
    for (const b of this.colliders) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (radius - d) / d;
          pos.x += dx * push;
          pos.z += dz * push;
        } else {
          // Centre inside the box: push out along the smallest penetration axis.
          const pl = pos.x - b.minX;
          const pr = b.maxX - pos.x;
          const pt = pos.z - b.minZ;
          const pb = b.maxZ - pos.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x = b.minX - radius;
          else if (m === pr) pos.x = b.maxX + radius;
          else if (m === pt) pos.z = b.minZ - radius;
          else pos.z = b.maxZ + radius;
        }
      }
    }
    const B = CITY.bound;
    if (pos.x < -B) { pos.x = -B; hit = true; }
    if (pos.x > B) { pos.x = B; hit = true; }
    if (pos.z < -B) { pos.z = -B; hit = true; }
    if (pos.z > B) { pos.z = B; hit = true; }
    return hit;
  }

  pointInBuilding(x, z) {
    return this.colliders.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
  }

  // A random point on a sidewalk (block edge), for pedestrian spawns.
  randomSidewalkPoint() {
    for (let tries = 0; tries < 20; tries++) {
      const ix = Math.floor(Math.random() * (CITY.streets - 1));
      const iz = Math.floor(Math.random() * (CITY.streets - 1));
      const bx = (STREET_COORDS[ix] + STREET_COORDS[ix + 1]) / 2;
      const bz = (STREET_COORDS[iz] + STREET_COORDS[iz + 1]) / 2;
      const side = Math.floor(Math.random() * 4);
      const t = (Math.random() - 0.5) * (CITY.blockHalf * 2 - 4);
      let x = bx;
      let z = bz;
      if (side === 0) { x = bx + t; z = bz - CITY.blockHalf - 1.5; }
      if (side === 1) { x = bx + t; z = bz + CITY.blockHalf + 1.5; }
      if (side === 2) { x = bx - CITY.blockHalf - 1.5; z = bz + t; }
      if (side === 3) { x = bx + CITY.blockHalf + 1.5; z = bz + t; }
      if (!this.pointInBuilding(x, z)) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  // A random point on a road lane, for traffic spawns.
  randomRoadPoint() {
    const along = Math.random() < 0.5;
    const street = STREET_COORDS[Math.floor(Math.random() * STREET_COORDS.length)];
    const lane = (Math.random() < 0.5 ? -3.4 : 3.4);
    const alongPos = (Math.random() - 0.5) * 2 * (CITY.bound - 10);
    return along ? { x: alongPos, z: street + lane } : { x: street + lane, z: alongPos };
  }
}
