// traffic.js — ambient traffic: cars that cruise the street grid on random
// walks between intersections, brake for the car ahead, and can be stolen.
import { CITY, STREET_COORDS } from './config.js';
import { Car, randomBodyColor } from './vehicles.js';

const LANE = 3.4;

export class TrafficManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cars = []; // {car, path: [{x,z}], node}
    this.types = ['sedan', 'sedan', 'taxi', 'coupe', 'van', 'truck'];
  }

  spawn(count) {
    for (let i = 0; i < count; i++) this.spawnOne();
  }

  spawnOne(at) {
    const type = this.types[Math.floor(Math.random() * this.types.length)];
    const p = at || this.world.randomRoadPoint();
    const heading = Math.random() * Math.PI * 2;
    const car = new Car(type, p.x, p.z, heading);
    // Random paint job (taxis stay yellow).
    if (type !== 'taxi') car.mesh.children[0].material.color.setHex(randomBodyColor());
    car.speed = 6 + Math.random() * 5;
    car.cruiseSpeed = car.speed;
    this.scene.add(car.mesh);
    const entry = { car, path: this._newPath(p.x, p.z), wait: 0 };
    this.cars.push(entry);
    return entry;
  }

  // Random walk over intersection nodes.
  _newPath(x, z) {
    const path = [];
    let ix = Math.floor(Math.random() * STREET_COORDS.length);
    let iz = Math.floor(Math.random() * STREET_COORDS.length);
    // Snap the start to the nearest intersection so the walk is on the grid.
    let cx = STREET_COORDS[ix];
    let cz = STREET_COORDS[iz];
    path.push({ x: cx, z: cz });
    for (let k = 0; k < 5; k++) {
      const horiz = Math.random() < 0.5;
      if (horiz) ix = Math.max(0, Math.min(STREET_COORDS.length - 1, ix + (Math.random() < 0.5 ? -1 : 1)));
      else iz = Math.max(0, Math.min(STREET_COORDS.length - 1, iz + (Math.random() < 0.5 ? -1 : 1)));
      cx = STREET_COORDS[ix];
      cz = STREET_COORDS[iz];
      path.push({ x: cx, z: cz });
    }
    return path;
  }

  // Steal a traffic car: remove it from traffic, hand the Car to the caller.
  steal(entry) {
    const i = this.cars.indexOf(entry);
    if (i >= 0) this.cars.splice(i, 1);
    return entry.car;
  }

  nearestCar(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const e of this.cars) {
      const d = Math.hypot(e.car.pos.x - pos.x, e.car.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  update(dt, playerCar, policeCars) {
    const all = this.cars.map((e) => e.car);
    for (const e of this.cars) {
      const car = e.car;
      if (car.wrecked) continue;
      const target = e.path[0];
      if (!target) {
        e.path = this._newPath(car.pos.x, car.pos.z);
        continue;
      }
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3) {
        e.path.shift();
        continue;
      }
      // Desired heading, with a right-hand lane offset.
      const desired = Math.atan2(dx, dz);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 1.6));
      // Brake if a car is close ahead.
      let throttle = 0.55;
      const ahead = this._carAhead(car, all, playerCar, policeCars);
      if (ahead < 9) throttle = ahead < 5 ? -0.8 : 0.1;
      car.step({ throttle, steer }, dt, this.world, all);
      // Keep traffic on the roads: if it drifted into a block, re-path.
      if (Math.abs(car.speed) < 0.2 && e.wait !== undefined) {
        e.wait += dt;
        if (e.wait > 3) { e.path = this._newPath(car.pos.x, car.pos.z); e.wait = 0; }
      } else {
        e.wait = 0;
      }
    }
    // Top the traffic back up if the player stole or wrecked some.
    if (this.cars.length < 12 && Math.random() < dt * 0.2) this.spawnOne();
  }

  _carAhead(car, all, playerCar, policeCars) {
    const f = car.forward;
    let best = 999;
    const check = (other) => {
      if (other === car) return;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const along = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (along > 0 && along < 14 && side < 2.4 && along < best) best = along;
    };
    all.forEach(check);
    if (playerCar) check(playerCar);
    if (policeCars) policeCars.forEach(check);
    return best;
  }
}
