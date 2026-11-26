// The screenshot scenes behind ?shot=start|play|cockpit|end. Each one plays the
// real rules forward from a fresh flight for a fixed time, steered by the
// autopilot, so the frame is what a short game really looks like and the same
// seed always gives the same frame.
import { STEP, MISSIONS } from './config.js';
import { createFlight, resetFlight, stepFlight, EVENT_CRASH } from './flight.js';
import { createMission, finishMission } from './missions.js';
import { checkRing, nextRing } from './rings.js';
import { autopilotInput } from './autopilot.js';

const START_SECONDS = 8;
const PLAY_SECONDS = 26;
const COCKPIT_SECONDS = 20;
const END_LIMIT_SECONDS = 240;

/**
 * Set the world to the named scene and return the screen to draw over it, the
 * camera mode and the best score to show. world: { flight, mission, env }.
 * The world's flight and mission are reset and flown forward in place.
 */
export function stageShot(name, world) {
  const { flight, env } = world;
  const mission = createMission(MISSIONS[0]);
  world.mission = mission;
  resetFlight(flight, mission.def.startFuel);

  if (name !== 'play' && name !== 'cockpit' && name !== 'end') {
    // Title: the autopilot takes off and tours the valley behind the panel.
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      const target = nextRing(mission.rings);
      const input = autopilotInput(flight, target, env, 'good');
      stepFlight(flight, input, STEP, env);
      if (checkRing(mission.rings, flight.x, flight.y, flight.z)) mission.score += mission.def.ringValue;
      mission.elapsed += STEP;
      if (flight.crashed) break;
    }
    return { screen: 'title', cameraMode: 'chase', best: 0 };
  }

  if (name === 'end') {
    // A hurried pilot: fast, no terrain look-ahead, into the hills.
    let diving = false;
    for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
      const target = nextRing(mission.rings);
      const input = autopilotInput(flight, target, env, 'reckless');
      if (diving) {
        input.pitch = -1;
        input.throttle = 1;
        input.roll = 0;
      }
      const events = stepFlight(flight, input, STEP, env);
      if (checkRing(mission.rings, flight.x, flight.y, flight.z)) mission.score += mission.def.ringValue;
      mission.elapsed += STEP;
      if (events & EVENT_CRASH) break;
      if (!diving && i > 180 / STEP) diving = true;
    }
    if (!flight.crashed) {
      // Make sure the scene ends crashed: dive until the ground takes it.
      for (let i = 0; i < 120 / STEP; i += 1) {
        const events = stepFlight(flight, { throttle: 1, pitch: -1, roll: 0, rudder: 0, brake: false, flapsToggle: false }, STEP, env);
        mission.elapsed += STEP;
        if (events & EVENT_CRASH) break;
      }
    }
    finishMission(mission, flight, true);
    return { screen: 'over', cameraMode: 'chase', best: mission.score };
  }

  // Play / cockpit: the autopilot flies the ring course properly.
  const seconds = name === 'cockpit' ? COCKPIT_SECONDS : PLAY_SECONDS;
  for (let i = 0; i < seconds / STEP; i += 1) {
    const target = nextRing(mission.rings);
    const input = autopilotInput(flight, target, env, 'good');
    stepFlight(flight, input, STEP, env);
    if (checkRing(mission.rings, flight.x, flight.y, flight.z)) mission.score += mission.def.ringValue;
    mission.elapsed += STEP;
    if (flight.crashed) break;
  }
  if (name === 'cockpit') {
    // Level the wings for the frame: the panel and cowl read cleanly when
    // the aircraft is straight and level.
    flight.roll = 0;
    flight.pitch = 0.02;
  }
  return {
    screen: 'play',
    cameraMode: name === 'cockpit' ? 'cockpit' : 'chase',
    best: mission.score,
  };
}

export { createFlight };
