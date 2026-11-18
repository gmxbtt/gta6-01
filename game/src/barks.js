// barks.js — short flavor lines shouted across Solmar Bay: scared
// pedestrians, SBPD radio chatter, job intros and stunt celebrations.
// The COP / JOB / STUNT lines were drafted with a model call at build time
// and adapted here; the PED lines mix that draft with the author's own.

const PED_LINES = [
  "Watch out, he's out of control!",
  'Somebody get off the sidewalk, run!',
  'Rico Vega has lost his mind!',
  'He almost clipped me!',
  'Call the SBPD, somebody!',
  'Not my car, not today!',
  'Everybody out of the street!',
  'That guy drives like the bay is his!',
];

const COP_LINES = [
  "SBPD's closing fast — cut through Solmar!",
  "Eyes up! SBPD's boxing you in!",
  "Don't let them pin you, Rico!",
  "Solmar Bay's yours — lose those cruisers!",
  "That's SBPD behind us! Floor it!",
  'Sharp turn, Rico! Shake the tail!',
];

const JOB_INTROS = {
  m1: 'Strip stolen cars at the chop shop.',
  m2: 'Rob the bank, then outrun the sirens.',
  m3: 'Deliver pier packages, 90s style.',
  m4: 'Survive a 45-second SBPD manhunt.',
  m5: 'Run the boat through the buoy ring.',
};

const STUNT_LINES = [
  'Rico Vega just flew over Solmar!',
  'That jump had the whole bay cheering!',
  "Clean landing! SBPD can't top that!",
  'Send it, Rico — make the skyline roar!',
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export class Barks {
  ped() { return pick(PED_LINES); }
  cop() { return pick(COP_LINES); }
  job(id) { return JOB_INTROS[id] || 'A new job is on.'; }
  stunt() { return pick(STUNT_LINES); }
}
