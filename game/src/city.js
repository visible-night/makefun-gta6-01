// Procedural Solmar City: one seed, one city. Roads on a 40-unit grid, districts,
// landmarks, collision boxes, traffic graph and hidden packages.
import { makeRng, clamp } from './random.js';

export const ROADS = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
export const BLOCKS = [-140, -100, -60, -20, 20, 60, 100, 140];
export const ROAD_HALF = 6;
const CITY_MIN = -200, CITY_MAX = 200;

function district(bx, bz) {
  if (bx <= -80 && bz <= -80) return 'park';
  if (bx <= -80 && bz >= 80) return 'warehouse';
  if (Math.abs(bx) <= 60 && Math.abs(bz) <= 60) return 'downtown';
  return 'residential';
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const colliders = [];
  const trees = [];
  const lamps = [];
  const containers = [];
  const addBuilding = (x, z, w, d, h, kind, color) => {
    buildings.push({ x, z, w, d, h, kind, color });
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  };
  // Blocks: one district-flavoured building set each.
  for (const bx of BLOCKS) {
    for (const bz of BLOCKS) {
      const d = district(bx, bz);
      if (d === 'park') {
        for (let i = 0; i < 9; i++) trees.push({ x: bx + rng.range(-10, 10), z: bz + rng.range(-10, 10), palm: false, s: rng.range(0.8, 1.4) });
        continue;
      }
      if (bx === 20 && bz === 20) { // Solmar Bank, downtown anchor
        addBuilding(20, 20, 20, 20, 40, 'glass', 0xe8eef2);
        continue;
      }
      if (bx === -20 && bz === -140) { // Safehouse
        addBuilding(-20, -142, 12, 10, 6, 'house', 0xd8c49a);
        continue;
      }
      if (bx === 80 && bz === -80) { // Spray & Go garage
        addBuilding(80, -80, 16, 14, 7, 'warehouse', 0x5f8f6e);
        continue;
      }
      if (bx === -120 && bz === 120) { // Chop shop
        addBuilding(-120, 120, 18, 16, 8, 'warehouse', 0x8f6a4a);
        continue;
      }
      if (d === 'downtown') {
        const h = rng.range(26, 62);
        addBuilding(bx + rng.range(-2, 2), bz + rng.range(-2, 2), rng.range(14, 19), rng.range(14, 19), h, 'glass', rng.pick([0xd8e4ee, 0xe8eef2, 0xcfdce8, 0xe2e8ec]));
      } else if (d === 'warehouse') {
        addBuilding(bx, bz, rng.range(16, 20), rng.range(16, 20), rng.range(6, 9), 'warehouse', rng.pick([0x8a8f96, 0x9a8a7a, 0x7a8894]));
      } else {
        const n = rng.int(2, 3);
        for (let i = 0; i < n; i++) {
          const ox = (i % 2) * 10 - 5, oz = Math.floor(i / 2) * 10 - 5;
          addBuilding(bx + ox, bz + oz, rng.range(7, 9), rng.range(7, 9), rng.range(4, 8), 'house', rng.pick([0xc9b8a3, 0xb8c4a3, 0xc9a3a3, 0xa3b8c9, 0xd8c49a]));
        }
        if (rng.chance(0.6)) trees.push({ x: bx + rng.range(-9, 9), z: bz + rng.range(-9, 9), palm: false, s: rng.range(0.8, 1.2) });
      }
    }
  }
  // Harbour container yard (south edge) + pier.
  for (let i = 0; i < 26; i++) {
    const x = -70 + (i % 8) * 20 + rng.range(-2, 2);
    const z = 176 + Math.floor(i / 8) * 9;
    const c = { x, z, w: 12, d: 5, h: 3, color: rng.pick([0xa53a3a, 0x3a6ea5, 0x2f7d4f, 0xc2a23a, 0x8a6ea5]) };
    containers.push(c);
    colliders.push({ minX: x - 6, maxX: x + 6, minZ: z - 2.5, maxZ: z + 2.5 });
  }
  // Beach boardwalk palms (east edge) and park pond.
  for (let z = -180; z <= 180; z += 18) trees.push({ x: 172 + rng.range(-2, 2), z: z + rng.range(-3, 3), palm: true, s: rng.range(0.9, 1.3) });
  // Streetlamps along every road, alternating sides.
  for (const r of ROADS) {
    for (let t = -180; t <= 180; t += 40) {
      lamps.push({ x: r + 8, z: t });
      lamps.push({ x: t, z: r - 8 });
    }
  }
  // Hidden packages: beach, park, harbour, alleys.
  const packages = [];
  const pkgSpots = [];
  for (let i = 0; i < 6; i++) pkgSpots.push({ x: 178 + rng.range(-4, 8), z: rng.range(-170, 170) });
  for (let i = 0; i < 4; i++) pkgSpots.push({ x: rng.range(-160, -85), z: rng.range(-160, -85) });
  for (let i = 0; i < 4; i++) pkgSpots.push({ x: rng.range(-70, 80), z: rng.range(168, 195) });
  for (let i = 0; i < 6; i++) pkgSpots.push({ x: rng.pick(BLOCKS) + rng.range(-13, 13), z: rng.pick(BLOCKS) + rng.range(-13, 13) });
  pkgSpots.forEach((p, i) => packages.push({ id: i, x: clamp(p.x, -195, 195), z: clamp(p.z, -195, 195), found: false }));
  // Intersections for the traffic graph.
  const nodes = [];
  for (const x of ROADS) for (const z of ROADS) nodes.push({ x, z });
  const landmarks = {
    safehouse: { x: -20, z: -138 },
    spawn: { x: -20, z: -126 },
    bank: { x: 20, z: 20 },
    bar: { x: 176, z: 60 },
    spray: { x: 80, z: -80 },
    chopshop: { x: -120, z: 120 },
    harbour: { x: 0, z: 178 },
    warehouse: { x: -120, z: 100 },
    park: { x: -120, z: -120 },
    beach: { x: 180, z: 0 },
  };
  return { seed, buildings, colliders, trees, lamps, containers, packages, nodes, landmarks };
}

export function onRoad(x, z) {
  for (const r of ROADS) {
    if (Math.abs(x - r) <= ROAD_HALF + 2) return true;
    if (Math.abs(z - r) <= ROAD_HALF + 2) return true;
  }
  return false;
}
export function nearestRoadPoint(x, z) {
  let best = null, bd = Infinity;
  for (const r of ROADS) {
    const d1 = Math.abs(x - r), d2 = Math.abs(z - r);
    if (d1 < bd) { bd = d1; best = { x: r, z }; }
    if (d2 < bd) { bd = d2; best = { x, z: r }; }
  }
  return best;
}
// Manhattan waypoints along roads from A to B (peds, cops, traffic detours).
export function roadPath(ax, az, bx, bz) {
  const a = nearestRoadPoint(ax, az), b = nearestRoadPoint(bx, bz);
  const pts = [{ x: a.x, z: a.z }];
  if (Math.abs(a.x - b.x) > 0.5) pts.push({ x: b.x, z: a.z });
  pts.push({ x: b.x, z: b.z }, { x: bx, z: bz });
  return pts;
}
// Push a circle out of building colliders + world bounds. Returns corrected {x, z}.
export function collideCircle(city, x, z, r) {
  x = clamp(x, CITY_MIN + r, CITY_MAX - r);
  z = clamp(z, CITY_MIN + r, CITY_MAX - r);
  for (const c of city.colliders) {
    const nx = clamp(x, c.minX, c.maxX), nz = clamp(z, c.minZ, c.maxZ);
    const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r; z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
      }
    }
  }
  return { x, z };
}
