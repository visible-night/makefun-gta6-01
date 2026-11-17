// Drawing only: the sim and the current screen in, pixels out. The camera
// trails the hero across the city with trauma shake and a speed zoom, while
// the HUD, minimap and menus live in screen space.
import { COLORS, WORLD_W, WORLD_H, ROAD_W, WEAPONS, PLAYER, EVADE_SECONDS } from './config.js';
import { SAND_X0, WATER_X0, HARBOR_Y0 } from './city.js';
import { nextMission } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_HOWTO = 'howto';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Overshoot easing: rises past 1 and settles back, so pops feel alive.
function easeOutBack(t) {
  const c = 1.70158;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

export function createRenderer(canvas) {
  const g = canvas.getContext('2d');
  let W = 1280;
  let H = 720;
  let dpr = 1;
  let smoothSpeed = 0;
  const buttons = [];

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
  }
  resize();
  window.addEventListener('resize', resize);

  const fonts = new Map();
  function font(size, weight) {
    const key = `${weight || 400}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || 400} ${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, weight) {
    g.font = font(size, weight);
    g.fillStyle = color;
    g.textAlign = align || 'left';
    g.textBaseline = 'alphabetic';
    g.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function panel(x, y, w, h, alpha) {
    g.fillStyle = `rgba(12, 14, 22, ${alpha ?? 0.82})`;
    roundRect(x, y, w, h, 12);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 1;
    g.stroke();
  }

  // ---- The city ----
  function drawCity(sim) {
    const city = sim.city;
    const cam = sim.camera;
    const time = sim.time;
    const x0 = cam.x - W / 2 - 140;
    const x1 = cam.x + W / 2 + 140;
    const y0 = cam.y - H / 2 - 140;
    const y1 = cam.y + H / 2 + 140;

    // Ground and dry patches.
    g.fillStyle = COLORS.grass;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = COLORS.grassDry;
    for (let gx = 0; gx < WORLD_W; gx += 640) {
      for (let gy = 0; gy < WORLD_H; gy += 640) {
        const px = gx + ((gx * 7 + gy * 13) % 300);
        const py = gy + ((gx * 11 + gy * 5) % 260);
        if (px > x0 && px < x1 && py > y0 && py < y1) {
          g.beginPath();
          g.ellipse(px, py, 150, 90, 0.4, 0, TAU);
          g.fill();
        }
      }
    }
    // Park and pond.
    g.fillStyle = COLORS.park;
    g.fillRect(city.park.x0, city.park.y0, city.park.x1 - city.park.x0, city.park.y1 - city.park.y0);
    g.fillStyle = COLORS.water;
    g.beginPath();
    g.ellipse(city.pond.x, city.pond.y, city.pond.rx, city.pond.ry, 0, 0, TAU);
    g.fill();
    // Harbour ground, beach and sea.
    g.fillStyle = COLORS.harbor;
    g.fillRect(0, HARBOR_Y0, WORLD_W, WORLD_H - HARBOR_Y0);
    g.fillStyle = COLORS.sand;
    g.fillRect(SAND_X0, 0, WATER_X0 - SAND_X0, WORLD_H);
    g.fillStyle = COLORS.water;
    g.fillRect(WATER_X0, 0, WORLD_W - WATER_X0, WORLD_H);
    g.fillStyle = COLORS.waterDeep;
    g.fillRect(WATER_X0 + 60, 0, WORLD_W - WATER_X0 - 60, WORLD_H);
    // Rolling wave lines.
    g.strokeStyle = COLORS.waterLine;
    g.lineWidth = 2;
    g.globalAlpha = 0.7;
    for (let wy = 40; wy < WORLD_H; wy += 130) {
      const off = Math.sin(time * 0.8 + wy * 0.05) * 8;
      g.beginPath();
      g.moveTo(WATER_X0 + 14 + off, wy);
      g.lineTo(WATER_X0 + 90 + off, wy);
      g.stroke();
    }
    g.globalAlpha = 1;

    // Sidewalk blocks.
    g.fillStyle = COLORS.sidewalk;
    for (let i = 0; i < city.avenues.length - 1; i += 1) {
      for (let j = 0; j < city.streets.length - 1; j += 1) {
        const bx0 = city.avenues[i] + ROAD_W / 2;
        const bx1 = city.avenues[i + 1] - ROAD_W / 2;
        const by0 = city.streets[j] + ROAD_W / 2;
        const by1 = city.streets[j + 1] - ROAD_W / 2;
        if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) continue;
        g.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
      }
    }
    // Roads and their edges.
    g.fillStyle = COLORS.road;
    for (const ax of city.avenues) g.fillRect(ax - ROAD_W / 2, 0, ROAD_W, WORLD_H);
    for (const st of city.streets) g.fillRect(0, st - ROAD_W / 2, WORLD_W, ROAD_W);
    g.strokeStyle = COLORS.roadEdge;
    g.lineWidth = 3;
    for (const ax of city.avenues) {
      g.beginPath();
      g.moveTo(ax - ROAD_W / 2, 0);
      g.lineTo(ax - ROAD_W / 2, WORLD_H);
      g.moveTo(ax + ROAD_W / 2, 0);
      g.lineTo(ax + ROAD_W / 2, WORLD_H);
      g.stroke();
    }
    for (const st of city.streets) {
      g.beginPath();
      g.moveTo(0, st - ROAD_W / 2);
      g.lineTo(WORLD_W, st - ROAD_W / 2);
      g.moveTo(0, st + ROAD_W / 2);
      g.lineTo(WORLD_W, st + ROAD_W / 2);
      g.stroke();
    }
    // Lane dashes.
    g.strokeStyle = COLORS.laneDash;
    g.lineWidth = 3;
    g.setLineDash([26, 34]);
    for (const ax of city.avenues) {
      if (ax < x0 || ax > x1) continue;
      g.beginPath();
      g.moveTo(ax, Math.max(0, y0));
      g.lineTo(ax, Math.min(WORLD_H, y1));
      g.stroke();
    }
    for (const st of city.streets) {
      if (st < y0 || st > y1) continue;
      g.beginPath();
      g.moveTo(Math.max(0, x0), st);
      g.lineTo(Math.min(WORLD_W, x1), st);
      g.stroke();
    }
    g.setLineDash([]);
    // Zebra crossings: a band of stripes on each approach to every intersection.
    g.fillStyle = 'rgba(240,240,235,0.6)';
    for (const ax of city.avenues) {
      for (const st of city.streets) {
        if (ax < x0 - 90 || ax > x1 + 90 || st < y0 - 90 || st > y1 + 90) continue;
        for (let k = 0; k < 6; k += 1) {
          const off = -40 + k * 16;
          g.fillRect(ax + off, st - ROAD_W / 2 - 22, 8, 18);
          g.fillRect(ax + off, st + ROAD_W / 2 + 4, 8, 18);
          g.fillRect(ax - ROAD_W / 2 - 22, st + off, 18, 8);
          g.fillRect(ax + ROAD_W / 2 + 4, st + off, 18, 8);
        }
      }
    }

    // Buildings: shadow, roof, detail.
    for (const blk of city.buildings) {
      if (blk.x + blk.w < x0 || blk.x > x1 || blk.y + blk.h < y0 || blk.y > y1) continue;
      const sh = blk.hgt * 0.35;
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(blk.x + sh, blk.y + sh, blk.w, blk.h);
      g.fillStyle = blk.color;
      g.fillRect(blk.x, blk.y, blk.w, blk.h);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(blk.x + 4, blk.y + 4, blk.w - 8, 10);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(blk.x + 4, blk.y + blk.h - 12, blk.w - 8, 8);
      if (blk.glass) {
        g.fillStyle = 'rgba(255,255,255,0.20)';
        for (let gx = blk.x + 12; gx < blk.x + blk.w - 8; gx += 22) g.fillRect(gx, blk.y + 8, 5, blk.h - 16);
      } else if (!blk.container) {
        g.fillStyle = 'rgba(0,0,0,0.22)';
        const n = 1 + Math.floor(blk.seed * 3);
        for (let k = 0; k < n; k += 1) {
          g.fillRect(blk.x + 10 + blk.seed * 40 + k * 26, blk.y + 12 + ((blk.seed * 97 + k * 31) % (blk.h - 30)), 12, 9);
        }
      }
    }

    // Trees.
    for (const tree of city.trees) {
      if (tree.x < x0 || tree.x > x1 || tree.y < y0 || tree.y > y1) continue;
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath();
      g.ellipse(tree.x + 5, tree.y + 6, tree.r, tree.r * 0.7, 0, 0, TAU);
      g.fill();
      if (tree.palm) {
        g.strokeStyle = '#7a5a34';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(tree.x, tree.y);
        g.lineTo(tree.x + 3, tree.y - 4);
        g.stroke();
        g.strokeStyle = COLORS.tree;
        g.lineWidth = 2.5;
        for (let f = 0; f < 6; f += 1) {
          const a = (f / 6) * TAU + tree.shade;
          g.beginPath();
          g.moveTo(tree.x, tree.y - 4);
          g.lineTo(tree.x + Math.cos(a) * tree.r * 1.3, tree.y - 4 + Math.sin(a) * tree.r * 1.3);
          g.stroke();
        }
      } else {
        g.fillStyle = tree.shade > 0.5 ? COLORS.tree : COLORS.treeDark;
        g.beginPath();
        g.arc(tree.x, tree.y, tree.r, 0, TAU);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.14)';
        g.beginPath();
        g.arc(tree.x - tree.r * 0.3, tree.y - tree.r * 0.3, tree.r * 0.45, 0, TAU);
        g.fill();
      }
    }
  }

  function drawShops(sim) {
    const city = sim.city;
    const cam = sim.camera;
    for (const shop of city.shops) {
      if (Math.abs(shop.x - cam.x) > W / 2 + 80 || Math.abs(shop.y - cam.y) > H / 2 + 80) continue;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.arc(shop.x, shop.y + 3, 17, 0, TAU);
      g.fill();
      g.fillStyle = shop.color;
      g.beginPath();
      g.arc(shop.x, shop.y, 15, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 2;
      g.stroke();
      text(shop.letter, shop.x, shop.y + 5, 14, '#1c1c22', 'center', 800);
      g.font = font(11, 700);
      const w = g.measureText(shop.name).width;
      g.fillStyle = 'rgba(255,255,255,0.75)';
      roundRect(shop.x - w / 2 - 5, shop.y + 19, w + 10, 17, 5);
      g.fill();
      text(shop.name, shop.x, shop.y + 31, 11, '#1c1c22', 'center', 700);
    }
  }

  function drawMarker(x, y, color, pulse, letter) {
    const r = 26 + Math.sin(pulse * 4) * 4;
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.arc(x, y, r + 10, 0, TAU);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 3;
    g.stroke();
    if (letter) text(letter, x, y + 8, 22, '#1c1c22', 'center', 800);
    // Light beam so the marker is visible from afar.
    const grad = g.createLinearGradient(0, y - 220, 0, y);
    grad.addColorStop(0, 'rgba(255,220,80,0)');
    grad.addColorStop(1, 'rgba(255,220,80,0.35)');
    g.fillStyle = grad;
    g.fillRect(x - 7, y - 220, 14, 220);
  }

  function drawCar(car, time) {
    const { w: cw, h: ch } = car.spec;
    g.save();
    g.translate(car.x, car.y);
    g.rotate(car.angle + (car.lean || 0));
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(3, 4, cw / 2, ch / 2 + 2, 0, 0, TAU);
    g.fill();
    // Wheels.
    g.fillStyle = '#1a1a1e';
    const ww = 10;
    const wh = 5;
    g.fillRect(-cw / 2 + 4, -ch / 2 - 2, ww, wh);
    g.fillRect(cw / 2 - 14, -ch / 2 - 2, ww, wh);
    g.fillRect(-cw / 2 + 4, ch / 2 - 3, ww, wh);
    g.fillRect(cw / 2 - 14, ch / 2 - 3, ww, wh);
    // Body.
    g.fillStyle = car.wreck ? '#3a3a3e' : car.color;
    roundRect(-cw / 2, -ch / 2, cw, ch, 7);
    g.fill();
    if (car.police && !car.wreck) {
      g.fillStyle = '#2e4a8a';
      g.fillRect(-cw / 2 + 4, -ch / 2 + 2, cw - 8, 5);
      g.fillRect(-cw / 2 + 4, ch / 2 - 7, cw - 8, 5);
      text('POLICE', 0, 3, 7, '#1c1c22', 'center', 800);
    }
    if (car.type === 'taxi' && !car.wreck) {
      g.fillStyle = '#1c1c22';
      for (let cx = -cw / 2 + 8; cx < cw / 2 - 8; cx += 8) g.fillRect(cx, -2, 4, 4);
      g.fillStyle = '#fff8d6';
      roundRect(-8, -ch / 2 - 1, 16, 5, 2);
      g.fill();
    }
    // Windows and roof.
    g.fillStyle = car.wreck ? '#222226' : '#20242e';
    roundRect(-cw / 2 + 8, -ch / 2 + 3, 12, ch - 6, 3);
    g.fill();
    roundRect(cw / 2 - 20, -ch / 2 + 3, 12, ch - 6, 3);
    g.fill();
    g.fillStyle = car.wreck ? '#2c2c30' : 'rgba(255,255,255,0.22)';
    roundRect(-cw / 2 + 20, -ch / 2 + 3, cw - 40, ch - 6, 3);
    g.fill();
    // Headlights, taillights and reverse lights.
    g.fillStyle = '#fff6c9';
    g.fillRect(cw / 2 - 2, -ch / 2 + 2, 3, 4);
    g.fillRect(cw / 2 - 2, ch / 2 - 6, 3, 4);
    g.fillStyle = car.brake ? '#ff2e2e' : '#a82e2e';
    g.fillRect(-cw / 2 - 1, -ch / 2 + 2, 3, 4);
    g.fillRect(-cw / 2 - 1, ch / 2 - 6, 3, 4);
    if (car.reversing) {
      g.fillStyle = '#e8f4ff';
      g.fillRect(-cw / 2 - 1, -2, 3, 4);
    }
    g.restore();
    // Police light bar, flashing.
    if (car.police && !car.wreck) {
      const phase = Math.sin(time * 10 + car.sirenPhase) > 0;
      g.fillStyle = phase ? '#ff3b30' : '#3b82ff';
      g.beginPath();
      g.arc(car.x - 4, car.y, 7, 0, TAU);
      g.fill();
      g.fillStyle = phase ? '#3b82ff' : '#ff3b30';
      g.beginPath();
      g.arc(car.x + 4, car.y, 7, 0, TAU);
      g.fill();
      g.fillStyle = phase ? 'rgba(255,59,48,0.25)' : 'rgba(59,130,255,0.25)';
      g.beginPath();
      g.arc(car.x, car.y, 46, 0, TAU);
      g.fill();
    }
    if (car.criminal && !car.wreck) {
      g.strokeStyle = '#ff3b30';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(car.x, car.y, 30 + Math.sin(time * 5) * 3, 0, TAU);
      g.stroke();
    }
  }

  function drawPerson(x, y, angle, shirt, pants, skin, walkPhase, moving, opts) {
    const opt = opts || {};
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(x + 2, y + 3, 10, 7, 0, 0, TAU);
    g.fill();
    if (opt.dead) {
      g.fillStyle = 'rgba(140,20,20,0.5)';
      g.beginPath();
      g.ellipse(x, y, 15, 10, angle, 0, TAU);
      g.fill();
      g.fillStyle = shirt;
      g.beginPath();
      g.ellipse(x, y, 12, 7, angle, 0, TAU);
      g.fill();
      g.fillStyle = skin;
      g.beginPath();
      g.arc(x + Math.cos(angle) * 11, y + Math.sin(angle) * 11, 5, 0, TAU);
      g.fill();
      return;
    }
    const bob = moving ? Math.sin(walkPhase) * 1.5 : 0;
    // Legs.
    g.fillStyle = pants;
    const perpX = Math.cos(angle + Math.PI / 2);
    const perpY = Math.sin(angle + Math.PI / 2);
    g.beginPath();
    g.arc(x - perpX * 4 - Math.cos(angle) * bob, y - perpY * 4 - Math.sin(angle) * bob, 4, 0, TAU);
    g.arc(x + perpX * 4 + Math.cos(angle) * bob, y + perpY * 4 + Math.sin(angle) * bob, 4, 0, TAU);
    g.fill();
    // Body.
    g.fillStyle = shirt;
    g.beginPath();
    g.arc(x, y, 9, 0, TAU);
    g.fill();
    // Head, slightly toward the facing.
    g.fillStyle = skin;
    g.beginPath();
    g.arc(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3, 5.5, 0, TAU);
    g.fill();
    if (opt.cap) {
      g.fillStyle = '#1c2a4a';
      g.beginPath();
      g.arc(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3, 5.5, Math.PI, TAU);
      g.fill();
    }
    if (opt.gun) {
      g.strokeStyle = '#222226';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x + Math.cos(angle) * 8, y + Math.sin(angle) * 8);
      g.lineTo(x + Math.cos(angle) * 20, y + Math.sin(angle) * 20);
      g.stroke();
    }
  }

  function drawEntities(sim) {
    const cam = sim.camera;
    const time = sim.time;
    const juice = sim.juice;
    const inView = (x, y, m) => Math.abs(x - cam.x) < W / 2 + (m || 60) && Math.abs(y - cam.y) < H / 2 + (m || 60);

    // Skid marks sit under everything else on the road.
    if (juice) {
      g.lineCap = 'round';
      for (const mark of juice.skids) {
        if (!inView(mark.x, mark.y, 30)) continue;
        g.strokeStyle = `rgba(20,20,24,${0.5 * (mark.life / 6)})`;
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(mark.x - Math.cos(mark.angle) * 13, mark.y - Math.sin(mark.angle) * 13);
        g.lineTo(mark.x + Math.cos(mark.angle) * 13, mark.y + Math.sin(mark.angle) * 13);
        g.stroke();
      }
    }

    // Mission markers under everything else.
    if (sim.mission) {
      const obj = sim.missionObjective;
      if (obj && obj.target) drawMarker(obj.target.x, obj.target.y, '#ffd93b', time, null);
    } else if (sim.missionOffer) {
      const next = sim.missionOffer;
      const start = sim.city.place(next.start.place);
      drawMarker(start.x, start.y, '#ffd93b', time, '!');
    } else if (sim.nextMissionStart) {
      drawMarker(sim.nextMissionStart.x, sim.nextMissionStart.y, '#ffd93b', time, '!');
    }
    if (sim.taxi && sim.taxi.active) drawMarker(sim.taxi.x, sim.taxi.y, '#e8c832', time + 1, 'T');
    if (sim.vigilante && sim.vigilante.target && !sim.vigilante.target.wreck) {
      const t = sim.vigilante.target;
      drawMarker(t.x, t.y, '#ff3b30', time + 2, null);
    }

    // Hidden packages.
    for (const pkg of sim.city.packages) {
      if (pkg.taken || !inView(pkg.x, pkg.y, 40)) continue;
      const pulse = 1 + Math.sin(time * 4 + pkg.x) * 0.25;
      g.fillStyle = 'rgba(255,154,217,0.3)';
      g.beginPath();
      g.arc(pkg.x, pkg.y, 18 * pulse, 0, TAU);
      g.fill();
      g.fillStyle = '#ff9ad9';
      g.save();
      g.translate(pkg.x, pkg.y);
      g.rotate(Math.PI / 4);
      g.fillRect(-6 * pulse, -6 * pulse, 12 * pulse, 12 * pulse);
      g.restore();
    }

    // Pickups.
    for (const pk of sim.pickups) {
      if (pk.respawn > 0 || !inView(pk.x, pk.y, 40)) continue;
      const bobY = pk.y + Math.sin(time * 3 + pk.x) * 3;
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.arc(pk.x, bobY, 16, 0, TAU);
      g.fill();
      if (pk.kind === 'health') {
        g.fillStyle = '#ffffff';
        g.fillRect(pk.x - 9, bobY - 9, 18, 18);
        g.fillStyle = '#d92e2e';
        g.fillRect(pk.x - 2.5, bobY - 6, 5, 12);
        g.fillRect(pk.x - 6, bobY - 2.5, 12, 5);
      } else if (pk.kind === 'armor') {
        g.fillStyle = '#6ea8ff';
        g.beginPath();
        g.arc(pk.x, bobY, 10, 0, TAU);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(pk.x, bobY, 5, 0, TAU);
        g.fill();
      } else if (pk.kind === 'cash') {
        g.fillStyle = '#57d977';
        g.fillRect(pk.x - 10, bobY - 6, 20, 12);
        text('$', pk.x, bobY + 4, 12, '#0c4a1e', 'center', 800);
      } else if (pk.kind === 'smg') {
        g.fillStyle = '#222226';
        g.fillRect(pk.x - 11, bobY - 3, 22, 6);
        g.fillRect(pk.x + 2, bobY + 3, 4, 7);
        g.fillStyle = '#ffd76e';
        g.fillRect(pk.x - 11, bobY - 1, 6, 2);
      }
    }

    // Pedestrians.
    for (const ped of sim.peds) {
      if (!inView(ped.x, ped.y, 40)) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.guard ? '#3a3a42' : ped.shirt, ped.pants, ped.skin,
        ped.walkPhase, ped.state !== 'wait', { dead: ped.state === 'dead', gun: ped.guard && ped.state !== 'dead' });
      if (ped.state === 'wait') text('!', ped.x, ped.y - 18, 18, '#ffd93b', 'center', 800);
    }
    // Cops.
    for (const cop of sim.cops) {
      if (!inView(cop.x, cop.y, 40)) continue;
      drawPerson(cop.x, cop.y, cop.angle, '#2e4a8a', '#1c2a4a', '#e8b88a', cop.walkPhase, true, { cap: true });
      if (cop.bustT > 0.15) {
        g.fillStyle = 'rgba(255,46,46,0.9)';
        g.fillRect(cop.x - 14, cop.y - 24, 28 * (cop.bustT / 0.9), 5);
      }
    }
    // Cars.
    for (const car of sim.cars) {
      if (!inView(car.x, car.y, 80)) continue;
      drawCar(car, time);
    }
    // The player.
    const hero = sim.player;
    if (hero && !hero.inCar) {
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(hero.x, hero.y, 16 + Math.sin(time * 3) * 1.5, 0, TAU);
      g.stroke();
      drawPerson(hero.x, hero.y, hero.angle, '#e84a3f', '#2e3a4f', '#f0c8a0', hero.walkPhase, hero.moving, { gun: true });
    }
    // Tracers.
    for (const beam of sim.tracers) {
      g.strokeStyle = beam.color;
      g.globalAlpha = clamp(beam.life / 0.07, 0, 1);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(beam.x0, beam.y0);
      g.lineTo(beam.x1, beam.y1);
      g.stroke();
    }
    g.globalAlpha = 1;
    // Muzzle flashes, additive.
    if (juice) {
      g.globalCompositeOperation = 'lighter';
      for (const spark of juice.flashes) {
        const k = clamp(spark.life / 0.06, 0, 1);
        g.fillStyle = `rgba(255,214,110,${0.9 * k})`;
        g.save();
        g.translate(spark.x, spark.y);
        g.rotate(spark.angle);
        g.beginPath();
        g.moveTo(spark.size, 0);
        g.lineTo(-spark.size * 0.4, spark.size * 0.35);
        g.lineTo(-spark.size * 0.15, 0);
        g.lineTo(-spark.size * 0.4, -spark.size * 0.35);
        g.closePath();
        g.fill();
        g.restore();
      }
      g.globalCompositeOperation = 'source-over';
      // Shockwave rings.
      for (const wave of juice.rings) {
        g.strokeStyle = wave.color;
        g.globalAlpha = clamp(wave.life / wave.maxLife, 0, 1) * 0.8;
        g.lineWidth = 3 + 3 * (wave.life / wave.maxLife);
        g.beginPath();
        g.arc(wave.x, wave.y, wave.r, 0, TAU);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    // Particles (the pool holds dead slots at life 0; skip them).
    for (const pt of sim.particles) {
      if (pt.life <= 0) continue;
      g.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      g.fillStyle = pt.color;
      g.beginPath();
      g.arc(pt.x, pt.y, pt.size, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    // Floating texts.
    for (const f of sim.floats) {
      g.globalAlpha = clamp(f.life, 0, 1);
      text(f.text, f.x, f.y, 17, f.color, 'center', 800);
    }
    g.globalAlpha = 1;
  }

  function drawNight(sim, night, dusk) {
    const cam = sim.camera;
    if (dusk) {
      g.fillStyle = 'rgba(255,110,40,0.10)';
      g.fillRect(cam.x - W / 2, cam.y - H / 2, W, H);
    }
    if (!night) return;
    g.fillStyle = 'rgba(8,10,38,0.34)';
    g.fillRect(cam.x - W / 2, cam.y - H / 2, W, H);
    // Headlight cones and streetlights punch through the dark.
    g.globalCompositeOperation = 'lighter';
    for (const car of sim.cars) {
      if (car.wreck) continue;
      const moving = Math.hypot(car.vx, car.vy) > 30 || car.driver === 'player';
      if (!moving) continue;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const grad = g.createRadialGradient(car.x + fx * 40, car.y + fy * 40, 6, car.x + fx * 40, car.y + fy * 40, 130);
      grad.addColorStop(0, 'rgba(255,240,170,0.20)');
      grad.addColorStop(1, 'rgba(255,240,170,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(car.x + fx * 20, car.y + fy * 20);
      g.lineTo(car.x + fx * 150 - fy * 42, car.y + fy * 150 + fx * 42);
      g.lineTo(car.x + fx * 150 + fy * 42, car.y + fy * 150 - fx * 42);
      g.closePath();
      g.fill();
    }
    for (const ax of sim.city.avenues) {
      for (const st of sim.city.streets) {
        if (Math.abs(ax - cam.x) > W / 2 || Math.abs(st - cam.y) > H / 2) continue;
        const grad = g.createRadialGradient(ax, st, 4, ax, st, 90);
        grad.addColorStop(0, 'rgba(255,220,140,0.16)');
        grad.addColorStop(1, 'rgba(255,220,140,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(ax, st, 90, 0, TAU);
        g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ---- HUD ----
  function wrapLines(str, maxChars) {
    const words = str.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > maxChars && line) {
        lines.push(line);
        line = w;
      } else {
        line = line ? line + ' ' + w : w;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function clockText(sim) {
    const h = Math.floor(sim.clock / 60) % 24;
    const m = Math.floor(sim.clock % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function drawMinimap(sim) {
    const size = 200;
    const mx = 16;
    const my = H - size - 16;
    const s = size / WORLD_W;
    const sy = size / WORLD_H;
    panel(mx - 4, my - 4, size + 8, size + 8, 0.75);
    g.save();
    g.beginPath();
    g.rect(mx, my, size, size);
    g.clip();
    g.fillStyle = COLORS.grass;
    g.fillRect(mx, my, size, size);
    g.fillStyle = COLORS.park;
    g.fillRect(mx + sim.city.park.x0 * s, my + sim.city.park.y0 * sy,
      (sim.city.park.x1 - sim.city.park.x0) * s, (sim.city.park.y1 - sim.city.park.y0) * sy);
    g.fillStyle = COLORS.sand;
    g.fillRect(mx + SAND_X0 * s, my, (WATER_X0 - SAND_X0) * s, size);
    g.fillStyle = COLORS.water;
    g.fillRect(mx + WATER_X0 * s, my, (WORLD_W - WATER_X0) * s, size);
    g.strokeStyle = COLORS.road;
    g.lineWidth = 2.5;
    for (const ax of sim.city.avenues) {
      g.beginPath();
      g.moveTo(mx + ax * s, my);
      g.lineTo(mx + ax * s, my + size);
      g.stroke();
    }
    for (const st of sim.city.streets) {
      g.beginPath();
      g.moveTo(mx, my + st * sy);
      g.lineTo(mx + size, my + st * sy);
      g.stroke();
    }
    // Shops.
    for (const shop of sim.city.shops) {
      g.fillStyle = shop.color;
      g.beginPath();
      g.arc(mx + shop.x * s, my + shop.y * sy, 3, 0, TAU);
      g.fill();
    }
    // Packages.
    g.fillStyle = '#ff9ad9';
    for (const pkg of sim.city.packages) {
      if (!pkg.taken) g.fillRect(mx + pkg.x * s - 1, my + pkg.y * sy - 1, 2.5, 2.5);
    }
    // Mission target.
    const obj = sim.missionObjective;
    if (obj && obj.target) {
      const pulse = 4 + Math.sin(sim.time * 5) * 1.5;
      g.fillStyle = '#ffd93b';
      g.beginPath();
      g.arc(mx + obj.target.x * s, my + obj.target.y * sy, pulse, 0, TAU);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 1;
      g.stroke();
    }
    if (sim.nextMissionStart) {
      g.fillStyle = '#ffd93b';
      g.beginPath();
      g.arc(mx + sim.nextMissionStart.x * s, my + sim.nextMissionStart.y * sy, 4, 0, TAU);
      g.fill();
    }
    if (sim.taxi && sim.taxi.active) {
      g.fillStyle = '#e8c832';
      g.beginPath();
      g.arc(mx + sim.taxi.x * s, my + sim.taxi.y * sy, 4, 0, TAU);
      g.fill();
    }
    if (sim.vigilante && sim.vigilante.target && !sim.vigilante.target.wreck) {
      g.fillStyle = '#ff3b30';
      g.beginPath();
      g.arc(mx + sim.vigilante.target.x * s, my + sim.vigilante.target.y * sy, 4, 0, TAU);
      g.fill();
    }
    // Police.
    g.fillStyle = '#5b9bff';
    for (const cop of sim.cops) {
      if (!cop.leaving) g.fillRect(mx + cop.x * s - 1.5, my + cop.y * sy - 1.5, 3, 3);
    }
    for (const car of sim.cars) {
      if (car.driver === 'police' && !car.wreck) {
        g.fillRect(mx + car.x * s - 2, my + car.y * sy - 2, 4, 4);
      }
    }
    // The player: a white arrow that turns with them.
    const hero = sim.player;
    const hx = hero.inCar ? hero.inCar.x : hero.x;
    const hy = hero.inCar ? hero.inCar.y : hero.y;
    const ha = hero.inCar ? hero.inCar.angle : hero.angle;
    g.save();
    g.translate(mx + hx * s, my + hy * sy);
    g.rotate(ha);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#1c1c22';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(7, 0);
    g.lineTo(-5, -5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.restore();
    text('SOLMAR', mx + 8, my - 8, 11, 'rgba(255,255,255,0.85)', 'left', 800);
    text('N', mx + size - 4, my - 8, 11, 'rgba(255,255,255,0.85)', 'right', 800);
  }

  // Streaks at the screen edge while the player flies down a road.
  function drawSpeedLines(sim) {
    const hero = sim.player;
    if (!hero || !hero.inCar) return;
    const speed01 = clamp((Math.abs(hero.inCar.speed) - 430) / 320, 0, 1);
    if (speed01 <= 0) return;
    const cx = W / 2;
    const cy = H / 2;
    g.strokeStyle = `rgba(255,255,255,${0.28 * speed01})`;
    g.lineWidth = 2;
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TAU + sim.time * 0.4;
      const r0 = Math.min(W, H) * 0.34 + ((i * 53) % 60);
      const r1 = r0 + 40 + speed01 * 60;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.stroke();
    }
  }

  function drawVignette(sim) {
    const juice = sim.juice;
    const hero = sim.player;
    let red = 0;
    if (juice && juice.redT > 0) red = Math.max(red, (juice.redT / juice.redMax) * 0.3);
    if (hero && hero.hp > 0 && hero.hp < 35) red = Math.max(red, 0.16 + 0.1 * Math.sin(sim.time * 4));
    if (red > 0) {
      const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
      grad.addColorStop(0, 'rgba(255,30,30,0)');
      grad.addColorStop(1, `rgba(255,30,30,${red})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
    if (juice && juice.flashT > 0) {
      g.fillStyle = juice.flashColor;
      g.globalAlpha = clamp(juice.flashT / juice.flashMax, 0, 1) * 0.45;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
  }

  function drawHud(sim, ui) {
    const hero = sim.player;
    // Objective panel, top-left.
    const obj = sim.missionObjective;
    if (obj) {
      const lines = wrapLines(obj.text, 44);
      const ph = 44 + lines.length * 20;
      panel(16, 16, 360, ph, 0.78);
      text(obj.title.toUpperCase(), 32, 42, 15, '#ffd93b', 'left', 800);
      lines.forEach((line, i) => text(line, 32, 66 + i * 20, 15, '#ffffff', 'left', 500));
    } else {
      panel(16, 16, 360, 64, 0.6);
      text(sim.storyDone ? 'SOLMAR IS YOURS' : 'FREE ROAM', 32, 42, 15, '#ffd93b', 'left', 800);
      text(`Missions ${sim.doneMissions.length}/6  ·  Packages ${sim.stats.packages}/20`, 32, 62, 14, '#dddddd', 'left', 500);
    }
    // Money, clock and wanted stars, top-right. The stars pop when one is gained.
    const money = `$${hero.money.toLocaleString('en-US')}`;
    text(money, W - 20, 48, 30, '#57d977', 'right', 800);
    const h = Math.floor(sim.clock / 60) % 24;
    const icon = h < 6 || h >= 20 ? '☾' : h >= 17 ? '◐' : '☀';
    text(`${icon} ${clockText(sim)}`, W - 20, 74, 16, 'rgba(255,255,255,0.9)', 'right', 600);
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < sim.wanted ? '★' : '☆';
    const age = sim.time - sim.starPulseT;
    const pulse = age < 0.6 ? 1 + 0.45 * easeOutBack(1 - age / 0.6) : 1;
    text(stars, W - 20, 104, Math.round(26 * pulse), sim.wanted > 0 ? '#ffd93b' : 'rgba(255,255,255,0.35)', 'right', 800);
    if (sim.wanted > 0 && sim.evade > 0) {
      text('Losing them…', W - 20, 130, 14, '#9fe8ff', 'right', 600);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(W - 140, 138, 120, 6);
      g.fillStyle = '#9fe8ff';
      g.fillRect(W - 140, 138, 120 * (sim.evade / EVADE_SECONDS), 6);
    }
    // Centre message and banner.
    if (sim.message) {
      const alpha = clamp(sim.message.t, 0, 1);
      g.globalAlpha = alpha;
      g.font = font(18, 700);
      const w = g.measureText(sim.message.text).width;
      panel(W / 2 - w / 2 - 16, 16, w + 32, 36, 0.78);
      text(sim.message.text, W / 2, 41, 18, '#ffffff', 'center', 700);
      g.globalAlpha = 1;
    }
    if (sim.banner) {
      const alpha = clamp(sim.banner.t, 0, 1);
      const pop = sim.banner.t > 2.6 ? easeOutBack((3 - sim.banner.t) / 0.4) : 1;
      g.globalAlpha = alpha;
      text(sim.banner.title, W / 2, H * 0.3, Math.round(54 * pop), '#ffd93b', 'center', 900);
      if (sim.banner.sub) text(sim.banner.sub, W / 2, H * 0.3 + 34, 20, '#ffffff', 'center', 600);
      g.globalAlpha = 1;
    }
    // Cop grabbing warning.
    const grabbed = sim.cops.some((c) => c.bustT > 0.15);
    if (grabbed) {
      const flash = Math.sin(sim.time * 12) > 0;
      text('A COP IS GRABBING YOU — RUN!', W / 2, 110, 22, flash ? '#ff3b30' : '#ffffff', 'center', 900);
    }
    // Health, armour, weapon, speed — bottom-right.
    const bw = 230;
    const bx = W - bw - 20;
    const by = H - 88;
    panel(bx - 12, by - 12, bw + 24, 84, 0.7);
    text('HP', bx, by + 14, 13, '#ffffff', 'left', 800);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(bx + 30, by + 2, bw - 30, 13);
    g.fillStyle = hero.hp > 30 ? '#57d977' : '#ff3b30';
    g.fillRect(bx + 30, by + 2, (bw - 30) * (hero.hp / PLAYER.maxHp), 13);
    text('ARMOUR', bx, by + 36, 13, '#ffffff', 'left', 800);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(bx + 30, by + 24, bw - 30, 13);
    g.fillStyle = '#6ea8ff';
    g.fillRect(bx + 30, by + 24, (bw - 30) * (hero.armor / PLAYER.maxArmor), 13);
    if (hero.inCar) {
      smoothSpeed += (Math.abs(hero.inCar.speed) - smoothSpeed) * 0.15;
      const speed = Math.round(smoothSpeed * 0.2);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(bx + 30, by + 46, bw - 30, 6);
      g.fillStyle = hero.inCar.hp > 35 ? '#ffd93b' : '#ff3b30';
      g.fillRect(bx + 30, by + 46, (bw - 30) * (hero.inCar.hp / hero.inCar.maxHp), 6);
      text(`${hero.inCar.spec.name}  ·  ${speed} km/h`, bx, by + 70, 14, '#ffffff', 'left', 700);
    } else {
      smoothSpeed = 0;
      text(`${WEAPONS[hero.weapon].name}${hero.hasSmg ? '  ·  Q to switch' : ''}`, bx, by + 58, 14, '#ffffff', 'left', 700);
    }
    // Opening coach: one line at a time until the player is driving.
    if (sim.hint && !sim.overlay) {
      g.font = font(16, 700);
      const w = g.measureText(sim.hint).width + 56;
      panel(W / 2 - w / 2, H - 112, w, 38, 0.88);
      g.fillStyle = '#ffd93b';
      g.beginPath();
      g.arc(W / 2 - w / 2 + 22, H - 93, 11, 0, TAU);
      g.fill();
      text('!', W / 2 - w / 2 + 22, H - 88, 15, '#1c1c22', 'center', 900);
      text(sim.hint, W / 2 + 12, H - 88, 16, '#ffffff', 'center', 700);
    }
    // Prompt pill, bottom-centre.
    if (sim.prompt) {
      g.font = font(16, 700);
      const w = g.measureText(sim.prompt.text).width + 64;
      panel(W / 2 - w / 2, H - 64, w, 38, 0.85);
      g.fillStyle = '#ffd93b';
      roundRect(W / 2 - w / 2 + 10, H - 56, 22, 22, 5);
      g.fill();
      text('E', W / 2 - w / 2 + 21, H - 40, 15, '#1c1c22', 'center', 900);
      text(sim.prompt.text, W / 2 + 14, H - 40, 16, '#ffffff', 'center', 700);
    } else if (ui.showHint) {
      text('WASD move / drive  ·  Mouse aim, click shoot  ·  E enter car  ·  Shift run  ·  Space handbrake',
        W / 2, H - 24, 14, 'rgba(255,255,255,0.75)', 'center', 600);
    }
    if (sim.saveFlash > 0) text('✓ Saved', W - 20, H - 110, 14, '#57d977', 'right', 700);
    drawMinimap(sim);
    // Off-screen objective arrow.
    const target = obj && obj.target ? obj.target : sim.nextMissionStart;
    if (target) {
      const cam = sim.camera;
      const sx = target.x - cam.x + W / 2;
      const sy = target.y - cam.y + H / 2;
      if (sx < 30 || sx > W - 30 || sy < 30 || sy > H - 30) {
        let cx = clamp(sx, 46, W - 46);
        const cy = clamp(sy, 46, H - 46);
        if (cy < 140 && cx < 400) cx = 400;
        if (cy > H - 140 && cx > W - 300) cx = W - 300;
        const a = Math.atan2(sy - cy, sx - cx);
        g.save();
        g.translate(cx, cy);
        g.rotate(a);
        g.fillStyle = '#ffd93b';
        g.beginPath();
        g.moveTo(16, 0);
        g.lineTo(-8, -11);
        g.lineTo(-8, 11);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = 2;
        g.stroke();
        g.restore();
      }
    }
  }

  // ---- Menus and overlays ----
  function drawButton(id, x, y, w, h, label, selected, disabled) {
    buttons.push({ id, x, y, w, h, disabled: !!disabled });
    g.fillStyle = disabled ? 'rgba(255,255,255,0.08)' : selected ? '#ffd93b' : 'rgba(255,255,255,0.12)';
    roundRect(x, y, w, h, 10);
    g.fill();
    if (selected && !disabled) {
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.stroke();
    }
    text(label, x + w / 2, y + h / 2 + 7, 19, disabled ? 'rgba(255,255,255,0.4)' : selected ? '#1c1c22' : '#ffffff', 'center', 700);
  }

  function drawKeyChip(key, label, x, y) {
    g.font = font(13, 800);
    const kw = g.measureText(key).width + 16;
    g.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(x, y, kw, 24, 6);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    g.stroke();
    text(key, x + kw / 2, y + 17, 13, '#ffffff', 'center', 800);
    text(label, x + kw + 8, y + 17, 13, 'rgba(255,255,255,0.85)', 'left', 600);
    g.font = font(13, 600);
    return kw + 8 + g.measureText(label).width;
  }

  function drawTitle(sim, ui) {
    g.fillStyle = 'rgba(10,10,20,0.45)';
    g.fillRect(0, 0, W, H);
    const grad = g.createLinearGradient(0, H * 0.14, 0, H * 0.34);
    grad.addColorStop(0, '#ffd93b');
    grad.addColorStop(0.55, '#ff7a3c');
    grad.addColorStop(1, '#e84a8a');
    g.font = font(92, 900);
    g.fillStyle = grad;
    g.textAlign = 'center';
    g.fillText('SOLMAR', W / 2, H * 0.28);
    g.font = font(40, 900);
    g.fillStyle = '#ffffff';
    g.fillText('C I T Y', W / 2, H * 0.28 + 48);
    text('An open-world crime game — built by an AI agent', W / 2, H * 0.28 + 84, 17, 'rgba(255,255,255,0.85)', 'center', 600);
    const items = ui.menuItems;
    const bw = 340;
    const bh = 54;
    const gap = 14;
    const top = H * 0.28 + 116;
    items.forEach((item, i) => {
      drawButton(item.id, W / 2 - bw / 2, top + i * (bh + gap), bw, bh, item.label, ui.menuIndex === i, item.disabled);
    });
    // Controls, taught here so the first drive needs no manual.
    const keys = [
      ['WASD', 'move / drive'],
      ['Mouse', 'aim'],
      ['Click', 'shoot'],
      ['E', 'enter car'],
      ['Shift', 'run'],
      ['Space', 'handbrake'],
      ['P', 'pause'],
      ['M', 'mute'],
    ];
    const rows = [keys.slice(0, 4), keys.slice(4)];
    rows.forEach((row, ri) => {
      let total = 0;
      const widths = row.map(([k, l]) => {
        g.font = font(13, 800);
        const kw = g.measureText(k).width + 16;
        g.font = font(13, 600);
        const lw = g.measureText(l).width;
        total += kw + 8 + lw + 28;
        return kw + 8 + lw;
      });
      let x = W / 2 - (total - 28) / 2;
      const y = top + items.length * (bh + gap) + 26 + ri * 34;
      row.forEach(([k, l], i) => {
        drawKeyChip(k, l, x, y);
        x += widths[i] + 28;
      });
    });
    text('Steal cars, run missions, dodge the cops — and mind the sun.', W / 2, H - 28, 14, 'rgba(255,255,255,0.65)', 'center', 600);
  }

  function drawHowto(sim, ui) {
    g.fillStyle = 'rgba(10,10,20,0.6)';
    g.fillRect(0, 0, W, H);
    const w = 620;
    const h = 560;
    const x = W / 2 - w / 2;
    const y = H / 2 - h / 2;
    panel(x, y, w, h, 0.94);
    text('HOW TO PLAY', W / 2, y + 52, 30, '#ffd93b', 'center', 900);
    const rows = [
      ['Move / drive', 'W A S D or arrow keys'],
      ['Aim & shoot', 'Mouse, hold left click (on foot)'],
      ['Run', 'Hold Shift'],
      ['Handbrake', 'Space, while driving'],
      ['Enter / exit car', 'E — walk up to any car and take it'],
      ['Use / buy / save', 'E at a shop or the Safehouse'],
      ['Switch weapon', 'Q (once you own the SMG)'],
      ['Horn', 'H, while driving'],
      ['Pause / mute', 'P or Esc  ·  M'],
    ];
    rows.forEach((row, i) => {
      text(row[0], x + 48, y + 104 + i * 30, 16, '#ffffff', 'left', 700);
      text(row[1], x + 260, y + 104 + i * 30, 16, 'rgba(255,255,255,0.8)', 'left', 500);
    });
    const tips = wrapLines('Missions start at the yellow ! marker — drive there and press E. Wanted stars fall when no cop can see you, or clear them at the Spray & Go. Taxis pay fares, police cars open vigilante work, and 20 hidden packages are scattered around the city.', 68);
    tips.forEach((line, i) => text(line, W / 2, y + 392 + i * 22, 15, 'rgba(255,255,255,0.85)', 'center', 500));
    drawButton('back', W / 2 - 150, y + h - 70, 300, 50, 'Back', true, false);
  }

  function drawPaused(sim, ui) {
    g.fillStyle = 'rgba(10,10,20,0.55)';
    g.fillRect(0, 0, W, H);
    const w = 480;
    const h = 480;
    const x = W / 2 - w / 2;
    const y = H / 2 - h / 2;
    panel(x, y, w, h, 0.94);
    text('PAUSED', W / 2, y + 52, 30, '#ffffff', 'center', 900);
    const tally = sim.stats;
    const mins = Math.floor(tally.playTime / 60);
    const lines = [
      `Cash  $${sim.player.money.toLocaleString('en-US')}`,
      `Missions  ${sim.doneMissions.length}/6`,
      `Hidden packages  ${tally.packages}/20`,
      `Taxi fares  ${tally.fares}`,
      `Time in Solmar  ${mins}m`,
    ];
    lines.forEach((line, i) => text(line, W / 2, y + 96 + i * 28, 16, 'rgba(255,255,255,0.85)', 'center', 500));
    const items = ui.menuItems;
    const bw = 320;
    const bh = 50;
    const gap = 12;
    const top = y + 252;
    items.forEach((item, i) => {
      drawButton(item.id, W / 2 - bw / 2, top + i * (bh + gap), bw, bh, item.label, ui.menuIndex === i, item.disabled);
    });
  }

  function drawBriefing(sim) {
    const job = sim.overlayData.mission;
    g.fillStyle = 'rgba(10,10,20,0.55)';
    g.fillRect(0, 0, W, H);
    const w = 640;
    const lines = wrapLines(job.brief, 62);
    const h = 250 + lines.length * 24;
    const x = W / 2 - w / 2;
    const y = H / 2 - h / 2;
    panel(x, y, w, h, 0.95);
    // Giver portrait: a coloured circle with an initial.
    g.fillStyle = job.giverColor;
    g.beginPath();
    g.arc(x + 52, y + 58, 26, 0, TAU);
    g.fill();
    text(job.giver[0], x + 52, y + 67, 26, '#ffffff', 'center', 900);
    text(job.giver, x + 92, y + 52, 20, '#ffffff', 'left', 800);
    text(job.title, x + 92, y + 80, 24, '#ffd93b', 'left', 900);
    lines.forEach((line, i) => text(line, x + 52, y + 122 + i * 24, 16, 'rgba(255,255,255,0.9)', 'left', 500));
    text(`Reward  $${job.reward.toLocaleString('en-US')}`, x + 52, y + h - 58, 18, '#57d977', 'left', 800);
    text('Enter — accept   ·   Esc — decline', x + w - 52, y + h - 58, 16, 'rgba(255,255,255,0.7)', 'right', 600);
  }

  function drawBigOverlay(title, titleColor, lines, prompt) {
    g.fillStyle = 'rgba(10,10,20,0.6)';
    g.fillRect(0, 0, W, H);
    text(title, W / 2, H / 2 - 60, 72, titleColor, 'center', 900);
    lines.forEach((line, i) => text(line, W / 2, H / 2 + 6 + i * 30, 20, '#ffffff', 'center', 600));
    const flash = Math.sin(Date.now() / 300) > -0.4;
    if (flash) text(prompt, W / 2, H / 2 + 110, 18, '#ffd93b', 'center', 700);
  }

  function drawOverlay(sim) {
    const ov = sim.overlay;
    if (!ov) return;
    if (ov === 'briefing') {
      drawBriefing(sim);
      return;
    }
    if (ov === 'busted') {
      const data = sim.overlayData || {};
      const lines = [`The cops caught you. Fine: $${(data.fine || 0).toLocaleString('en-US')}.`];
      if (data.failedMission) lines.push(`Mission failed: ${data.failedMission}.`);
      lines.push('You wake up at Central Precinct.');
      drawBigOverlay('BUSTED', '#5b9bff', lines, 'Press Enter to continue');
      return;
    }
    if (ov === 'wasted') {
      const data = sim.overlayData || {};
      const lines = [`Hospital bill: $${(data.bill || 0).toLocaleString('en-US')}.`];
      if (data.failedMission) lines.push(`Mission failed: ${data.failedMission}.`);
      lines.push('You wake up at Solmar General.');
      drawBigOverlay('WASTED', '#ff3b30', lines, 'Press Enter to continue');
      return;
    }
    if (ov === 'done') {
      const data = sim.overlayData || {};
      drawBigOverlay('MISSION PASSED', '#57d977',
        [data.title || '', `+$${(data.reward || 0).toLocaleString('en-US')}`], 'Press Enter to keep playing');
      return;
    }
    if (ov === 'fail') {
      const data = sim.overlayData || {};
      drawBigOverlay('MISSION FAILED', '#ff3b30',
        [data.title || '', data.reason || '', 'Drive back to the yellow ! to try again.'], 'Press Enter to continue');
      return;
    }
    if (ov === 'complete') {
      const data = sim.overlayData || {};
      drawBigOverlay('YOU OWN SOLMAR CITY', '#ffd93b',
        [`Final score: ${data.title || ''} — +$${(data.reward || 0).toLocaleString('en-US')}`,
          'Every mission done. The city is yours — keep driving.'],
        'Press Enter to keep playing');
    }
  }

  // Paint one frame. `world` is the world object (for the objective); `ui` carries
  // the menu state main.js owns.
  function draw(world, screen, ui) {
    const sim = world.state;
    buttons.length = 0;
    sim.missionObjective = world.currentObjective();
    const nm = nextMission(sim.doneMissions);
    sim.nextMissionStart = (!sim.mission && nm && !sim.missionOffer)
      ? { x: sim.city.place(nm.start.place).x, y: sim.city.place(nm.start.place).y }
      : null;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0c0e16';
    g.fillRect(0, 0, W, H);

    // Camera, clamped so it never looks past the map edge, then shake and zoom.
    const camX = W >= WORLD_W ? WORLD_W / 2 : clamp(sim.camera.x, W / 2, WORLD_W - W / 2);
    const camY = H >= WORLD_H ? WORLD_H / 2 : clamp(sim.camera.y, H / 2, WORLD_H - H / 2);
    const juice = sim.juice;
    const shakeX = juice ? juice.shakeX : 0;
    const shakeY = juice ? juice.shakeY : 0;
    const zoom = (sim.zoom || 1) + (juice ? juice.zoomPunch : 0);
    const shownCam = { x: camX, y: camY };
    const trueCam = sim.camera;
    sim.camera = shownCam;
    g.save();
    g.translate(W / 2, H / 2);
    g.scale(zoom, zoom);
    g.translate(-W / 2, -H / 2);
    g.translate(W / 2 - camX + shakeX, H / 2 - camY + shakeY);
    drawCity(sim);
    drawShops(sim);
    drawEntities(sim);
    drawNight(sim, world.isNight(), world.isDusk());
    g.restore();
    sim.camera = trueCam;

    drawSpeedLines(sim);
    if (screen === SCREEN_TITLE) drawTitle(sim, ui);
    else if (screen === SCREEN_HOWTO) drawHowto(sim, ui);
    else if (screen === SCREEN_PAUSED) {
      drawHud(sim, ui);
      drawPaused(sim, ui);
    } else {
      drawHud(sim, ui);
      drawOverlay(sim);
    }
    drawVignette(sim);
  }

  return {
    draw,
    buttons,
    resize,
    get w() { return W; },
    get h() { return H; },
  };
}
