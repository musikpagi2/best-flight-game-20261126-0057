// The camera: a chase view that trails the Kestrel and leans into its banks,
// and a cockpit view from the pilot's seat. Both smooth, neither fights.
import { forwardOf } from './flight.js';

export const CAM_CHASE = 'chase';
export const CAM_COCKPIT = 'cockpit';

export function createCameraRig(camera) {
  return {
    camera,
    mode: CAM_CHASE,
    // Smoothed chase position, so the view glides instead of snapping.
    cx: 0,
    cy: 0,
    cz: 0,
    ready: false,
    // Fixed offset from the aircraft, used for the staged crash shot.
    cinematic: null,
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function updateCamera(rig, flight, dt) {
  const { camera } = rig;
  const fwd = forwardOf(flight.yaw, flight.pitch);
  const right = { x: Math.cos(flight.yaw), y: 0, z: Math.sin(flight.yaw) };

  if (rig.cinematic) {
    // A fixed three-quarter view of the wreck, with the valley behind it;
    // aim above the plane so the wreck sits below the end panel.
    camera.position.set(flight.x + rig.cinematic.x, flight.y + rig.cinematic.y, flight.z + rig.cinematic.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(flight.x, flight.y + 3, flight.z);
    camera.fov = 55;
    camera.updateProjectionMatrix();
    rig.ready = true;
    return;
  }

  if (rig.mode === CAM_COCKPIT) {
    // Pilot's seat: above the cowl, looking down the nose so the panel and
    // the valley ahead are both in frame.
    const px = flight.x + fwd.x * 1.0;
    const py = flight.y + 1.3;
    const pz = flight.z + fwd.z * 1.0;
    camera.position.set(px, py, pz);
    camera.up.set(0, 1, 0);
    camera.lookAt(px + fwd.x * 60, py + fwd.y * 60 - 1.5, pz + fwd.z * 60);
    camera.fov = 68;
    camera.updateProjectionMatrix();
    rig.ready = true;
    return;
  }

  // Chase: behind and above, with a lag that reads as speed.
  const tx = flight.x - fwd.x * 17;
  const ty = flight.y - fwd.y * 17 + 4.0;
  const tz = flight.z - fwd.z * 17;
  if (!rig.ready) {
    rig.cx = tx; rig.cy = ty; rig.cz = tz;
    rig.ready = true;
  }
  const k = 1 - Math.exp(-dt * 5.5);
  rig.cx = lerp(rig.cx, tx, k);
  rig.cy = lerp(rig.cy, ty, k);
  rig.cz = lerp(rig.cz, tz, k);
  camera.position.set(rig.cx, rig.cy, rig.cz);
  // Lean the horizon a little into the bank, never all the way.
  const lean = flight.roll * 0.45;
  const up = {
    x: right.x * Math.sin(lean),
    y: Math.cos(lean),
    z: right.z * Math.sin(lean),
  };
  camera.up.set(up.x, up.y, up.z);
  // Look slightly above the nose so the aircraft sits in the lower centre,
  // clear of the attitude ball.
  camera.lookAt(flight.x + fwd.x * 26, flight.y + fwd.y * 26 + 2.5, flight.z + fwd.z * 26);
  // The view widens a touch at speed.
  camera.fov = 60 + Math.min(12, flight.speed * 0.12);
  camera.updateProjectionMatrix();
}
