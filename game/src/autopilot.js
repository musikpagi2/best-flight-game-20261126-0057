// The autopilot: steers the Kestrel toward a target the way a careful pilot
// would — bank into the turn, hold the climb, keep the speed — with a
// terrain look-ahead. 'reckless' skips the look-ahead and flies fast, which is
// how the crash scene is staged. Also the title screen's attract mode.
import { forwardOf } from './flight.js';
import { clamp, wrapRad } from './random.js';

/**
 * One step's input for the flight model.
 * target: {x, y, z} to fly toward, or null for a gentle holding circuit.
 * env: { heightAt(x, z) } for terrain avoidance.
 * skill: 'good' (avoids terrain) or 'reckless' (does not).
 */
export function autopilotInput(flight, target, env, skill = 'good') {
  const input = { throttle: 0, pitch: 0, roll: 0, rudder: 0, brake: false, flapsToggle: false };
  // Slow down to turn: a tight turn at cruise speed orbits the target.
  let headingError = 0;
  if (target) {
    const dx = target.x - flight.x;
    const dz = target.z - flight.z;
    headingError = wrapRad(Math.atan2(dx, -dz) - flight.yaw);
  }
  const baseSpeed = skill === 'reckless' ? 72 : 52;
  const targetSpeed = Math.abs(headingError) > 0.6 ? Math.min(baseSpeed, 36) : baseSpeed;
  if (flight.speed < targetSpeed - 4) input.throttle = 1;
  else if (flight.speed > targetSpeed + 4) input.throttle = -1;

  if (target) {
    const dy = target.y - flight.y;
    input.roll = clamp(headingError * 1.8, -1, 1);
    const desiredPitch = clamp(dy * 0.014, -0.28, 0.32);
    input.pitch = clamp((desiredPitch - flight.pitch) * 3, -1, 1);
  } else {
    // Holding circuit: a slow right turn, holding about 120 m.
    input.roll = 0.35;
    input.pitch = clamp((120 - flight.y) * 0.01 - flight.pitch * 2, -1, 1);
  }

  if (skill === 'good') {
    const fwd = forwardOf(flight.yaw, flight.pitch);
    for (const ahead of [60, 120, 200]) {
      const tx = flight.x + fwd.x * ahead;
      const tz = flight.z + fwd.z * ahead;
      if (env.heightAt(tx, tz) + 32 > flight.y) {
        input.pitch = 1;
        input.throttle = 1;
        input.roll = clamp(-flight.roll, -1, 1);
        break;
      }
    }
  }
  return input;
}
