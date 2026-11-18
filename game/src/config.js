// config.js — SOLMAR HEAT: every tunable number and the city layout in one place.
// The city is a grid of streets; buildings fill the blocks between them.
export const CITY = {
  pitch: 54, // distance between street centrelines
  streets: 6, // streets each way (x and z)
  roadHalf: 7, // half the road width (asphalt)
  blockHalf: 19, // half the buildable block width
  bound: 175, // playable world half-extent (ocean fence beyond)
};

// Street centreline coordinates, symmetric around 0.
export const STREET_COORDS = (() => {
  const coords = [];
  for (let i = 0; i < CITY.streets; i++) coords.push((i - (CITY.streets - 1) / 2) * CITY.pitch);
  return coords;
})();

export function isStreetCoord(v) {
  return STREET_COORDS.some((c) => Math.abs(v - c) < CITY.roadHalf + 0.5);
}

// Is (x, z) on a road (asphalt) rather than inside a block?
export function isOnRoad(x, z) {
  return isStreetCoord(x) || isStreetCoord(z);
}

export function nearestStreetCoord(v) {
  let best = STREET_COORDS[0];
  for (const c of STREET_COORDS) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}

export const GAME = {
  title: 'SOLMAR HEAT',
  cityName: 'Solmar Bay',
  playerName: 'Rico Vega',
  saveKey: 'solmar-heat-save-v1',
  startCash: 150,
  bustedFine: 200,
  wastedFine: 100,
  maxWanted: 5,
  // Wanted decays after this long with no crime and no cop nearby.
  heatDecayDelay: 18,
  heatDecayStep: 9,
  playerHealth: 100,
  carHealth: 100,
};

export const CAR_TYPES = {
  sedan: { name: 'Solmar Sedan', topSpeed: 26, accel: 16, grip: 3.2, color: 0x4a6fa5, price: 0 },
  taxi: { name: 'Bay Cab', topSpeed: 24, accel: 15, grip: 3.2, color: 0xf2b705, price: 0 },
  coupe: { name: 'Vela Coupe', topSpeed: 32, accel: 20, grip: 3.8, color: 0xc0392b, price: 0 },
  van: { name: 'Cargo Van', topSpeed: 20, accel: 11, grip: 2.6, color: 0x7f8c8d, price: 0 },
  truck: { name: 'Haul Truck', topSpeed: 19, accel: 10, grip: 2.4, color: 0x2e7d32, price: 0 },
  police: { name: 'SBPD Interceptor', topSpeed: 30, accel: 19, grip: 3.6, color: 0x1a1a2e, price: 0 },
};

export const MISSION_DEFS = [
  {
    id: 'm1',
    title: 'Hot Wheels',
    giver: 'Lena',
    brief: 'Lena needs wheels, fast. Steal any car on the street and bring it to the chop shop in the north-east garage.',
    payout: 300,
    steps: [
      { kind: 'steal', text: 'Steal a car (walk up to one and press E)', target: null },
      { kind: 'goto', text: 'Drive to the chop shop', target: { x: 135, z: -135 }, radius: 7 },
    ],
  },
  {
    id: 'm2',
    title: 'Getaway',
    giver: 'Lena',
    brief: 'Lena is stuck at the Marlin Diner with the SBPD on her tail. Pick her up and lose the heat at the hideout by the marina.',
    payout: 650,
    steps: [
      { kind: 'goto', text: 'Pick up Lena at the Marlin Diner', target: { x: -81, z: 27 }, radius: 7 },
      { kind: 'goto', text: 'Escape to the marina hideout — stay ahead of the police!', target: { x: -135, z: 135 }, radius: 8, heat: 2 },
    ],
  },
  {
    id: 'm3',
    title: 'Parcel Run',
    giver: 'Mr. Okafor',
    brief: 'Three parcels, three drop-offs, one clock. Mr. Okafor pays for speed — finish inside 150 seconds.',
    payout: 850,
    timeLimit: 150,
    steps: [
      { kind: 'goto', text: 'Drop-off 1: the plaza kiosk', target: { x: 27, z: -27 }, radius: 6 },
      { kind: 'goto', text: 'Drop-off 2: the east arcade', target: { x: 135, z: 81 }, radius: 6 },
      { kind: 'goto', text: 'Drop-off 3: the south pier', target: { x: -27, z: 135 }, radius: 6 },
    ],
  },
  {
    id: 'm4',
    title: 'The Solmar Job',
    giver: 'Lena',
    brief: 'The big one. Hit the Solmar Trust vault, grab the bag, and vanish into the marina before the whole SBPD shows up.',
    payout: 1500,
    steps: [
      { kind: 'goto', text: 'Reach the Solmar Trust bank', target: { x: 81, z: -81 }, radius: 7 },
      { kind: 'grab', text: 'Grab the cash (press E at the vault)', target: { x: 81, z: -81 }, radius: 5 },
      { kind: 'goto', text: 'Escape to the marina hideout with the bag!', target: { x: -135, z: 135 }, radius: 8, heat: 3 },
    ],
  },
];

export const PICKUP_SPOTS = [
  { x: -27, z: -81 }, { x: 81, z: 27 }, { x: -81, z: -27 }, { x: 135, z: -27 },
  { x: -135, z: 81 }, { x: 27, z: 135 }, { x: -27, z: 81 }, { x: 81, z: -135 },
  { x: -135, z: -81 }, { x: 135, z: 135 },
];
