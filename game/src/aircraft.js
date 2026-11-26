// The Kestrel bush plane, built from primitives: a high-wing single-propeller
// aeroplane in orange and cream, with a spinning propeller, nav lights and a
// little dashboard for the cockpit view. The model faces -Z (heading 0 = north).
import { PALETTE, PLANE } from './config.js';

function lambert(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  return m;
}

function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), lambert(color));
  m.position.set(x, y, z);
  return m;
}

/** A small canvas texture with the registration mark, for the fuselage sides. */
function registrationTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = '#2c2f36';
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('N123K', 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The dashboard: a canvas of round gauges, used as a texture in cockpit view. */
function dashboardTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 200;
  const g = cv.getContext('2d');
  g.fillStyle = '#141a20';
  g.fillRect(0, 0, 512, 200);
  g.strokeStyle = '#2c3846';
  g.lineWidth = 4;
  g.strokeRect(4, 4, 504, 192);
  const gauges = [
    { x: 84, label: 'AIRSPEED' },
    { x: 256, label: 'ATTITUDE' },
    { x: 428, label: 'ALTITUDE' },
  ];
  for (const gauge of gauges) {
    g.beginPath();
    g.arc(gauge.x, 92, 62, 0, Math.PI * 2);
    g.fillStyle = '#0c1116';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#7df9ff';
    g.stroke();
    g.beginPath();
    g.arc(gauge.x, 92, 52, 0, Math.PI * 2);
    g.strokeStyle = '#33414f';
    g.lineWidth = 2;
    g.stroke();
    for (let i = 0; i <= 10; i += 1) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      g.beginPath();
      g.moveTo(gauge.x + Math.cos(a) * 44, 92 + Math.sin(a) * 44);
      g.lineTo(gauge.x + Math.cos(a) * 52, 92 + Math.sin(a) * 52);
      g.strokeStyle = '#9fb0c0';
      g.lineWidth = 2;
      g.stroke();
    }
    // Needle at cruise.
    const na = Math.PI * 0.75 + 0.62 * Math.PI * 1.5;
    g.beginPath();
    g.moveTo(gauge.x, 92);
    g.lineTo(gauge.x + Math.cos(na) * 40, 92 + Math.sin(na) * 40);
    g.strokeStyle = '#ffb02e';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#eef1f5';
    g.font = 'bold 15px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(gauge.label, gauge.x, 178);
  }
  // Centre attitude ball.
  g.beginPath();
  g.arc(256, 92, 34, 0, Math.PI * 2);
  g.fillStyle = '#2f6fb4';
  g.fill();
  g.beginPath();
  g.arc(256, 92, 34, Math.PI, 0);
  g.fillStyle = '#8a6f4d';
  g.fill();
  g.beginPath();
  g.moveTo(256 - 34, 92);
  g.lineTo(256 + 34, 92);
  g.strokeStyle = '#eef1f5';
  g.lineWidth = 2;
  g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildAircraft() {
  const group = new THREE.Group();
  group.name = 'kestrel';
  const airframe = new THREE.Group();
  airframe.name = 'airframe';
  const cockpit = new THREE.Group();
  cockpit.name = 'cockpit';

  const orange = PALETTE.planeBody;
  const cream = PALETTE.planeCream;
  const dark = PALETTE.planeDark;

  // --- Fuselage: a tapered tube along Z, nose at -Z ---
  const fus = cyl(0.85, 0.55, 6.4, orange, 0, 0, 0.4, 12);
  fus.rotation.x = Math.PI / 2;
  airframe.add(fus);
  const nose = cyl(0.85, 0.28, 1.6, dark, 0, 0, -3.4, 12);
  nose.rotation.x = Math.PI / 2;
  airframe.add(nose);
  const tailCone = cyl(0.55, 0.12, 2.2, orange, 0, 0.15, 4.4, 10);
  tailCone.rotation.x = Math.PI / 2;
  airframe.add(tailCone);

  // --- High wing (slight dihedral) + struts ---
  const wing = box(PLANE.wingspan, 0.22, 1.9, cream, 0, 0.95, -0.4);
  airframe.add(wing);
  const wingTipL = box(0.5, 0.24, 1.9, orange, -PLANE.wingspan / 2 + 0.25, 0.95, -0.4);
  const wingTipR = box(0.5, 0.24, 1.9, orange, PLANE.wingspan / 2 - 0.25, 0.95, -0.4);
  airframe.add(wingTipL, wingTipR);
  for (const s of [-1, 1]) {
    const strut = box(0.09, 1.5, 0.09, dark, s * 1.7, 0.25, -0.4);
    strut.rotation.z = s * 0.5;
    airframe.add(strut);
  }

  // --- Tail: horizontal stabiliser + vertical fin ---
  const stab = box(3.6, 0.16, 1.1, cream, 0, 0.35, 5.2);
  airframe.add(stab);
  const fin = box(0.16, 1.7, 1.4, orange, 0, 1.0, 5.2);
  airframe.add(fin);

  // --- Canopy: a half-buried bubble over the cockpit ---
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.canopy, transparent: true, opacity: 0.85 }),
  );
  canopy.scale.set(1, 0.85, 1.7);
  canopy.position.set(0, 0.55, -1.1);
  airframe.add(canopy);

  // --- Registration decals on the fuselage sides ---
  const regTex = registrationTexture();
  for (const s of [-1, 1]) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.65),
      new THREE.MeshBasicMaterial({ map: regTex, transparent: true }),
    );
    decal.position.set(s * 0.88, 0.1, 1.6);
    decal.rotation.y = s * Math.PI / 2;
    airframe.add(decal);
  }

  // --- Propeller: hub + two blades, spins around Z ---
  const prop = new THREE.Group();
  prop.position.set(0, 0, -4.35);
  const hub = cyl(0.22, 0.22, 0.5, dark, 0, 0, 0, 8);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  for (const a of [0, Math.PI]) {
    const blade = box(0.34, 2.3, 0.08, dark, 0, 0, 0);
    blade.rotation.z = a;
    blade.position.y = 0;
    prop.add(blade);
  }
  // Offset each blade so it reads as two blades, not a bar.
  prop.children[1].position.y = 1.05;
  prop.children[2].position.y = -1.05;
  airframe.add(prop);

  // --- Landing gear: two mains + tail wheel ---
  for (const s of [-1, 1]) {
    const leg = cyl(0.09, 0.09, 1.1, dark, s * 0.9, -0.95, -0.6, 6);
    airframe.add(leg);
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.14, 8, 14),
      lambert(dark),
    );
    wheel.position.set(s * 0.95, -1.5, -0.6);
    wheel.rotation.y = Math.PI / 2;
    airframe.add(wheel);
  }
  const tailWheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.08, 8, 12),
    lambert(dark),
  );
  tailWheel.position.set(0, -0.75, 4.9);
  tailWheel.rotation.y = Math.PI / 2;
  airframe.add(tailWheel);

  // --- Nav lights: red left, green right, white tail ---
  const nav = {};
  const lightDefs = [
    ['left', 0xff2a1e, -PLANE.wingspan / 2, 0.95, -0.4],
    ['right', 0x2aff5a, PLANE.wingspan / 2, 0.95, -0.4],
    ['tail', 0xffffff, 0, 0.4, 5.6],
  ];
  for (const [name, color, x, y, z] of lightDefs) {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
    bulb.position.set(x, y, z);
    airframe.add(bulb);
    nav[name] = bulb;
  }

  // --- Cockpit group: nose cowl + dashboard + frame (shown in cockpit view) ---
  const cowl = cyl(0.8, 0.6, 1.4, orange, 0, -0.1, -3.6, 12);
  cowl.rotation.x = Math.PI / 2;
  cockpit.add(cowl);
  // Dashboard: raised into the windshield area, clear of the cowl, so it
  // reads in the lower centre of the cockpit view instead of below the frame.
  const dash = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.78),
    new THREE.MeshBasicMaterial({ map: dashboardTexture() }),
  );
  dash.position.set(0, 0.28, -3.0);
  dash.rotation.x = -0.4;
  cockpit.add(dash);

  group.add(airframe);
  group.add(cockpit);
  cockpit.visible = false;
  return { group, airframe, cockpit, prop, nav };
}

/**
 * Pose the aircraft from flight state. The model faces -Z; rotation order YXZ
 * gives yaw, then pitch, then roll about the forward axis.
 * state: { x, y, z, yaw, pitch, roll } with yaw/pitch/roll in radians.
 */
export function poseAircraft(aircraft, state, dt, rpm) {
  const { group, prop } = aircraft;
  group.position.set(state.x, state.y, state.z);
  group.rotation.order = 'YXZ';
  group.rotation.y = -state.yaw;
  group.rotation.x = state.pitch;
  group.rotation.z = -state.roll;
  prop.rotation.z += rpm * dt;
}

/** Show the cockpit set (dashboard + cowl) or the full airframe. */
export function setCockpitView(aircraft, on) {
  aircraft.airframe.visible = !on;
  aircraft.cockpit.visible = on;
}
