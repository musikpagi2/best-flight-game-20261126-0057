// Kestrel Canyon — every tuning number and colour in one place.
// The world is a 2400 x 2400 metre valley; the playfield is the sky above it.
// Units: metres, seconds, degrees where noted. Speeds in m/s (HUD shows knots/feet).
export const WORLD = {
  size: 2400,
  half: 1200,
  // Valley floor height and the height of the rim mountains.
  baseHeight: 26,
  hillAmp: 55,
  rimHeight: 260,
  rimStart: 780,
  rimEnd: 1180,
  // The river valley: a shallow channel carved along a diagonal curve.
  riverDepth: 14,
  waterLevel: 24,
};

export const RUNWAY = {
  // Airfield at the south end of the valley, flat and level.
  x: 0,
  z: 880,
  elevation: 26,
  length: 420,
  width: 34,
  heading: 0, // runway points north (heading 0)
};

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** Flight model tuning. */
export const FLIGHT = {
  maxThrottle: 1,
  throttleRate: 0.55, // throttle units per second (W/S keys)
  maxThrustAccel: 26, // m/s^2 at full throttle, level flight
  dragK: 0.0032, // drag = dragK * speed^2
  gravity: 9.81,
  stallSpeed: 26, // m/s, clean
  stallSpeedFlaps: 20, // m/s, flaps down
  maxSpeed: 96,
  maxBankDeg: 68,
  rollRateDeg: 95, // deg/s toward target bank
  maxPitchDeg: 32,
  pitchRateDeg: 55,
  turnAuthority: 1.4, // arcade multiplier on the coordinated-turn rate
  sinkStall: 9, // m/s extra sink when stalled
  fuelCapacity: 100,
  fuelBurnFull: 0.62, // units/s at full throttle
  fuelBurnIdle: 0.05,
  // Landing: what counts as a survivable touchdown on the runway.
  landMaxVy: 4.5, // m/s downward
  landMaxSpeed: 48,
  crashVy: 12, // m/s downward on terrain impact = crash
  crashSpeed: 42, // m/s into terrain = crash
  treeDamage: 25,
};

export const PLANE = {
  // The Kestrel bush plane, built from primitives in aircraft.js.
  length: 9.2,
  wingspan: 11.4,
  height: 2.6,
  // Collision bubble around the plane centre.
  radius: 2.2,
  groundClearance: 1.6,
};

export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    short: 'Fly 8 rings over the valley',
    rings: 8,
    ringValue: 100,
    parSeconds: 150,
    timeBonus: 200,
    startFuel: 100,
    seed: 11,
    blurb: 'A gentle valley tour: eight rings, one at a time, learn the sky.',
  },
  {
    id: 'canyon-pass',
    name: 'Canyon Pass',
    short: '10 low rings through the canyon',
    rings: 10,
    ringValue: 150,
    parSeconds: 170,
    timeBonus: 300,
    startFuel: 85,
    seed: 47,
    blurb: 'Low and fast between the walls. Fuel is tight; the walls are not forgiving.',
  },
  {
    id: 'touchdown',
    name: 'Touchdown',
    short: '4 rings, then land on the runway',
    rings: 4,
    ringValue: 100,
    parSeconds: 210,
    timeBonus: 250,
    startFuel: 100,
    seed: 83,
    blurb: 'Fly the circuit, then bring her home: a gentle landing on the strip scores.',
  },
];

export const RING = {
  radius: 14,
  tube: 1.3,
  passDistance: 3.5, // metres from the ring plane that still counts as through
};

export const PALETTE = {
  skyTop: '#2f6fb4',
  skyHorizon: '#cfe4f2',
  sun: '#fff3c4',
  grass: '#5d8a48',
  grassDry: '#8a9a4b',
  rock: '#7d7468',
  snow: '#eef2f5',
  sand: '#c9b489',
  water: '#3f7fb8',
  runway: '#3a3f46',
  runwayLine: '#e8e8e8',
  treeTrunk: '#6b4a2f',
  treeLeaf: '#3e6b34',
  cloud: '#ffffff',
  planeBody: '#e8641f', // Kestrel orange
  planeCream: '#f4ead8',
  planeDark: '#2c2f36',
  canopy: '#9fd8ef',
  ring: '#ffb02e',
  ringNext: '#ffdf6b',
  hud: '#7df9ff',
  hudAmber: '#ffb02e',
  hudRed: '#ff5a4e',
  hudGreen: '#7dff8a',
  panel: 'rgba(10, 16, 24, 0.72)',
  text: '#eef1f5',
  muted: '#9fb0c0',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score per mission is kept between visits (this browser only). */
export const BEST_KEY = 'kestrel-canyon.best.';
