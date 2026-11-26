// The target rings: where they sit, when the plane flies through one, and the
// meshes that draw them. Pure logic (no THREE) for the pass test, so the world
// can be stepped headless; the meshes live beside it.
import { RING, PALETTE } from './config.js';

/**
 * A ring course: an ordered list of centres. Each ring faces the direction of
 * travel, so the pass test is a plane crossing, not a distance check.
 * positions: [{x, y, z}] in order; normals computed from leg to leg.
 */
export function createRings(positions) {
  const list = positions.map((p, i) => {
    const next = positions[Math.min(i + 1, positions.length - 1)];
    const prev = positions[Math.max(i - 1, 0)];
    // Normal: the direction of travel through this ring.
    let nx = next.x - prev.x;
    let ny = next.y - prev.y;
    let nz = next.z - prev.z;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    return { x: p.x, y: p.y, z: p.z, nx, ny, nz, passed: false, prevD: null };
  });
  return { list, index: 0, passed: 0, total: list.length };
}

export function nextRing(rings) {
  return rings.index < rings.list.length ? rings.list[rings.index] : null;
}

/**
 * Test the current ring against the plane's position. Returns the ring when the
 * plane crosses its plane inside the circle (or clips its centre), else null.
 */
export function checkRing(rings, px, py, pz) {
  const ring = nextRing(rings);
  if (!ring) return null;
  const dx = px - ring.x;
  const dy = py - ring.y;
  const dz = pz - ring.z;
  const d = dx * ring.nx + dy * ring.ny + dz * ring.nz;
  const radial = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - d * d));
  let passed = false;
  if (ring.prevD !== null && ring.prevD < 0 && d >= 0 && radial < RING.radius) passed = true;
  if (Math.sqrt(dx * dx + dy * dy + dz * dz) < RING.radius * 0.7) passed = true;
  ring.prevD = d;
  if (passed) {
    ring.passed = true;
    rings.index += 1;
    rings.passed += 1;
    return ring;
  }
  return null;
}

export function ringsRemaining(rings) {
  return rings.total - rings.passed;
}

/** Build the ring meshes for a course. Returns { group, meshes }. */
export function buildRings(rings) {
  const group = new THREE.Group();
  group.name = 'rings';
  const meshes = [];
  const geo = new THREE.TorusGeometry(RING.radius, RING.tube, 10, 36);
  rings.list.forEach((ring, i) => {
    const mat = new THREE.MeshBasicMaterial({
      color: i === 0 ? PALETTE.ringNext : PALETTE.ring,
      transparent: true,
      opacity: 0.92,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ring.x, ring.y, ring.z);
    // Face the travel direction: torus lies in XY by default, so look along n.
    mesh.lookAt(ring.x + ring.nx, ring.y + ring.ny, ring.z + ring.nz);
    mesh.name = `ring-${i}`;
    mesh.userData.index = i;
    group.add(mesh);
    meshes.push(mesh);
    // A faint inner disc so the ring reads at a distance.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(RING.radius - 1, 28),
      new THREE.MeshBasicMaterial({ color: PALETTE.ring, transparent: true, opacity: 0.07, side: THREE.DoubleSide }),
    );
    disc.position.copy(mesh.position);
    disc.quaternion.copy(mesh.quaternion);
    group.add(disc);
  });
  // The beacon: a tall light column over the next ring, so the pilot can find it.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 260, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: PALETTE.ringNext, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.name = 'beacon';
  group.add(beam);
  return { group, meshes, beam };
}

/** Recolour rings after a pass: passed = green, next = bright gold, rest dim. */
export function updateRingMeshes(rings, meshes, beam) {
  meshes.forEach((mesh, i) => {
    const ring = rings.list[i];
    if (ring.passed) mesh.material.color.set(0x35d05a);
    else if (i === rings.index) mesh.material.color.set(PALETTE.ringNext);
    else mesh.material.color.set(PALETTE.ring);
    mesh.material.opacity = ring.passed ? 0.45 : i === rings.index ? 1 : 0.75;
  });
  const next = nextRing(rings);
  if (next && beam) {
    beam.visible = true;
    beam.position.set(next.x, next.y + 130, next.z);
  } else if (beam) {
    beam.visible = false;
  }
}
