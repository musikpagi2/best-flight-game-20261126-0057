// The glass-cockpit HUD, drawn on a 2D canvas over the 3D view: attitude,
// airspeed and altitude tapes, compass, throttle, fuel, damage, the mission
// panel and flash messages. Instruments lit, numbers live.
import { FIELD, FONT, PALETTE } from './config.js';
import { speedKnots, altFeet, headingDeg } from './flight.js';
import { nextRing, ringsRemaining } from './rings.js';
import { wrapDeg, clamp } from './random.js';

const W = FIELD.width;
const H = FIELD.height;

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
}

function text(ctx, value, x, y, size, color, align = 'left', weight = '') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function drawCompass(ctx, heading) {
  const cx = W / 2;
  const y = 26;
  panel(ctx, cx - 260, 8, 520, 44);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 250, 12, 500, 36);
  ctx.clip();
  for (let d = -90; d <= 90; d += 5) {
    const h = (Math.round(heading / 5) * 5 + d + 360) % 360;
    const x = cx + d * 2.4;
    const major = h % 30 === 0;
    ctx.strokeStyle = major ? PALETTE.text : PALETTE.muted;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 14);
    ctx.lineTo(x, y + (major ? 26 : 20));
    ctx.stroke();
    if (major) {
      const label = h === 0 ? 'N' : h === 90 ? 'E' : h === 180 ? 'S' : h === 270 ? 'W' : String(h / 10);
      text(ctx, label, x, y + 2, 15, PALETTE.text, 'center', 'bold');
    }
  }
  ctx.restore();
  // Caret + readout.
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.beginPath();
  ctx.moveTo(cx - 7, y + 26);
  ctx.lineTo(cx + 7, y + 26);
  ctx.lineTo(cx, y + 34);
  ctx.closePath();
  ctx.fill();
  text(ctx, `${String(Math.round(heading)).padStart(3, '0')}°`, cx, 76, 18, PALETTE.hudAmber, 'center', 'bold');
}

function drawTape(ctx, x, value, unit, step, format, label) {
  panel(ctx, x, 110, 96, 400);
  text(ctx, label, x + 48, 132, 13, PALETTE.muted, 'center', 'bold');
  const cy = 310;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 4, 140, 88, 340);
  ctx.clip();
  const pxPerUnit = 4.2;
  for (let d = -40; d <= 40; d += step) {
    const v = Math.round((value + d) / step) * step;
    if (v < 0) continue;
    const y = cy - (v - value) * pxPerUnit;
    if (y < 140 || y > 480) continue;
    const major = v % (step * 5) === 0;
    ctx.strokeStyle = major ? PALETTE.text : PALETTE.muted;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x + 62, y);
    ctx.lineTo(x + (major ? 78 : 70), y);
    ctx.stroke();
    if (major) text(ctx, format(v), x + 56, y + 5, 15, PALETTE.text, 'right');
  }
  ctx.restore();
  // Current value box.
  ctx.fillStyle = PALETTE.panel;
  ctx.beginPath();
  ctx.roundRect(x + 6, cy - 20, 84, 40, 6);
  ctx.fill();
  ctx.strokeStyle = PALETTE.hud;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  text(ctx, format(Math.round(value)), x + 48, cy + 7, 24, PALETTE.hud, 'center', 'bold');
  text(ctx, unit, x + 48, 500, 13, PALETTE.muted, 'center');
}

function drawAttitude(ctx, pitchDeg, rollDeg) {
  // Upper centre, below the compass: the screen centre stays free for the
  // aircraft and the next ring.
  const cx = W / 2;
  const cy = 205;
  const r = 88;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-rollDeg * Math.PI / 180);
  const pxPerDeg = 3.2;
  const dy = pitchDeg * pxPerDeg;
  // Sky and ground.
  ctx.fillStyle = '#2f6fb4';
  ctx.fillRect(-r - 4, -r - 4 - dy, (r + 4) * 2, r + 4 + dy);
  ctx.fillStyle = '#8a6f4d';
  ctx.fillRect(-r - 4, -dy, (r + 4) * 2, r + 4 + dy);
  // Horizon line.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-r, -dy);
  ctx.lineTo(r, -dy);
  ctx.stroke();
  // Pitch ladder every 10 degrees.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.5;
  for (const p of [-20, -10, 10, 20]) {
    const y = -dy - p * pxPerDeg;
    ctx.beginPath();
    ctx.moveTo(-34, y);
    ctx.lineTo(34, y);
    ctx.stroke();
    text(ctx, String(Math.abs(p)), -42, y + 4, 12, '#ffffff', 'right');
  }
  ctx.restore();
  // Rim + fixed aircraft symbol.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = PALETTE.hud;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = PALETTE.hudAmber;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 34, cy);
  ctx.lineTo(cx - 10, cy);
  ctx.moveTo(cx + 10, cy);
  ctx.lineTo(cx + 34, cy);
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx, cy + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.fill();
}

function drawThrottleFuel(ctx, flight) {
  // Throttle bar, bottom left.
  panel(ctx, 24, H - 150, 54, 126);
  text(ctx, 'THR', 51, H - 128, 12, PALETTE.muted, 'center', 'bold');
  const bx = 36;
  const by = H - 116;
  const bh = 78;
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(bx, by, 30, bh);
  const th = clamp(flight.throttle, 0, 1);
  ctx.fillStyle = th > 0.85 ? PALETTE.hudAmber : PALETTE.hud;
  ctx.fillRect(bx, by + bh * (1 - th), 30, bh * th);
  text(ctx, `${Math.round(th * 100)}%`, 51, H - 18, 13, PALETTE.text, 'center');
  // Fuel + damage, bottom left next to it: label and value share a line,
  // the bar sits below, so the value never strikes through the bar.
  panel(ctx, 92, H - 150, 210, 126);
  text(ctx, 'FUEL', 108, H - 122, 12, PALETTE.muted, 'left', 'bold');
  text(ctx, `${Math.round(flight.fuel)}%`, 292, H - 122, 13, PALETTE.text, 'right', 'bold');
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(108, H - 112, 178, 16);
  const fuel = clamp(flight.fuel / 100, 0, 1);
  ctx.fillStyle = fuel < 0.2 ? PALETTE.hudRed : fuel < 0.45 ? PALETTE.hudAmber : PALETTE.hudGreen;
  ctx.fillRect(108, H - 112, 178 * fuel, 16);
  text(ctx, 'DAMAGE', 108, H - 72, 12, PALETTE.muted, 'left', 'bold');
  text(ctx, `${Math.round(flight.damage)}%`, 292, H - 72, 13, PALETTE.text, 'right', 'bold');
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(108, H - 62, 178, 16);
  ctx.fillStyle = flight.damage > 60 ? PALETTE.hudRed : PALETTE.hudAmber;
  ctx.fillRect(108, H - 62, 178 * clamp(flight.damage / 100, 0, 1), 16);
  if (flight.flaps) text(ctx, 'FLAPS', 108, H - 24, 13, PALETTE.hudAmber, 'left', 'bold');
}

function drawMissionPanel(ctx, mission, flight) {
  const def = mission.def;
  panel(ctx, W - 330, H - 150, 306, 126);
  text(ctx, def.name.toUpperCase(), W - 314, H - 122, 15, PALETTE.hudAmber, 'left', 'bold');
  text(ctx, fmtTime(mission.elapsed), W - 40, H - 122, 15, PALETTE.text, 'right', 'bold');
  const ring = nextRing(mission.rings);
  const line = ring
    ? `Ring ${mission.rings.passed + 1} of ${mission.rings.total} — ${Math.round(Math.hypot(ring.x - flight.x, ring.y - flight.y, ring.z - flight.z))} m`
    : mission.def.id === 'touchdown' && flight.onGround
      ? 'On the runway — mission complete'
      : 'All rings flown';
  text(ctx, line, W - 314, H - 94, 15, PALETTE.text, 'left');
  text(ctx, `Score ${mission.score}`, W - 314, H - 66, 15, PALETTE.text, 'left');
  text(ctx, `Par ${fmtTime(def.parSeconds)}`, W - 40, H - 66, 13, PALETTE.muted, 'right');
  const hint = mission.rings.passed === 0
    ? 'Follow the gold beacon to the next ring'
    : `${ringsRemaining(mission.rings)} ring${ringsRemaining(mission.rings) === 1 ? '' : 's'} left`;
  text(ctx, hint, W - 314, H - 40, 13, PALETTE.muted, 'left');
}

function drawMessages(ctx, messages, now) {
  let y = 330;
  for (const m of messages) {
    const age = now - m.at;
    if (age > 2.6) continue;
    ctx.globalAlpha = age > 1.8 ? Math.max(0, 1 - (age - 1.8) / 0.8) : 1;
    text(ctx, m.text, W / 2, y, 26, m.color, 'center', 'bold');
    y += 34;
  }
  ctx.globalAlpha = 1;
}

/** Paint the whole HUD. view: { flight, mission, messages, now, score, best }. */
export function drawHud(ctx, view) {
  const { flight, mission } = view;
  ctx.clearRect(0, 0, W, H);
  const groundY = view.groundY ?? 0;
  const heading = headingDeg(flight);
  const knots = speedKnots(flight);
  const alt = altFeet(flight, groundY);

  drawCompass(ctx, heading);
  drawTape(ctx, 24, knots, 'KT', 10, (v) => String(v), 'AIRSPEED');
  drawTape(ctx, W - 120, alt, 'FT AGL', 100, (v) => String(v), 'ALTITUDE');
  // The attitude ball is hidden behind the title / end panels, so skip it
  // there; in play it sits upper-centre, clear of the aircraft.
  if (view.showAttitude !== false) drawAttitude(ctx, flight.pitch * 57.2958, flight.roll * 57.2958);
  // Reticle.
  ctx.strokeStyle = 'rgba(125,249,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2 + 10, 12, 0, Math.PI * 2);
  ctx.stroke();
  // Vertical speed arrow beside the altitude tape.
  const vs = flight.vy;
  if (Math.abs(vs) > 0.8) {
    text(ctx, vs > 0 ? `▲ ${Math.abs(vs).toFixed(1)} m/s` : `▼ ${Math.abs(vs).toFixed(1)} m/s`, W - 126, 540, 15, vs > 0 ? PALETTE.hudGreen : PALETTE.hudRed, 'right', 'bold');
  }
  // Warnings, below the attitude ball.
  if (flight.stalled) text(ctx, 'STALL', W / 2, 320, 30, PALETTE.hudRed, 'center', 'bold');
  else if (flight.fuel < 20 && flight.fuel > 0) text(ctx, 'LOW FUEL', W / 2, 320, 26, PALETTE.hudAmber, 'center', 'bold');
  else if (flight.engineOut) text(ctx, 'ENGINE OUT — GLIDE TO THE RUNWAY', W / 2, 320, 24, PALETTE.hudRed, 'center', 'bold');
  drawThrottleFuel(ctx, flight);
  drawMissionPanel(ctx, mission, flight);
  // Score, top left.
  panel(ctx, 24, 8, 220, 60);
  text(ctx, `SCORE ${mission.score}`, 40, 34, 20, PALETTE.text, 'left', 'bold');
  text(ctx, `BEST ${view.best}`, 40, 58, 14, PALETTE.muted, 'left');
  drawMessages(ctx, view.messages, view.now);
}
