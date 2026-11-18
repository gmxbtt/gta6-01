// effects.js — one pooled particle system for crash sparks, smoke, dust and
// punch stars. Points with per-particle velocity, life and colour.
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.max = 600;
    this.positions = new Float32Array(this.max * 3);
    this.colors = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.gravity = new Float32Array(this.max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    // Park every particle far underground until used.
    for (let i = 0; i < this.max; i++) this.positions[i * 3 + 1] = -100;
  }

  spawn(x, y, z, opts) {
    const n = opts.count || 10;
    const color = new THREE.Color(opts.color || 0xffcc66);
    const spread = opts.spread || 3;
    const up = opts.up || 3;
    const life = opts.life || 0.7;
    const grav = opts.gravity !== undefined ? opts.gravity : -6;
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
      this.vel[i * 3] = (Math.random() - 0.5) * spread * 2;
      this.vel[i * 3 + 1] = Math.random() * up;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
      this.colors[i * 3] = color.r;
      this.colors[i * 3 + 1] = color.g;
      this.colors[i * 3 + 2] = color.b;
      this.life[i] = life * (0.6 + Math.random() * 0.7);
      this.maxLife[i] = this.life[i];
      this.gravity[i] = grav;
    }
  }

  burst(x, y, z, kind) {
    if (kind === 'crash') this.spawn(x, y, z, { count: 22, color: 0xffb347, spread: 5, up: 5, life: 0.6, gravity: -9 });
    else if (kind === 'smoke') this.spawn(x, y, z, { count: 6, color: 0x555555, spread: 1.2, up: 2.5, life: 1.4, gravity: 2 });
    else if (kind === 'dust') this.spawn(x, y, z, { count: 5, color: 0xcbb58a, spread: 2, up: 1.5, life: 0.8, gravity: -2 });
    else if (kind === 'stars') this.spawn(x, y, z, { count: 10, color: 0xffe14d, spread: 3, up: 4, life: 0.5, gravity: -4 });
    else if (kind === 'cash') this.spawn(x, y, z, { count: 14, color: 0x7de07d, spread: 3, up: 5, life: 0.9, gravity: -5 });
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -100;
        continue;
      }
      this.vel[i * 3 + 1] += this.gravity[i] * dt;
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
