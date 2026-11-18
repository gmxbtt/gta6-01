// flow.js — Solmar Bay traffic: civilian cars cruise the avenue grid on
// lanes, change lanes to overtake a slower car, and brake for the player's
// car ahead of them. Cars that drift too far from the player are recycled
// to a road near the player so the streets always feel alive.

import { WORLD } from './tuning.js';

const KINDS = ['sedan', 'sedan', 'taxi', 'truck', 'sedan'];

export class Traffic {
  constructor(yard, city) {
    this.yard = yard;
    this.city = city;
    this.cars = []; // Ride objects with driver 'npc', plus route state
    this._spawnInitial();
  }

  _spawnInitial() {
    for (let i = 0; i < 10; i++) {
      const kind = KINDS[i % KINDS.length];
      const vertical = i % 2 === 0;
      const av = WORLD.avenues[1 + (i % 3)];
      const along = -100 + i * 22;
      const x = vertical ? av : along;
      const z = vertical ? along : av;
      const ride = this.yard.addRide(kind, x, z, vertical ? 0 : Math.PI / 2);
      ride.driver = 'npc';
      const car = {
        ride,
        vertical,
        dir: i % 4 < 2 ? 1 : -1,
        lane: (i % 2 === 0 ? 1 : -1) * 3,
        laneTarget: (i % 2 === 0 ? 1 : -1) * 3,
        laneTimer: 0,
        cruise: 11 + Math.random() * 6,
        nextTurn: 30 + Math.random() * 60,
      };
      ride.heading = vertical ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.cars.push(car);
    }
  }

  _carAhead(car, heroRide) {
    const r = car.ride;
    const fx = Math.sin(r.heading);
    const fz = Math.cos(r.heading);
    let best = null;
    let bestD = 16;
    const check = (x, z, obj) => {
      const dx = x - r.pos.x;
      const dz = z - r.pos.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < bestD && side < 3.2) { bestD = along; best = obj; }
    };
    for (const other of this.cars) {
      if (other !== car) check(other.ride.pos.x, other.ride.pos.z, other);
    }
    if (heroRide) check(heroRide.pos.x, heroRide.pos.z, 'hero');
    return best ? { obj: best, dist: bestD } : null;
  }

  update(dt, hero) {
    const heroRide = hero.inRide;
    for (const car of this.cars) {
      const r = car.ride;
      car.laneTimer -= dt;
      car.nextTurn -= dt * Math.abs(r.speed);
      const ahead = this._carAhead(car, heroRide);
      // Lane change: a slower car ahead and room on the other side.
      if (ahead && ahead.obj !== 'hero' && car.laneTimer <= 0) {
        const other = ahead.obj;
        const otherSpeed = other.ride ? other.ride.speed : 0;
        if (r.speed > otherSpeed + 1 && ahead.dist < 14) {
          car.laneTarget = -car.laneTarget;
          car.laneTimer = 7;
        }
      }
      // Brake for anything stopped ahead, including the player's car.
      let cruise = car.cruise;
      if (ahead) {
        const aheadSpeed = ahead.obj === 'hero' ? (heroRide ? heroRide.speed : 0) : ahead.obj.ride.speed;
        if (ahead.dist < 8) cruise = Math.min(cruise, Math.max(0, aheadSpeed));
        else if (ahead.dist < 14) cruise = Math.min(cruise, aheadSpeed + 4);
      }
      // Ease toward the target lane.
      car.lane += (car.laneTarget - car.lane) * Math.min(1, dt * 1.2);
      // Target heading: along the avenue, nudged toward the lane offset.
      const av = car.vertical ? this.city.nearestAvenue(r.pos.x) : this.city.nearestAvenue(r.pos.z);
      const alongAxis = car.vertical ? r.pos.z : r.pos.x;
      const crossAxis = car.vertical ? r.pos.x : r.pos.z;
      const crossErr = (av + car.lane * car.dir) - crossAxis;
      const baseHeading = car.vertical ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const targetHeading = baseHeading + Math.max(-0.5, Math.min(0.5, crossErr * 0.08 * car.dir));
      r.cruise(dt, targetHeading, cruise, this.city);
      // At an intersection, sometimes turn onto the crossing avenue.
      const atCrossing = WORLD.avenues.some((a) => Math.abs(alongAxis - a) < 2.5);
      if (atCrossing && car.nextTurn <= 0 && Math.random() < 0.02) {
        car.vertical = !car.vertical;
        car.dir = Math.random() < 0.5 ? 1 : -1;
        car.nextTurn = 60 + Math.random() * 80;
      }
      if (atCrossing && car.nextTurn <= 0) car.nextTurn = 40;
      // Recycle cars that ended up far from the action.
      const dHero = Math.hypot(r.pos.x - hero.pos.x, r.pos.z - hero.pos.z);
      if (dHero > 220) {
        const av2 = WORLD.avenues[Math.floor(Math.random() * WORLD.avenues.length)];
        const vert = Math.random() < 0.5;
        r.pos.set(vert ? av2 : hero.pos.x + (Math.random() - 0.5) * 80, 0, vert ? hero.pos.z + (Math.random() - 0.5) * 80 : av2);
        r.speed = 0;
        car.vertical = vert;
        car.dir = Math.random() < 0.5 ? 1 : -1;
      }
    }
  }
}
