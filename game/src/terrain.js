// The valley: a pure height function the flight model, the autopilot and the
// renderer all share, plus the meshes that draw it. Nothing here needs a
// renderer to answer heightAt(x, z), so the world can be stepped headless.
import { WORLD, RUNWAY, PALETTE } from './config.js';
import { fbm, valueNoise, clamp, lerp } from './random.js';

/** The river's centreline: x as a function of z, a slow S-curve north to south. */
export function riverX(z) {
  return 260 * Math.sin(z * 0.0011 + 1.3) - 120;
}

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Ground height in metres at world (x, z). Rolling hills, a river channel carved
 * along the S-curve, rim mountains toward the edges, and a flat airfield pad.
 */
export function heightAt(x, z) {
  const r = Math.sqrt(x * x + z * z);
  let h = WORLD.baseHeight + fbm(x * 0.004, z * 0.004, 7, 4) * WORLD.hillAmp;
  // River channel.
  const dRiver = Math.abs(x - riverX(z));
  h -= WORLD.riverDepth * (1 - smoothstep(20, 110, dRiver));
  // Rim mountains, rugged.
  const rim = smoothstep(WORLD.rimStart, WORLD.rimEnd, r);
  h += rim * WORLD.rimHeight * (0.65 + 0.7 * (fbm(x * 0.002 + 40, z * 0.002, 21, 3) * 0.5 + 0.5));
  // Airfield pad: blend to the runway elevation near the strip.
  const dx = (x - RUNWAY.x) / 260;
  const dz = (z - RUNWAY.z) / 420;
  const dPad = Math.sqrt(dx * dx + dz * dz);
  const flat = 1 - smoothstep(0.55, 1.0, dPad);
  h = lerp(h, RUNWAY.elevation, flat);
  return h;
}

/** Approximate ground slope (rise over run) at (x, z), for colour and trees. */
export function slopeAt(x, z) {
  const e = 6;
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.sqrt(gx * gx + gz * gz);
}

function colourFor(x, z, h, slope, out) {
  // Returns [r, g, b] in 0..1.
  const n = valueNoise(x * 0.02, z * 0.02, 99) * 0.5 + 0.5; // patchiness
  let r;
  let g;
  let b;
  if (h < WORLD.waterLevel + 1.5) {
    // Sandy shore.
    r = 0.79; g = 0.71; b = 0.54;
  } else if (slope > 0.55 || h > 190) {
    // Rock, then snow on the high rim.
    if (h > 225) { r = 0.93; g = 0.95; b = 0.96; }
    else { r = 0.49; g = 0.45; b = 0.4; }
  } else {
    // Grass, dry patches where the noise says so.
    const dry = n;
    r = lerp(0.36, 0.54, dry);
    g = lerp(0.54, 0.6, dry);
    b = lerp(0.28, 0.3, dry);
  }
  // Gentle shading variation so the ground reads as terrain, not flat colour.
  const shade = 0.92 + n * 0.16;
  out[0] = r * shade; out[1] = g * shade; out[2] = b * shade;
  return out;
}

/** Build the ground mesh, river, runway, trees, rocks, clouds and sky. */
export function buildTerrain(scene, random) {
  const group = new THREE.Group();
  group.name = 'terrain';

  // --- Ground ---
  const SEG = 150;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const c = [0, 0, 0];
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    colourFor(x, z, h, slopeAt(x, z), c);
    colours[i * 3] = c[0];
    colours[i * 3 + 1] = c[1];
    colours[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  ground.name = 'ground';
  group.add(ground);

  // --- River ribbon + lake ---
  const riverPts = [];
  for (let z = -WORLD.half; z <= WORLD.half; z += 40) riverPts.push(z);
  const riverGeo = new THREE.BufferGeometry();
  const rv = [];
  const rIdx = [];
  riverPts.forEach((z, i) => {
    const cx = riverX(z);
    const w = 26;
    rv.push(cx - w, WORLD.waterLevel, z, cx + w, WORLD.waterLevel, z);
    if (i > 0) {
      const a = (i - 1) * 2;
      rIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3));
  riverGeo.setIndex(rIdx);
  riverGeo.computeVertexNormals();
  const river = new THREE.Mesh(
    riverGeo,
    new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 }),
  );
  river.name = 'river';
  group.add(river);

  // --- Runway + markings ---
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length),
    new THREE.MeshLambertMaterial({ color: PALETTE.runway }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(RUNWAY.x, RUNWAY.elevation + 0.25, RUNWAY.z);
  strip.name = 'runway';
  group.add(strip);
  // Centreline dashes and threshold bars.
  const markMat = new THREE.MeshBasicMaterial({ color: PALETTE.runwayLine });
  for (let d = -RUNWAY.length / 2 + 30; d < RUNWAY.length / 2 - 20; d += 40) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 18), markMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(RUNWAY.x, RUNWAY.elevation + 0.35, RUNWAY.z + d);
    group.add(dash);
  }
  for (const s of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(RUNWAY.width - 8, 5), markMat);
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(RUNWAY.x, RUNWAY.elevation + 0.35, RUNWAY.z + s * (RUNWAY.length / 2 - 14));
    group.add(bar);
  }
  // Windsock: pole + orange cone that swings with the wind.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 9, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  pole.position.set(RUNWAY.x + 26, RUNWAY.elevation + 4.5, RUNWAY.z - RUNWAY.length / 2 + 24);
  group.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 4.5, 8),
    new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(RUNWAY.x + 24, RUNWAY.elevation + 8.6, RUNWAY.z - RUNWAY.length / 2 + 24);
  sock.name = 'windsock';
  group.add(sock);
  // Two hangars beside the strip.
  const hangarMat = new THREE.MeshLambertMaterial({ color: 0x8a7f70 });
  for (const [hx, hz] of [[-52, RUNWAY.z + 60], [-52, RUNWAY.z + 110]]) {
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(26, 10, 34), hangarMat);
    hangar.position.set(hx, RUNWAY.elevation + 5, hz);
    group.add(hangar);
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(13, 13, 34, 12, 1, false, 0, Math.PI),
      new THREE.MeshLambertMaterial({ color: 0x5d6b7a }),
    );
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.set(hx, RUNWAY.elevation + 10, hz);
    group.add(roof);
  }

  // --- Trees (instanced): trunk + foliage cone ---
  const treeSpots = [];
  let guard = 0;
  while (treeSpots.length < 750 && guard < 20000) {
    guard += 1;
    const x = (random() * 2 - 1) * (WORLD.half - 60);
    const z = (random() * 2 - 1) * (WORLD.half - 60);
    const h = heightAt(x, z);
    if (h < WORLD.waterLevel + 2 || h > 130) continue;
    if (slopeAt(x, z) > 0.45) continue;
    if (Math.abs(x - riverX(z)) < 34) continue;
    const dPad = Math.hypot((x - RUNWAY.x) / 260, (z - RUNWAY.z) / 420);
    if (dPad < 1.05) continue;
    treeSpots.push([x, h, z, 0.8 + random() * 0.9]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.treeTrunk });
  const leafGeo = new THREE.ConeGeometry(2.6, 8, 7);
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.treeLeaf });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, treeSpots.length);
  const m4 = new THREE.Matrix4();
  treeSpots.forEach(([x, h, z, s], i) => {
    m4.makeScale(s, s, s);
    m4.setPosition(x, h + 1.5 * s, z);
    trunks.setMatrixAt(i, m4);
    m4.makeScale(s, s, s);
    m4.setPosition(x, h + (3 + 4) * s, z);
    leaves.setMatrixAt(i, m4);
  });
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  group.add(trunks);
  group.add(leaves);

  // --- Rocks on the slopes ---
  const rockGeo = new THREE.DodecahedronGeometry(2.2, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: PALETTE.rock });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 130);
  for (let i = 0; i < 130; i += 1) {
    const x = (random() * 2 - 1) * (WORLD.half - 40);
    const z = (random() * 2 - 1) * (WORLD.half - 40);
    const h = heightAt(x, z);
    const s = 0.6 + random() * 1.8;
    m4.makeRotationY(random() * Math.PI * 2);
    m4.scale(new THREE.Vector3(s, s * 0.7, s));
    m4.setPosition(x, h + 0.6 * s, z);
    rocks.setMatrixAt(i, m4);
  }
  rocks.instanceMatrix.needsUpdate = true;
  group.add(rocks);

  // --- Clouds: soft white puffs drifting across the valley. Unlit so they
  // read bright white from every angle instead of shaded grey.
  const clouds = new THREE.Group();
  clouds.name = 'clouds';
  const cloudMat = new THREE.MeshBasicMaterial({ color: PALETTE.cloud, transparent: true, opacity: 0.92 });
  const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 16; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(random() * 3);
    for (let p = 0; p < puffs; p += 1) {
      const s = new THREE.Mesh(sphereGeo, cloudMat);
      const sc = 9 + random() * 14;
      s.scale.set(sc, sc * 0.45, sc * 0.7);
      s.position.set((random() - 0.5) * 34, (random() - 0.5) * 4, (random() - 0.5) * 18);
      cloud.add(s);
    }
    cloud.position.set(
      (random() * 2 - 1) * 1000,
      190 + random() * 130,
      (random() * 2 - 1) * 1000,
    );
    cloud.userData.speed = 1.5 + random() * 2.5;
    clouds.add(cloud);
  }
  group.add(clouds);

  // --- Sky dome: a big inverted sphere, blue above, pale at the horizon ---
  const skyGeo = new THREE.SphereGeometry(4200, 24, 14);
  const skyPos = skyGeo.attributes.position;
  const skyCol = new Float32Array(skyPos.count * 3);
  const top = new THREE.Color(PALETTE.skyTop);
  const horizon = new THREE.Color(PALETTE.skyHorizon);
  for (let i = 0; i < skyPos.count; i += 1) {
    const t = clamp(skyPos.getY(i) / 4200, 0, 1);
    const col = horizon.clone().lerp(top, Math.pow(t, 0.7));
    skyCol[i * 3] = col.r;
    skyCol[i * 3 + 1] = col.g;
    skyCol[i * 3 + 2] = col.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyCol, 3));
  const sky = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }),
  );
  sky.name = 'sky';
  group.add(sky);

  // --- Lights ---
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.9);
  sun.position.set(600, 900, 300);
  group.add(sun);
  group.add(new THREE.HemisphereLight(0xbfd9ee, 0x6b7a55, 0.85));

  scene.add(group);
  scene.fog = new THREE.Fog(0xcfe4f2, 700, 3400);
  return { group, clouds, windsock: sock };
}

/** Drift the clouds; call once a frame with the elapsed seconds. */
export function stepClouds(clouds, dt) {
  for (const cloud of clouds.children) {
    cloud.position.x += cloud.userData.speed * dt;
    if (cloud.position.x > 1150) cloud.position.x = -1150;
  }
}
