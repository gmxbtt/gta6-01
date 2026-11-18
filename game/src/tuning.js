// tuning.js — every number that shapes Solmar Bay lives here, in one place,
// so the rest of the game reads like a design doc instead of a pile of literals.

export const WORLD = {
  bound: 190,            // playable square runs -bound..bound on x and z
  avenues: [-120, -60, 0, 60, 120], // the five north-south and east-west avenues
  roadHalf: 6,           // half-width of an avenue
  waterX: 172,           // east of this line is the bay
  seed: 1337,            // city layout is deterministic so screenshots repeat
};

export const LANDMARKS = {
  chopShop:   { x: 132,  z: -132, label: 'Chop Shop' },
  bank:       { x: -66,  z: 66,   label: 'Solmar Bank' },
  safehouse:  { x: -132, z: 132,  label: 'Safehouse' },
  marinaBar:  { x: 66,   z: 132,  label: 'Marina Bar' },
  pier:       { x: 168,  z: 0,    label: 'Pier 9' },
  buoy:       { x: 232,  z: 30,   label: 'Buoy Ring' },
  plaza:      { x: 0,    z: 0,    label: 'Solmar Plaza' },
};

// Stunt ramps: a ride crossing one fast enough goes airborne.
export const RAMPS = [
  { x: 60,  z: -30, dirX: 1, dirZ: 0, w: 10 },
  { x: -60, z: 90,  dirX: -1, dirZ: 0, w: 10 },
  { x: 0,   z: -90, dirX: 0, dirZ: -1, w: 10 },
];

// Twelve hidden packages glow across the city; finding them all pays out.
export const PACKAGE_SPOTS = [
  [-108, -108], [-108, 48], [-48, -108], [-48, 108], [48, -48],
  [108, -108], [108, 48], [12, -108], [-12, 108], [108, 108],
  [-108, -48], [48, 108],
];

// Ten cash stashes tucked behind buildings and under the pier.
export const STASH_SPOTS = [
  [-102, -84], [-84, 102], [102, -84], [84, 102], [-24, -84],
  [24, 84], [-102, 24], [102, -24], [156, -24], [156, 24],
];

// Parked rides the player can steal, with their kind and facing.
// Every spot sits on an avenue lane, clear of the building blocks.
export const PARKED_RIDES = [
  { kind: 'sedan', x: -57, z: -18, heading: 0 },
  { kind: 'taxi',  x: 3,   z: -57, heading: Math.PI / 2 },
  { kind: 'sedan', x: 63,  z: 18,  heading: Math.PI },
  { kind: 'truck', x: -3,  z: 117, heading: -Math.PI / 2 },
  { kind: 'sedan', x: 117, z: 63,  heading: Math.PI },
  { kind: 'bike',  x: 150, z: -12, heading: Math.PI / 2 },
  { kind: 'bike',  x: 63,  z: 126, heading: 0 },
  { kind: 'sedan', x: -123, z: -63, heading: Math.PI / 2 },
  { kind: 'taxi',  x: -3,  z: 63,  heading: 0 },
  { kind: 'boat',  x: 196, z: 12,  heading: Math.PI / 2 },
];

export const HERO = {
  walkSpeed: 7,
  sprintSpeed: 11.5,
  turnSpeed: 9,
  health: 100,
  punchRange: 2.4,
  punchDamage: 34,
  punchCooldown: 0.45,
};

export const RIDES = {
  sedan: { top: 34, accel: 15, brake: 30, grip: 2.6, seats: 1 },
  taxi:  { top: 32, accel: 14, brake: 30, grip: 2.6, seats: 1 },
  truck: { top: 26, accel: 10, brake: 24, grip: 2.1, seats: 1 },
  bike:  { top: 43, accel: 21, brake: 34, grip: 3.4, seats: 1 },
  boat:  { top: 25, accel: 11, brake: 18, grip: 1.6, seats: 1 },
  cop:   { top: 38, accel: 18, brake: 32, grip: 3.0, seats: 1 },
};

export const WANTED = {
  names: ['CLEAN', 'SUSPECT', 'PERSON OF INTEREST', 'FUGITIVE', 'MOST WANTED', 'CITYWIDE MANHUNT'],
  // heat points that push the level up; heat decays when the player lies low
  thresholds: [0, 15, 35, 60, 100, 160],
  copCars:   [0, 1, 2, 3, 4, 6],
  footCops:  [0, 1, 1, 2, 3, 4],
  decayPerSec: 2.2,
  decayDelay: 9,
};

export const PAYOUTS = {
  packageEach: 150,
  packageAll: 1000,
  stashEach: 250,
  stuntPerSec: 120,
};

export const PALETTE = {
  sky: 0x87b5d6,
  sun: 0xfff2cf,
  ground: 0x9a8f7a,
  sand: 0xd8c49a,
  asphalt: 0x33343a,
  sidewalk: 0x8d8578,
  water: 0x2a7f9e,
  building: [0xd9a066, 0xc97b5e, 0x7d9bb5, 0xb5a06a, 0x8f7fb5, 0x6a9a7d, 0xd97b7b, 0x9ab5b5],
  neon: [0xff2e88, 0x00e5ff, 0xffd23f, 0x7cff4f, 0xff6a00],
  carPaint: [0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3fae6a, 0xe8e8e8, 0x222226, 0xd96a1e, 0x7a4fd0],
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
