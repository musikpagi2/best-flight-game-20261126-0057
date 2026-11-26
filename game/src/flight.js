// The flight model: pure maths, no renderer in it. A light arcade model with
// real trade-offs — throttle and turn discipline, a stall, fuel that runs out,
// and landings that read as what happened. step() advances one fixed step and
// returns what happened as bit flags.
import { FLIGHT, PLANE, RUNWAY } from './config.js';
import { clamp, wrapRad } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_TOUCHDOWN = 1;
export const EVENT_CRASH = 2;
export const EVENT_LIFTOFF = 4;
export const EVENT_FUEL_EMPTY = 8;

const DEG = Math.PI / 180;

/** Forward unit vector from yaw (0 = north, -Z) and pitch (up positive). */
export function forwardOf(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

export function createFlight() {
  const state = {
    x: RUNWAY.x,
    y: RUNWAY.elevation + PLANE.groundClearance,
    z: RUNWAY.z + 150, // south end of the strip, the whole runway ahead
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    throttleTarget: 0,
    fuel: 100,
    damage: 0,
    onGround: true,
    crashed: false,
    landed: false,
    stalled: false,
    engineOut: false,
    flaps: false,
    time: 0,
    vy: 0,
  };
  return state;
}

export function resetFlight(state, fuel) {
  const fresh = createFlight();
  Object.assign(state, fresh);
  state.fuel = fuel;
}

/** Is (x, z) on the runway strip (a little margin at each end)? */
export function isRunway(x, z) {
  return (
    Math.abs(x - RUNWAY.x) < RUNWAY.width / 2 + 2 &&
    Math.abs(z - RUNWAY.z) < RUNWAY.length / 2 + 12
  );
}

export function speedKnots(state) {
  return state.speed * 1.944;
}

export function altFeet(state, groundY) {
  return Math.max(0, (state.y - groundY) * 3.281);
}

export function headingDeg(state) {
  let d = (state.yaw / DEG) % 360;
  if (d < 0) d += 360;
  return d;
}

/**
 * One fixed step.
 * input: { throttle: -1|0|1 (W/S), pitch: -1..1 (ArrowUp pulls up = +1),
 *          roll: -1..1 (ArrowRight banks right = +1), rudder: -1..1,
 *          brake: bool, flapsToggle: bool }
 * env: { heightAt(x, z) }
 */
export function stepFlight(state, input, dt, env) {
  if (state.crashed) return EVENT_NONE;
  let events = 0;
  state.time += dt;

  // --- Flaps (edge-triggered by the caller setting flapsToggle true once) ---
  if (input.flapsToggle) state.flaps = !state.flaps;

  // --- Throttle ---
  if (input.throttle !== 0) {
    state.throttleTarget = clamp(state.throttleTarget + input.throttle * FLIGHT.throttleRate * dt, 0, 1);
  }
  if (state.engineOut) state.throttleTarget = 0;
  state.throttle += clamp(state.throttleTarget - state.throttle, -dt * 0.8, dt * 0.8);

  // --- Fuel ---
  if (state.fuel > 0 && state.throttle > 0.02) {
    state.fuel = Math.max(0, state.fuel - (FLIGHT.fuelBurnIdle + state.throttle * (FLIGHT.fuelBurnFull - FLIGHT.fuelBurnIdle)) * dt);
    if (state.fuel === 0) {
      state.engineOut = true;
      events |= EVENT_FUEL_EMPTY;
    }
  }

  const stallSpeed = state.flaps ? FLIGHT.stallSpeedFlaps : FLIGHT.stallSpeed;
  const authority = clamp(state.speed / stallSpeed, 0.2, 1);
  state.stalled = !state.onGround && state.speed < stallSpeed;

  // --- Attitude ---
  const maxBank = FLIGHT.maxBankDeg * DEG;
  const targetRoll = input.roll * maxBank;
  const rollRate = FLIGHT.rollRateDeg * DEG * dt;
  state.roll += clamp(targetRoll - state.roll, -rollRate, rollRate);

  const maxPitch = FLIGHT.maxPitchDeg * DEG;
  let targetPitch = input.pitch * maxPitch * authority;
  if (state.onGround) targetPitch = clamp(targetPitch, -0.04, 0.16);
  const pitchRate = FLIGHT.pitchRateDeg * DEG * authority * dt;
  state.pitch += clamp(targetPitch - state.pitch, -pitchRate, pitchRate);
  if (state.stalled) {
    // The nose drops when the wing stops flying.
    state.pitch -= 0.4 * dt * (1 - state.speed / stallSpeed);
    state.pitch = Math.max(state.pitch, -0.35);
  }

  // --- Turn: banked turn, plus a touch of rudder ---
  if (!state.onGround) {
    const turnRate = (Math.sin(state.roll) * FLIGHT.gravity) / Math.max(state.speed, 15) * FLIGHT.turnAuthority;
    state.yaw = wrapRad(state.yaw + turnRate * dt + input.rudder * 0.22 * authority * dt);
  } else if (state.speed > 0.5) {
    // Taxi steering.
    state.yaw = wrapRad(state.yaw + input.roll * 0.55 * clamp(state.speed / 12, 0, 1) * dt);
  }

  // --- Speed: thrust, drag, and gravity along the flight path ---
  const fwd = forwardOf(state.yaw, state.pitch);
  let accel = state.throttle * FLIGHT.maxThrustAccel - FLIGHT.dragK * state.speed * state.speed;
  if (!state.onGround) accel -= FLIGHT.gravity * Math.sin(state.pitch);
  if (state.onGround) {
    accel -= state.speed * 0.35; // rolling resistance
    if (input.brake) accel -= 14;
    if (state.speed < 0.2 && accel < 0) accel = 0;
  }
  state.speed = Math.max(0, Math.min(FLIGHT.maxSpeed, state.speed + accel * dt));

  // --- Position ---
  const prevY = state.y;
  state.x += fwd.x * state.speed * dt;
  state.y += fwd.y * state.speed * dt;
  state.z += fwd.z * state.speed * dt;
  if (state.stalled) state.y -= FLIGHT.sinkStall * (1 - state.speed / stallSpeed) * dt;
  state.vy = (state.y - prevY) / dt;

  // --- Liftoff ---
  if (state.onGround && state.speed > stallSpeed + 4 && state.pitch > 0.06) {
    state.onGround = false;
    events |= EVENT_LIFTOFF;
  }

  // --- Ground contact ---
  const groundY = env.heightAt(state.x, state.z);
  const clearance = PLANE.groundClearance;
  if (state.y <= groundY + clearance) {
    state.y = groundY + clearance;
    if (state.onGround) {
      // Taxiing: stay glued.
      state.vy = 0;
      state.pitch = 0;
    } else {
      // Touchdown or impact.
      const vy = state.vy;
      const onStrip = isRunway(state.x, state.z);
      if (onStrip && vy >= -FLIGHT.landMaxVy && state.speed <= FLIGHT.landMaxSpeed && Math.abs(state.pitch) < 0.3) {
        state.onGround = true;
        state.landed = true;
        state.vy = 0;
        state.pitch = 0;
        state.roll = 0;
        events |= EVENT_TOUCHDOWN;
      } else if (vy < -FLIGHT.crashVy || state.speed > FLIGHT.crashSpeed) {
        state.crashed = true;
        events |= EVENT_CRASH;
      } else {
        // A hard landing off the strip: damage, a bounce, keep flying if fast.
        state.damage = Math.min(100, state.damage + 18 + Math.abs(vy) * 2);
        state.speed *= 0.72;
        state.pitch = 0.12;
        if (state.damage >= 100) {
          state.crashed = true;
          events |= EVENT_CRASH;
        }
      }
    }
  }

  // --- World bounds: the rim is high, but a pilot who leaves the valley turns back ---
  const r = Math.hypot(state.x, state.z);
  if (r > 1350) {
    // Gentle push back: the valley is the world.
    state.x *= 1350 / r;
    state.z *= 1350 / r;
  }
  return events;
}
