// Seeded randomness for Solmar City. Every gameplay roll goes through one of
// these generators so a seed replays the same city, traffic and pedestrians.
// Never Math.random in gameplay code: replays drift and bugs stop reproducing.
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let s = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 1;
  const next = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    // Fisher-Yates shuffle that returns a new array, leaving the input alone.
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    },
  };
}

// A tiny deterministic noise for wobble and texture grain: smooth-ish 1D value
// noise from integer hashing, no lookup tables to ship.
export function valueNoise1(x) {
  const xi = Math.floor(x);
  const xf = x - xi;
  const h = (n) => {
    let v = Math.imul(n | 0, 374761393);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return (((v ^ (v >>> 16)) >>> 0) / 4294967296) * 2 - 1;
  };
  const u = xf * xf * (3 - 2 * xf);
  return h(xi) * (1 - u) + h(xi + 1) * u;
}
