// A small seeded random number generator (mulberry32) plus smooth value noise:
// the same seed gives the same valley, the same ring course and the same clouds,
// which is what makes the screenshot scenes repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634781) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise in [-1, 1] at world coordinates (x, z). */
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  const ux = smooth(fx);
  const uz = smooth(fz);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz);
}

/** Fractal noise: several octaves of value noise, result in roughly [-1, 1]. */
export function fbm(x, z, seed, octaves) {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    total += amp * valueNoise(x * freq, z * freq, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return total / norm;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Wrap an angle in degrees to [-180, 180). */
export function wrapDeg(a) {
  let v = a % 360;
  if (v >= 180) v -= 360;
  if (v < -180) v += 360;
  return v;
}

/** Wrap an angle in radians to [-PI, PI). */
export function wrapRad(a) {
  let v = a % (Math.PI * 2);
  if (v >= Math.PI) v -= Math.PI * 2;
  if (v < -Math.PI) v += Math.PI * 2;
  return v;
}
