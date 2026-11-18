// fx.js — juice: crash bursts, landing dust, muzzle sparks and the little
// screen shake that sells a ram. Particles are a reused pool of small boxes,
// so the effect budget never grows with play time.

import * as THREE from 'three';

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.28, 0.28),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      m.visible = false;
      scene.add(m);
      this.pool.push({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 1 });
    }
    this.shakeAmt = 0;
  }

  _spawn(x, y, z, color, speed, up, life) {
    const p = this.pool.find((q) => q.life <= 0);
    if (!p) return;
    p.mesh.visible = true;
    p.mesh.material.color.setHex(color);
    p.mesh.position.set(x, y, z);
    const a = Math.random() * Math.PI * 2;
    p.vel.set(Math.cos(a) * speed, up + Math.random() * 2, Math.sin(a) * speed);
    p.life = life;
    p.max = life;
  }

  spawnCrash(x, z, strength = 1) {
    const n = Math.round(10 * strength);
    for (let i = 0; i < n; i++) {
      this._spawn(x, 1, z, i % 3 === 0 ? 0xffd23f : 0xff6a00, 4 * strength, 3, 0.6);
    }
  }

  spawnDust(x, z, n = 8) {
    for (let i = 0; i < n; i++) {
      this._spawn(x + (Math.random() - 0.5) * 3, 0.4, z + (Math.random() - 0.5) * 3, 0xcbb98a, 1.5, 1, 0.9);
    }
  }

  spawnSparks(x, y, z) {
    for (let i = 0; i < 8; i++) {
      this._spawn(x, y, z, 0xffe97a, 5, 2, 0.35);
    }
  }

  shake(amount) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.15) p.mesh.position.y = 0.15;
      const s = p.life / p.max;
      p.mesh.scale.setScalar(0.5 + s);
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.4);
  }

  // A small random offset the camera adds while shakeAmt is alive.
  shakeOffset(time) {
    if (this.shakeAmt <= 0) return { x: 0, y: 0 };
    return {
      x: Math.sin(time * 61) * 0.22 * this.shakeAmt,
      y: Math.cos(time * 53) * 0.16 * this.shakeAmt,
    };
  }
}
