// Procedural city layout: roads on a 40-unit grid, one building per block,
// districts (downtown glass, park, harbour yard, warehouse row, beach) and
// the landmarks the missions drive to. Rendered by render.js from the lists
// here; collision is circle-vs-building-AABB, so the lists are the truth.
import { makeRng, clamp } from './random.js';

export const ROADS = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
export const BLOCKS = [-140, -100, -60, -20, 20, 60, 100, 140];
export const ROAD_HALF = 6; // road surface is 12 wide; sidewalks beyond

export function buildCity(seed) {
  const rng = makeRng(seed);
  const landmarks = {
    safehouse: { x: -20, z: -138 }, spawn: { x: -20, z: -126 },
    bank: { x: 20, z: 20 }, bar: { x: 176, z: 60 },
    spray: { x: 80, z: -80 }, chopshop: { x: -120, z: 120 },
    harbour: { x: 120, z: -140 }, warehouse: { x: -120, z: 100 },
  };
  const buildings = [];
  const addB = (x, z, w, d, h, kind, variant = 0) =>
    buildings.push({ x, z, w, d, h, kind, variant });
  // Landmark buildings (also the collision for their missions).
  addB(20, 20, 20, 20, 40, 'glass', 3);        // Solmar Bank tower
  addB(-20, -138, 12, 10, 6, 'house', 2);      // Safehouse
  addB(-140, 120, 18, 14, 7, 'shop', 1);       // Mack's Chop Shop
  addB(72, -72, 12, 10, 6, 'shop', 0);         // Spray & Go garage
  addB(176, 60, 10, 8, 4, 'bar', 2);           // Sundown Beach Bar
  addB(-140, 100, 24, 18, 9, 'warehouse', 1);  // Warehouse
  addB(-100, 100, 22, 16, 8, 'warehouse', 1);  // Warehouse 2
  const skip = new Set(['20,20', '-20,-140', '-140,120', '-140,100', '-100,100',
    '-100,-100', '100,-140', '140,-140', '60,-60']);
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    if (skip.has(`${bx},${bz}`)) continue;
    if (Math.abs(bx) <= 60 && Math.abs(bz) <= 60) {
      addB(bx, bz, rng.range(16, 22), rng.range(16, 22), rng.range(18, 38), 'glass', 3);
    } else {
      const v = rng.int(0, 2);
      addB(bx, bz, rng.range(16, 24), rng.range(16, 24), rng.range(8, 20),
        ['brick', 'concrete', 'stucco'][v], v);
    }
  }
  // Palms: boardwalk row, park ring, beach bar cluster.
  const palms = [];
  for (let z = -120; z <= 120; z += 16)
    palms.push({ x: 168 + rng.range(-2, 2), z: z + rng.range(-3, 3), s: rng.range(0.85, 1.3), rot: rng.range(0, 6.28) });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28;
    palms.push({ x: -100 + Math.cos(a) * 17, z: -100 + Math.sin(a) * 17, s: rng.range(0.9, 1.25), rot: rng.range(0, 6.28) });
  }
  for (let i = 0; i < 3; i++)
    palms.push({ x: 172 + rng.range(-3, 3), z: 48 + i * 12, s: rng.range(0.9, 1.2), rot: rng.range(0, 6.28) });
  // Bushes: park and sidewalk fillers.
  const bushes = [];
  for (let i = 0; i < 10; i++)
    bushes.push({ x: -100 + rng.range(-13, 13), z: -100 + rng.range(-13, 13), s: rng.range(0.7, 1.3) });
  for (let i = 0; i < 16; i++)
    bushes.push({ x: rng.pick(BLOCKS) + rng.range(-12, 12), z: rng.pick(ROADS) + rng.range(8, 10), s: rng.range(0.6, 1.1) });
  // Streetlamps: one per intersection corner, plus the boardwalk.
  const lamps = [];
  for (const rx of ROADS) for (const rz of ROADS) lamps.push({ x: rx + 8, z: rz + 8 });
  for (let z = -120; z <= 120; z += 20) lamps.push({ x: 170, z });
  // Harbour containers: two yard blocks, stacked where the rng says so.
  const containers = [];
  const cols = [0x8a3a2a, 0x2a5a8a, 0x3a7a4a, 0xc2a23a, 0x7a7f85];
  for (const bx of [100, 140]) for (let i = 0; i < 12; i++) {
    const x = bx - 12 + (i % 4) * 8, z = -140 - 8 + Math.floor(i / 4) * 8;
    const color = rng.pick(cols);
    containers.push({ x, z, y: 0, ry: 0, color });
    if (rng.chance(0.35)) containers.push({ x, z, y: 2.6, ry: 0, color: rng.pick(cols) });
  }
  // Road network nodes for traffic routing (intersections).
  const nodes = [];
  for (const rx of ROADS) for (const rz of ROADS) nodes.push({ x: rx, z: rz });
  // Hidden packages: one near each landmark, the rest on block corners.
  const packages = [];
  const spots = [landmarks.safehouse, landmarks.bank, landmarks.bar, landmarks.spray,
    landmarks.chopshop, landmarks.harbour, landmarks.warehouse, { x: -100, z: -100 }];
  spots.forEach((s, i) => packages.push({ id: i, x: s.x + 6, z: s.z + 6, found: false }));
  for (let i = spots.length; i < 20; i++)
    packages.push({ id: i, x: rng.pick(BLOCKS) + rng.range(-11, 11), z: rng.pick(BLOCKS) + rng.range(-11, 11), found: false });
  return {
    landmarks, packages, nodes, buildings, palms, bushes, lamps, containers,
    pond: { x: -100, z: -100, r: 12 },
  };
}

export function onRoad(x, z) {
  for (const r of ROADS) if (Math.abs(x - r) <= ROAD_HALF || Math.abs(z - r) <= ROAD_HALF) return true;
  return false;
}

export function nearestRoadPoint(x, z) {
  let bx = ROADS[0], bd = 1e9;
  for (const r of ROADS) { const d = Math.abs(x - r); if (d < bd) { bd = d; bx = r; } }
  let bz = ROADS[0]; bd = 1e9;
  for (const r of ROADS) { const d = Math.abs(z - r); if (d < bd) { bd = d; bz = r; } }
  const cx = clamp(x, -160, 160), cz = clamp(z, -160, 160);
  return Math.abs(x - bx) < Math.abs(z - bz) ? { x: bx, z: cz } : { x: cx, z: bz };
}

// Waypoints from A to B along the roads (Manhattan via intersections).
export function roadPath(ax, az, bx, bz) {
  const p0 = nearestRoadPoint(ax, az), p1 = nearestRoadPoint(bx, bz);
  const pts = [{ x: ax, z: az }, p0];
  if (p0.x !== p1.x && p0.z !== p1.z) pts.push({ x: p1.x, z: p0.z });
  pts.push(p1, { x: bx, z: bz });
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.z !== pts[i - 1].z);
}

// Resolve a circle against the city and return the allowed {x, z} (callers
// assign fixed.x/fixed.z). Pushes out of buildings/containers along the
// smallest penetration axis, clamps to the bounds and the ocean edge, and
// pushes out of the pond radially. Two passes so one push-out cannot shove
// the circle into a neighbouring building.
export function collideCircle(city, x, z, r) {
  let px = Math.max(-216 + r, Math.min(216 - r, x));
  let pz = Math.max(-216 + r, Math.min(216 - r, z));
  if (px > 180 - r) px = 180 - r; // ocean edge
  const resolve = (bx, bz, hw, hd) => {
    const dx = px - bx, dz = pz - bz;
    const ox = hw + r - Math.abs(dx), oz = hd + r - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) px = bx + (dx >= 0 ? hw + r : -(hw + r));
      else pz = bz + (dz >= 0 ? hd + r : -(hd + r));
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    const p = city.pond;
    if (p) {
      const dx = px - p.x, dz = pz - p.z;
      const d = Math.hypot(dx, dz), min = p.r + r;
      if (d < min) {
        if (d > 0.0001) { px = p.x + (dx / d) * min; pz = p.z + (dz / d) * min; }
        else px = p.x + min;
      }
    }
    for (const b of city.buildings) resolve(b.x, b.z, b.w / 2, b.d / 2);
    for (const c of city.containers) {
      const w = c.ry ? 2.6 : 6, d = c.ry ? 6 : 2.6;
      resolve(c.x, c.z, w / 2, d / 2);
    }
  }
  return { x: px, z: pz };
}
