// Solmar City, generated from a seed: a road grid with blocks of buildings, a
// park, a beach and a harbour, the named places the missions use, and the
// collision helpers the rest of the game asks the city about.
import {
  AVE0, AVE_GAP, AVE_N, ST0, ST_GAP, ST_N, ROAD_W, WORLD_W, WORLD_H,
  COLORS, PACKAGE_COUNT,
} from './config.js';

export const SAND_X0 = 4410;
export const WATER_X0 = 4680;
export const HARBOR_Y0 = 3455;

// Block columns and rows that are parkland instead of buildings.
const PARK_BLOCKS = [[2, 2], [3, 2]];
const DOWNTOWN = { x0: 2050, y0: 1100, x1: 3500, y1: 2550 };

function isParkBlock(i, j) {
  return PARK_BLOCKS.some(([a, b]) => a === i && b === j);
}

function isDowntown(x, y) {
  return x > DOWNTOWN.x0 && x < DOWNTOWN.x1 && y > DOWNTOWN.y0 && y < DOWNTOWN.y1;
}

export function buildCity(rng) {
  const avenues = [];
  for (let i = 0; i < AVE_N; i += 1) avenues.push(AVE0 + i * AVE_GAP);
  const streets = [];
  for (let j = 0; j < ST_N; j += 1) streets.push(ST0 + j * ST_GAP);

  const buildings = [];
  const trees = [];
  const park = {
    x0: avenues[2] + ROAD_W / 2, y0: streets[2] + ROAD_W / 2,
    x1: avenues[4] - ROAD_W / 2, y1: streets[3] - ROAD_W / 2,
  };
  const pond = { x: (park.x0 + park.x1) / 2, y: (park.y0 + park.y1) / 2 + 40, rx: 150, ry: 80 };

  // One block sits between two neighbouring avenues and two neighbouring streets.
  for (let i = 0; i < AVE_N - 1; i += 1) {
    for (let j = 0; j < ST_N - 1; j += 1) {
      const bx0 = avenues[i] + ROAD_W / 2;
      const bx1 = avenues[i + 1] - ROAD_W / 2;
      const by0 = streets[j] + ROAD_W / 2;
      const by1 = streets[j + 1] - ROAD_W / 2;
      const cx = (bx0 + bx1) / 2;
      const cy = (by0 + by1) / 2;
      if (isParkBlock(i, j)) {
        for (let t = 0; t < 16; t += 1) {
          trees.push({
            x: rng.range(bx0 + 20, bx1 - 20), y: rng.range(by0 + 20, by1 - 20),
            r: rng.range(13, 22), shade: rng.next(),
          });
        }
        continue;
      }
      const inner = 26;
      if (isDowntown(cx, cy)) {
        const tall = rng.chance(0.6);
        const w = tall ? rng.range(180, 240) : rng.range(110, 150);
        const h = tall ? rng.range(180, 240) : rng.range(110, 150);
        buildings.push({
          x: cx - w / 2 + rng.range(-30, 30), y: cy - h / 2 + rng.range(-30, 30), w, h,
          hgt: rng.range(48, 115), color: rng.pick(COLORS.downtownGlass), glass: true, seed: rng.next(),
        });
        if (!tall) {
          buildings.push({
            x: bx0 + inner + rng.range(0, 40), y: by0 + inner + rng.range(0, 40),
            w: rng.range(70, 110), h: rng.range(70, 110),
            hgt: rng.range(30, 60), color: rng.pick(COLORS.downtownGlass), glass: true, seed: rng.next(),
          });
        }
      } else {
        // Two-by-two lots; most hold a house or a shop.
        const cw = (bx1 - bx0 - inner * 2) / 2;
        const ch = (by1 - by0 - inner * 2) / 2;
        for (let a = 0; a < 2; a += 1) {
          for (let b = 0; b < 2; b += 1) {
            if (!rng.chance(0.78)) continue;
            const w = rng.range(cw * 0.55, cw * 0.85);
            const h = rng.range(ch * 0.55, ch * 0.85);
            buildings.push({
              x: bx0 + inner + a * cw + (cw - w) / 2,
              y: by0 + inner + b * ch + (ch - h) / 2,
              w, h,
              hgt: rng.range(9, 30),
              color: rng.chance(0.5) ? rng.pick(COLORS.house) : rng.pick(COLORS.buildingRoof),
              glass: false, seed: rng.next(),
            });
          }
        }
      }
      if (rng.chance(0.5)) {
        trees.push({
          x: rng.range(bx0 + 30, bx1 - 30), y: rng.range(by0 + 30, by1 - 30),
          r: rng.range(11, 17), shade: rng.next(),
        });
      }
    }
  }

  // Harbour: stacked containers along the south strip.
  for (let x = 200; x < WORLD_W - 700; x += 130) {
    if (rng.chance(0.25)) continue;
    const rows = rng.int(1, 2);
    for (let r = 0; r < rows; r += 1) {
      buildings.push({
        x: x + rng.range(-10, 10), y: HARBOR_Y0 + 18 + r * 46, w: rng.range(80, 110), h: 34,
        hgt: 12, color: rng.pick(COLORS.container), glass: false, seed: rng.next(), container: true,
      });
    }
  }

  // Palms along the beach, trees on the west and north verges, street trees.
  for (let y = 120; y < WORLD_H - 200; y += rng.range(90, 170)) {
    trees.push({ x: rng.range(SAND_X0 + 30, WATER_X0 - 60), y, r: rng.range(12, 18), shade: rng.next(), palm: true });
  }
  for (let t = 0; t < 40; t += 1) {
    trees.push({ x: rng.range(30, 220), y: rng.range(30, WORLD_H - 30), r: rng.range(12, 20), shade: rng.next() });
    trees.push({ x: rng.range(30, WORLD_W - 30), y: rng.range(30, 180), r: rng.range(12, 20), shade: rng.next() });
  }
  for (const ax of avenues) {
    for (let y = 300; y < WORLD_H - 100; y += 260) {
      if (rng.chance(0.4)) {
        trees.push({
          x: ax + (rng.chance(0.5) ? 1 : -1) * (ROAD_W / 2 + 14),
          y: y + rng.range(-40, 40), r: rng.range(10, 15), shade: rng.next(),
        });
      }
    }
  }

  // Named places, each on a road centreline so it is always reachable.
  const shops = [
    { id: 'safehouse', name: 'Safehouse', x: 300, y: 470, kind: 'home', color: '#57a86b', letter: 'H' },
    { id: 'spray', name: 'Spray & Go', x: 2550, y: 1960, kind: 'spray', color: '#d97b9e', letter: 'S' },
    { id: 'hospital', name: 'Solmar General', x: 3450, y: 1150, kind: 'hospital', color: '#e8e4da', letter: '+' },
    { id: 'police', name: 'Central Precinct', x: 2100, y: 2500, kind: 'police', color: '#4f7ad9', letter: 'P' },
    { id: 'gunshop', name: 'Ammo King', x: 1200, y: 2500, kind: 'gun', color: '#d9a441', letter: 'A' },
    { id: 'docks', name: 'Harbour Docks', x: 3900, y: 3480, kind: 'docks', color: '#b8543f', letter: 'D' },
    { id: 'hotel', name: 'Palm Royale Hotel', x: 4350, y: 700, kind: 'hotel', color: '#e8d268', letter: '★' },
    { id: 'bank', name: 'Solmar Bank', x: 3000, y: 1600, kind: 'bank', color: '#57b8a8', letter: '$' },
    { id: 'warehouse', name: 'Old Warehouse', x: 750, y: 2950, kind: 'warehouse', color: '#8a6ea8', letter: 'W' },
    { id: 'chop', name: 'Chop Shop', x: 3450, y: 2950, kind: 'chop', color: '#d9574f', letter: 'C' },
    { id: 'taxi', name: 'Taxi Depot', x: 750, y: 1600, kind: 'taxi', color: '#e8d268', letter: 'T' },
    { id: 'beachbar', name: 'Sundown Beach Bar', x: 4500, y: 2050, kind: 'bar', color: '#ff9ad9', letter: 'B' },
  ];

  // Hidden packages on sidewalks, the beach and in the park.
  const packages = [];
  for (let n = 0; n < PACKAGE_COUNT; n += 1) {
    let x;
    let y;
    if (n < 4) {
      x = rng.range(SAND_X0 + 40, WATER_X0 - 80);
      y = rng.range(300, WORLD_H - 300);
    } else if (n < 7) {
      x = rng.range(park.x0 + 30, park.x1 - 30);
      y = rng.range(park.y0 + 30, park.y1 - 30);
    } else if (rng.chance(0.5)) {
      x = rng.pick(avenues) + (rng.chance(0.5) ? 1 : -1) * (ROAD_W / 2 + 16);
      y = rng.range(300, WORLD_H - 300);
    } else {
      x = rng.range(300, WORLD_W - 500);
      y = rng.pick(streets) + (rng.chance(0.5) ? 1 : -1) * (ROAD_W / 2 + 16);
    }
    packages.push({ x, y, taken: false });
  }

  function nearestOf(list, v) {
    let best = list[0];
    let bd = Math.abs(v - best);
    for (const c of list) {
      const d = Math.abs(v - c);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  function isWater(x) {
    return x > WATER_X0;
  }

  function isRoad(x, y) {
    if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) return false;
    for (const ax of avenues) if (Math.abs(x - ax) <= ROAD_W / 2) return true;
    for (const st of streets) if (Math.abs(y - st) <= ROAD_W / 2) return true;
    return false;
  }

  // The building a circle overlaps, or null. Buildings are few enough to scan.
  function hitBuilding(x, y, r) {
    for (const b of buildings) {
      if (x + r < b.x || x - r > b.x + b.w || y + r < b.y || y - r > b.y + b.h) continue;
      return b;
    }
    return null;
  }

  function pointInBuilding(x, y) {
    for (const b of buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  // Push a circle out of buildings, water and the map edge. Returns [x, y].
  function resolveCircle(x, y, r) {
    x = Math.max(r, Math.min(WORLD_W - r, x));
    y = Math.max(r, Math.min(WORLD_H - r, y));
    if (x > WATER_X0 - r) x = WATER_X0 - r;
    for (let pass = 0; pass < 2; pass += 1) {
      const b = hitBuilding(x, y, r);
      if (!b) break;
      const left = (x + r) - b.x;
      const right = (b.x + b.w) - (x - r);
      const top = (y + r) - b.y;
      const bottom = (b.y + b.h) - (y - r);
      const min = Math.min(left, right, top, bottom);
      if (min === left) x = b.x - r;
      else if (min === right) x = b.x + b.w + r;
      else if (min === top) y = b.y - r;
      else y = b.y + b.h + r;
    }
    return [x, y];
  }

  // A random point on a road, in a lane offset from the centreline.
  function randomRoadPoint(rng2) {
    if (rng2.chance(0.5)) {
      return {
        x: rng2.pick(avenues) + (rng2.chance(0.5) ? 27 : -27),
        y: rng2.range(140, WORLD_H - 140), axis: 'y',
      };
    }
    return {
      x: rng2.range(140, WORLD_W - 420),
      y: rng2.pick(streets) + (rng2.chance(0.5) ? 27 : -27), axis: 'x',
    };
  }

  // A random point on a sidewalk, beside a road.
  function randomSidewalkPoint(rng2) {
    if (rng2.chance(0.5)) {
      return {
        x: rng2.pick(avenues) + (rng2.chance(0.5) ? 1 : -1) * (ROAD_W / 2 + 14),
        y: rng2.range(140, WORLD_H - 140),
      };
    }
    return {
      x: rng2.range(140, WORLD_W - 420),
      y: rng2.pick(streets) + (rng2.chance(0.5) ? 1 : -1) * (ROAD_W / 2 + 14),
    };
  }

  // A parked-car spot: on a road edge, clear of intersections.
  function randomParkedSpot(rng2) {
    for (let tries = 0; tries < 20; tries += 1) {
      const vertical = rng2.chance(0.5);
      if (vertical) {
        const x = rng2.pick(avenues);
        const y = rng2.range(200, WORLD_H - 200);
        if (Math.abs(y - nearestOf(streets, y)) < 130) continue;
        const side = rng2.chance(0.5) ? 1 : -1;
        return { x: x + side * (ROAD_W / 2 - 18), y, angle: side > 0 ? Math.PI / 2 : -Math.PI / 2 };
      }
      const y = rng2.pick(streets);
      const x = rng2.range(200, WORLD_W - 500);
      if (Math.abs(x - nearestOf(avenues, x)) < 130) continue;
      const side = rng2.chance(0.5) ? 1 : -1;
      return { x, y: y + side * (ROAD_W / 2 - 18), angle: side > 0 ? 0 : Math.PI };
    }
    return { x: 300, y: 900, angle: 0 };
  }

  function nearestIntersection(x, y) {
    return { x: nearestOf(avenues, x), y: nearestOf(streets, y) };
  }

  function place(id) {
    return shops.find((s) => s.id === id) || shops[0];
  }

  return {
    avenues, streets, buildings, trees, park, pond, shops, packages,
    downtown: DOWNTOWN,
    isWater, isRoad, hitBuilding, pointInBuilding, resolveCircle,
    randomRoadPoint, randomSidewalkPoint, randomParkedSpot, nearestIntersection, place,
  };
}
