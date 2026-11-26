// The three sorties: where the rings go, what counts as finished, and what a
// flight scores. Course generation is pure (seeded), so a mission is the same
// every time it is flown.
import { MISSIONS, RUNWAY, FLIGHT } from './config.js';
import { createRandom } from './random.js';
import { heightAt, riverX } from './terrain.js';
import { createRings } from './rings.js';

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || MISSIONS[0];
}

/** A ring centre that clears the ground and the trees below it. */
function ringAt(x, z, lift, random) {
  const jitter = random ? (random() - 0.5) * 30 : 0;
  const y = Math.max(heightAt(x, z) + lift, 55);
  return { x: x + jitter, y, z: z + (random ? (random() - 0.5) * 30 : 0) };
}

function tourCourse(def) {
  const random = createRandom(def.seed);
  // A loop out over the valley: north, east ridge, far north, west, home.
  const stops = [
    [120, 420], [-320, 120], [-520, -420], [-180, -760],
    [260, -700], [560, -300], [420, 240], [60, 620],
  ];
  const positions = [];
  for (let i = 0; i < def.rings; i += 1) {
    const [x, z] = stops[i % stops.length];
    positions.push(ringAt(x, z, 55 + random() * 35, random));
  }
  return positions;
}

function canyonCourse(def) {
  const random = createRandom(def.seed);
  // Down the river, low between the walls, from north to south.
  const positions = [];
  for (let i = 0; i < def.rings; i += 1) {
    const z = -950 + (i / (def.rings - 1)) * 1750;
    const x = riverX(z) + (random() - 0.5) * 70;
    positions.push(ringAt(x, z, 26 + random() * 18, random));
  }
  return positions;
}

function circuitCourse(def) {
  const random = createRandom(def.seed);
  // A circuit out and back, ending north of the strip so the final approach
  // runs south, down the valley, onto the runway.
  const stops = [
    [80, 200], [420, -100], [150, -500], [-120, -100],
  ];
  const positions = [];
  for (let i = 0; i < def.rings; i += 1) {
    const [x, z] = stops[i % stops.length];
    positions.push(ringAt(x, z, 48 + random() * 30, random));
  }
  return positions;
}

export function courseFor(def) {
  if (def.id === 'canyon-pass') return canyonCourse(def);
  if (def.id === 'touchdown') return circuitCourse(def);
  return tourCourse(def);
}

export function createMission(def) {
  return {
    def,
    rings: createRings(courseFor(def)),
    status: 'flying', // flying | done | crashed
    elapsed: 0,
    score: 0,
    landingQuality: 0,
    finishedAt: 0,
  };
}

/** Landing quality 0..1: gentle, centred, at the right speed. */
export function landingQuality(flight) {
  const vyScore = Math.max(0, 1 - Math.abs(flight.vy) / FLIGHT.landMaxVy);
  const centre = 1 - Math.min(1, Math.abs(flight.x - RUNWAY.x) / (RUNWAY.width / 2));
  const speedScore = 1 - Math.min(1, Math.abs(flight.speed - 30) / 30);
  return Math.max(0, Math.min(1, vyScore * 0.5 + centre * 0.3 + speedScore * 0.2));
}

export function finishMission(mission, flight, crashed) {
  mission.status = crashed ? 'crashed' : 'done';
  mission.finishedAt = mission.elapsed;
  let score = mission.rings.passed * mission.def.ringValue;
  if (!crashed && mission.def.id === 'touchdown' && flight.landed) {
    mission.landingQuality = landingQuality(flight);
    score += Math.round(300 * mission.landingQuality);
  }
  if (!crashed) {
    const par = mission.def.parSeconds;
    const under = Math.max(0, (par - mission.elapsed) / par);
    score += Math.round(mission.def.timeBonus * under);
  }
  score -= Math.round(flight.damage * 2);
  mission.score = Math.max(0, score);
  return mission.score;
}

/** Best score / time per mission, kept in localStorage. */
export function readBest(missionId) {
  try {
    const raw = window.localStorage.getItem(`kestrel-canyon.best.${missionId}`);
    if (!raw) return { score: 0, time: 0 };
    return JSON.parse(raw);
  } catch {
    return { score: 0, time: 0 };
  }
}

export function saveBest(missionId, score, time) {
  try {
    const prev = readBest(missionId);
    const best = {
      score: Math.max(prev.score, score),
      time: prev.time === 0 ? time : Math.min(prev.time, time),
    };
    window.localStorage.setItem(`kestrel-canyon.best.${missionId}`, JSON.stringify(best));
    return best;
  } catch {
    return { score, time };
  }
}
