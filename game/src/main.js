// Kestrel Canyon — boot and the one loop. The world advances in fixed 1/60 s
// steps, the renderer paints what is there, and the HUD canvas draws the
// instruments and the panels. Screens: title, play, paused, done, over.
//
// ?seed=N fixes the valley and the ring courses. ?shot=start|play|cockpit|end
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { FIELD, MISSIONS, STEP, BEST_KEY } from './config.js';
import { createRandom } from './random.js';
import { buildTerrain, heightAt, stepClouds } from './terrain.js';
import { buildAircraft, poseAircraft, setCockpitView } from './aircraft.js';
import {
  createFlight, resetFlight, stepFlight, forwardOf,
  EVENT_TOUCHDOWN, EVENT_CRASH, EVENT_LIFTOFF, EVENT_FUEL_EMPTY,
} from './flight.js';
import { missionById, createMission, finishMission, readBest, saveBest } from './missions.js';
import { checkRing, nextRing, buildRings, updateRingMeshes } from './rings.js';
import { drawHud } from './hud.js';
import { createAudio } from './audio.js';
import {
  createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_FLAPS,
  ACTION_CAMERA, ACTION_MUTE, ACTION_RESTART,
} from './input.js';
import { createCameraRig, updateCamera, CAM_CHASE, CAM_COCKPIT } from './camera.js';
import { autopilotInput } from './autopilot.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const random = createRandom(seed);

const viewCanvas = document.getElementById('view');
const hudCanvas = document.getElementById('hud');
const statusEl = document.getElementById('status');
const hudCtx = hudCanvas.getContext('2d');
hudCanvas.width = FIELD.width;
hudCanvas.height = FIELD.height;

function announce(message) {
  statusEl.textContent = message;
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: viewCanvas, antialias: true });
} catch (err) {
  announce('This game needs WebGL. Please open it in a desktop browser with WebGL enabled.');
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 9000);

const env = { heightAt };
const terrain = buildTerrain(scene, random);
const aircraft = buildAircraft();
scene.add(aircraft.group);
const flight = createFlight();

let mission = createMission(MISSIONS[0]);
let ringsBuilt = buildRings(mission.rings);
scene.add(ringsBuilt.group);

const rig = createCameraRig(camera);
const audio = createAudio();
const input = createInput(viewCanvas);

let screen = 'title';
let selectedMission = 0;
let best = readBest(mission.def.id);
let messages = [];
let cameraMode = CAM_CHASE;
let wasStalled = false;
let wasEngineOut = false;

function pushMessage(text, color) {
  messages.push({ text, color, at: performance.now() / 1000 });
  if (messages.length > 4) messages.shift();
}

function rebuildRings() {
  scene.remove(ringsBuilt.group);
  ringsBuilt = buildRings(mission.rings);
  scene.add(ringsBuilt.group);
}

function selectMission(index) {
  selectedMission = index;
  mission = createMission(MISSIONS[index]);
  best = readBest(mission.def.id);
  resetFlight(flight, mission.def.startFuel);
  rebuildRings();
  announce(`${mission.def.name}. ${mission.def.short}`);
}

function startMission() {
  mission = createMission(MISSIONS[selectedMission]);
  best = readBest(mission.def.id);
  resetFlight(flight, mission.def.startFuel);
  rebuildRings();
  messages = [];
  screen = 'play';
  audio.unlock();
  audio.click();
  announce(`Flying ${mission.def.name}. ${mission.def.short}`);
}

function endFlight(crashed) {
  const score = finishMission(mission, flight, crashed);
  const saved = saveBest(mission.def.id, score, mission.elapsed);
  best = saved;
  if (crashed) {
    screen = 'over';
    audio.crash();
    announce(`Crashed. Score ${score}. Best ${saved.score}.`);
  } else {
    screen = 'done';
    audio.ring();
    announce(`Mission complete. Score ${score}. Best ${saved.score}.`);
  }
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    audio.setMuted(!audio.isMuted());
    pushMessage(audio.isMuted() ? 'Sound off' : 'Sound on', '#eef1f5');
  }
  if (actions & ACTION_CAMERA) {
    cameraMode = cameraMode === CAM_CHASE ? CAM_COCKPIT : CAM_CHASE;
    rig.mode = cameraMode;
    setCockpitView(aircraft, cameraMode === CAM_COCKPIT);
    pushMessage(cameraMode === CAM_COCKPIT ? 'Cockpit view' : 'Chase view', '#eef1f5');
  }
  if (screen === 'title') {
    if (actions & ACTION_CONFIRM) startMission();
    return;
  }
  if (screen === 'play') {
    if (actions & ACTION_PAUSE) {
      screen = 'paused';
      announce('Paused.');
    } else if (actions & ACTION_FLAPS) {
      flight.flaps = !flight.flaps;
      pushMessage(flight.flaps ? 'Flaps down' : 'Flaps up', '#eef1f5');
    } else if (actions & ACTION_RESTART) {
      startMission();
    }
    return;
  }
  if (screen === 'paused') {
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
      screen = 'play';
      announce('Flying.');
    } else if (actions & ACTION_RESTART) {
      startMission();
    }
    return;
  }
  // done / over
  if (actions & (ACTION_CONFIRM | ACTION_RESTART)) startMission();
}

function stepPlay(dt) {
  const inputState = input.read();
  const events = stepFlight(flight, inputState, dt, env);
  mission.elapsed += dt;

  const ring = checkRing(mission.rings, flight.x, flight.y, flight.z);
  if (ring) {
    mission.score += mission.def.ringValue;
    pushMessage(`Ring +${mission.def.ringValue}`, '#7dff8a');
    audio.ring();
    updateRingMeshes(mission.rings, ringsBuilt.meshes, ringsBuilt.beam);
  }

  if (events & EVENT_LIFTOFF) pushMessage('Airborne', '#7df9ff');
  if (events & EVENT_FUEL_EMPTY) pushMessage('ENGINE OUT — glide to the runway', '#ff5a4e');
  if (events & EVENT_TOUCHDOWN) {
    audio.land();
    if (mission.def.id === 'touchdown' && mission.rings.passed === mission.rings.total) {
      endFlight(false);
      return;
    }
    // A pit stop on any other sortie: fuel and repairs, then back up.
    flight.fuel = 100;
    flight.damage = 0;
    mission.score += 25;
    pushMessage('Touchdown — refuelled and repaired +25', '#7dff8a');
  }
  if (events & EVENT_CRASH) {
    endFlight(true);
    return;
  }
  if (flight.stalled && !wasStalled) audio.stall();
  wasStalled = flight.stalled;
  if (flight.engineOut && !wasEngineOut) pushMessage('ENGINE OUT', '#ff5a4e');
  wasEngineOut = flight.engineOut;

  // Mission complete: every ring flown (touchdown still needs the landing).
  if (mission.rings.passed === mission.rings.total && mission.def.id !== 'touchdown') {
    endFlight(false);
  }
}

function stepTitle(dt) {
  // Attract mode: the autopilot tours the selected mission's course.
  const target = nextRing(mission.rings);
  const auto = autopilotInput(flight, target, env, 'good');
  stepFlight(flight, auto, dt, env);
  checkRing(mission.rings, flight.x, flight.y, flight.z);
  mission.elapsed += dt;
  if (flight.crashed || (flight.onGround && mission.elapsed > 10)) {
    // Start the tour again: it crashed, or it landed and the tour is over.
    resetFlight(flight, mission.def.startFuel);
    mission.rings.index = 0;
    mission.rings.passed = 0;
    for (const r of mission.rings.list) { r.passed = false; r.prevD = null; }
    updateRingMeshes(mission.rings, ringsBuilt.meshes, ringsBuilt.beam);
  }
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function drawFrame() {
  // Pose the aircraft and the camera, then paint the 3D view and the HUD.
  const rpm = 4 + flight.throttle * 26 + flight.speed * 0.12;
  poseAircraft(aircraft, flight, 1 / 60, flight.crashed ? 0 : rpm);
  updateCamera(rig, flight, 1 / 60);
  renderer.render(scene, camera);

  const now = performance.now() / 1000;
  const groundY = heightAt(flight.x, flight.z);
  drawHud(hudCtx, {
    flight, mission, messages, now, groundY,
    score: mission.score, best: best.score,
    showAttitude: screen === 'play' || screen === 'paused',
  });

  if (screen === 'title') drawTitle(hudCtx);
  else if (screen === 'paused') drawPanel(hudCtx, 'Paused', ['The valley will wait for you.'], 'Press P to resume');
  else if (screen === 'over') {
    drawPanel(hudCtx, 'Crashed', [
      `Score ${mission.score}   •   Best ${best.score}`,
      mission.rings.passed > 0 ? `${mission.rings.passed} of ${mission.rings.total} rings flown` : 'The Kestrel is in the trees.',
    ], 'Press Space to fly again');
  } else if (screen === 'done') {
    drawPanel(hudCtx, mission.def.id === 'touchdown' && mission.landingQuality > 0
      ? `Mission complete — landing ${Math.round(mission.landingQuality * 100)}%`
      : 'Mission complete', [
      `Score ${mission.score}   •   Best ${best.score}`,
      `Time ${Math.floor(mission.elapsed / 60)}:${String(Math.floor(mission.elapsed % 60)).padStart(2, '0')}   •   Par ${Math.floor(mission.def.parSeconds / 60)}:${String(mission.def.parSeconds % 60).padStart(2, '0')}`,
    ], 'Press Space to fly again');
  }
}

function drawPanel(ctx, title, lines, prompt) {
  const w = 620;
  const h = 150 + lines.length * 34;
  const x = (FIELD.width - w) / 2;
  const y = (FIELD.height - h) / 2;
  ctx.fillStyle = 'rgba(10, 16, 24, 0.78)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.font = 'bold 46px system-ui, sans-serif';
  ctx.fillStyle = '#eef1f5';
  ctx.textAlign = 'center';
  ctx.fillText(title, FIELD.width / 2, y + 74);
  ctx.font = '21px system-ui, sans-serif';
  ctx.fillStyle = '#9fb0c0';
  lines.forEach((line, i) => ctx.fillText(line, FIELD.width / 2, y + 118 + i * 34));
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = '#ffb02e';
  ctx.fillText(prompt, FIELD.width / 2, y + h - 36);
}

function drawTitle(ctx) {
  const w = 680;
  const h = 430;
  const x = (FIELD.width - w) / 2;
  const y = (FIELD.height - h) / 2 - 20;
  ctx.fillStyle = 'rgba(10, 16, 24, 0.78)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillStyle = '#eef1f5';
  ctx.fillText('KESTREL CANYON', FIELD.width / 2, y + 82);
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillStyle = '#7df9ff';
  ctx.fillText('A bush-plane flight game — throttle, bank, and bring her home.', FIELD.width / 2, y + 116);
  MISSIONS.forEach((m, i) => {
    const my = y + 158 + i * 62;
    const selected = i === selectedMission;
    if (selected) {
      ctx.fillStyle = 'rgba(125, 249, 255, 0.14)';
      ctx.beginPath();
      ctx.roundRect(x + 24, my - 8, w - 48, 52, 8);
      ctx.fill();
    }
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = selected ? '#ffb02e' : '#eef1f5';
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}. ${m.name}`, x + 44, my + 24);
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillStyle = '#9fb0c0';
    ctx.textAlign = 'right';
    const b = readBest(m.id);
    ctx.fillText(`${m.short}   •   Best ${b.score}`, x + w - 44, my + 24);
  });
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#9fb0c0';
  ctx.textAlign = 'center';
  ctx.fillText('W/S throttle • ← → bank • ↑ ↓ pitch • Q/E rudder • F flaps • C camera', FIELD.width / 2, y + h - 58);
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = '#ffb02e';
  ctx.fillText('Press 1–3 to pick a sortie, Space to fly', FIELD.width / 2, y + h - 24);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  window.addEventListener('keydown', (event) => {
    if (screen === 'title' && ['Digit1', 'Digit2', 'Digit3'].includes(event.code)) {
      selectMission(Number(event.code.slice(-1)) - 1);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      announce('Paused.');
    }
  });

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    audio.update(flight);
    if (screen === 'title') {
      while (accumulator >= STEP) {
        stepTitle(STEP);
        accumulator -= STEP;
      }
    } else if (screen === 'play') {
      while (accumulator >= STEP) {
        stepPlay(STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    stepClouds(terrain.clouds, Math.min(0.05, (now - last) / 1000 + 0.016));
    drawFrame();
  }

  announce('Kestrel Canyon. Press 1, 2 or 3 to pick a sortie, Space to fly.');
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
}

resize();
window.addEventListener('resize', resize);
if (shot) {
  // Stage the scene, then paint it; stageShot rebuilds the mission in place.
  const world = { flight, mission, env };
  const staged = stageShot(shot, world);
  mission = world.mission;
  screen = staged.screen;
  cameraMode = staged.cameraMode;
  rig.mode = cameraMode;
  // The crash shot gets a fixed three-quarter view of the wreck.
  if (shot === 'end') rig.cinematic = { x: 20, y: 12, z: 20 };
  setCockpitView(aircraft, cameraMode === CAM_COCKPIT);
  updateRingMeshes(mission.rings, ringsBuilt.meshes, ringsBuilt.beam);
  let painted = 0;
  function paint() {
    drawFrame();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
} else {
  runGame();
}
