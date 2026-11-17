// Drawing only: the world's state and the current screen in, pixels out. The camera
// follows the player over the city; the HUD, minimap and menus are screen space.
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

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 1280;
  let H = 720;
  let dpr = 1;
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
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(x, y, w, h, alpha) {
    ctx.fillStyle = `rgba(12, 14, 22, ${alpha ?? 0.82})`;
    roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ---- The city ----
  function drawCity(state) {
    const city = state.city;
    const cam = state.camera;
    const time = state.time;
    const x0 = cam.x - W / 2 - 120;
    const x1 = cam.x + W / 2 + 120;
    const y0 = cam.y - H / 2 - 120;
    const y1 = cam.y + H / 2 + 120;

    // Ground.
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Dry patches for texture.
    ctx.fillStyle = COLORS.grassDry;
    for (let gx = 0; gx < WORLD_W; gx += 640) {
      for (let gy = 0; gy < WORLD_H; gy += 640) {
        const px = gx + ((gx * 7 + gy * 13) % 300);
        const py = gy + ((gx * 11 + gy * 5) % 260);
        if (px > x0 && px < x1 && py > y0 && py < y1) {
          ctx.beginPath();
          ctx.ellipse(px, py, 150, 90, 0.4, 0, TAU);
          ctx.fill();
        }
      }
    }
    // Park.
    ctx.fillStyle = COLORS.park;
    ctx.fillRect(city.park.x0, city.park.y0, city.park.x1 - city.park.x0, city.park.y1 - city.park.y0);
    // Pond.
    ctx.fillStyle = COLORS.water;
    ctx.beginPath();
    ctx.ellipse(city.pond.x, city.pond.y, city.pond.rx, city.pond.ry, 0, 0, TAU);
    ctx.fill();
    // Harbour ground.
    ctx.fillStyle = COLORS.harbor;
    ctx.fillRect(0, HARBOR_Y0, WORLD_W, WORLD_H - HARBOR_Y0);
    // Beach and sea.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(SAND_X0, 0, WATER_X0 - SAND_X0, WORLD_H);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(WATER_X0, 0, WORLD_W - WATER_X0, WORLD_H);
    ctx.fillStyle = COLORS.waterDeep;
    ctx.fillRect(WATER_X0 + 60, 0, WORLD_W - WATER_X0 - 60, WORLD_H);
    // Rolling wave lines.
    ctx.strokeStyle = COLORS.waterLine;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    for (let wy = 40; wy < WORLD_H; wy += 130) {
      const off = Math.sin(time * 0.8 + wy * 0.05) * 8;
      ctx.beginPath();
      ctx.moveTo(WATER_X0 + 14 + off, wy);
      ctx.lineTo(WATER_X0 + 90 + off, wy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Sidewalk blocks, then their inner lots.
    ctx.fillStyle = COLORS.sidewalk;
    for (let i = 0; i < city.avenues.length - 1; i += 1) {
      for (let j = 0; j < city.streets.length - 1; j += 1) {
        const bx0 = city.avenues[i] + ROAD_W / 2;
        const bx1 = city.avenues[i + 1] - ROAD_W / 2;
        const by0 = city.streets[j] + ROAD_W / 2;
        const by1 = city.streets[j + 1] - ROAD_W / 2;
        if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) continue;
        ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
      }
    }
    // Roads.
    ctx.fillStyle = COLORS.road;
    for (const ax of city.avenues) ctx.fillRect(ax - ROAD_W / 2, 0, ROAD_W, WORLD_H);
    for (const st of city.streets) ctx.fillRect(0, st - ROAD_W / 2, WORLD_W, ROAD_W);
    // Road edges.
    ctx.strokeStyle = COLORS.roadEdge;
    ctx.lineWidth = 3;
    for (const ax of city.avenues) {
      ctx.beginPath();
      ctx.moveTo(ax - ROAD_W / 2, 0);
      ctx.lineTo(ax - ROAD_W / 2, WORLD_H);
      ctx.moveTo(ax + ROAD_W / 2, 0);
      ctx.lineTo(ax + ROAD_W / 2, WORLD_H);
      ctx.stroke();
    }
    for (const st of city.streets) {
      ctx.beginPath();
      ctx.moveTo(0, st - ROAD_W / 2);
      ctx.lineTo(WORLD_W, st - ROAD_W / 2);
      ctx.moveTo(0, st + ROAD_W / 2);
      ctx.lineTo(WORLD_W, st + ROAD_W / 2);
      ctx.stroke();
    }
    // Lane dashes.
    ctx.strokeStyle = COLORS.laneDash;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 34]);
    for (const ax of city.avenues) {
      if (ax < x0 || ax > x1) continue;
      ctx.beginPath();
      ctx.moveTo(ax, Math.max(0, y0));
      ctx.lineTo(ax, Math.min(WORLD_H, y1));
      ctx.stroke();
    }
    for (const st of city.streets) {
      if (st < y0 || st > y1) continue;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, x0), st);
      ctx.lineTo(Math.min(WORLD_W, x1), st);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Crosswalks at intersections.
    ctx.fillStyle = 'rgba(240,240,235,0.75)';
    for (const ax of city.avenues) {
      for (const st of city.streets) {
        if (ax < x0 - 80 || ax > x1 + 80 || st < y0 - 80 || st > y1 + 80) continue;
        for (let k = -2; k <= 2; k += 1) {
          ctx.fillRect(ax - 40 + k * 18, st - ROAD_W / 2 - 12, 9, 24);
          ctx.fillRect(ax - ROAD_W / 2 - 12, st - 40 + k * 18, 24, 9);
        }
      }
    }

    // Buildings: shadow, roof, detail.
    for (const b of city.buildings) {
      if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
      const sh = b.hgt * 0.35;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x + sh, b.y + sh, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 4, b.y + b.h - 12, b.w - 8, 8);
      if (b.glass) {
        ctx.fillStyle = 'rgba(255,255,255,0.20)';
        for (let gx = b.x + 12; gx < b.x + b.w - 8; gx += 22) ctx.fillRect(gx, b.y + 8, 5, b.h - 16);
      } else if (!b.container) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        const n = 1 + Math.floor(b.seed * 3);
        for (let k = 0; k < n; k += 1) {
          ctx.fillRect(b.x + 10 + b.seed * 40 + k * 26, b.y + 12 + ((b.seed * 97 + k * 31) % (b.h - 30)), 12, 9);
        }
      }
    }

    // Trees.
    for (const t of city.trees) {
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(t.x + 5, t.y + 6, t.r, t.r * 0.7, 0, 0, TAU);
      ctx.fill();
      if (t.palm) {
        ctx.strokeStyle = '#7a5a34';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x + 3, t.y - 4);
        ctx.stroke();
        ctx.strokeStyle = COLORS.tree;
        ctx.lineWidth = 2.5;
        for (let f = 0; f < 6; f += 1) {
          const a = (f / 6) * TAU + t.shade;
          ctx.beginPath();
          ctx.moveTo(t.x, t.y - 4);
          ctx.lineTo(t.x + Math.cos(a) * t.r * 1.3, t.y - 4 + Math.sin(a) * t.r * 1.3);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = t.shade > 0.5 ? COLORS.tree : COLORS.treeDark;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath();
        ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.45, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawShops(state) {
    const city = state.city;
    const cam = state.camera;
    for (const s of city.shops) {
      if (Math.abs(s.x - cam.x) > W / 2 + 80 || Math.abs(s.y - cam.y) > H / 2 + 80) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(s.x, s.y + 3, 17, 0, TAU);
      ctx.fill();
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 15, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      text(s.letter, s.x, s.y + 5, 14, '#1c1c22', 'center', 800);
      ctx.font = font(11, 700);
      ctx.fillStyle = 'rgba(20,20,26,0.85)';
      const w = ctx.measureText(s.name).width;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      roundRect(s.x - w / 2 - 5, s.y + 19, w + 10, 17, 5);
      ctx.fill();
      text(s.name, s.x, s.y + 31, 11, '#1c1c22', 'center', 700);
    }
  }

  function drawMarker(x, y, color, pulse, letter) {
    const r = 26 + Math.sin(pulse * 4) * 4;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(x, y, r + 10, 0, TAU);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    if (letter) text(letter, x, y + 8, 22, '#1c1c22', 'center', 800);
    // Light beam so the marker is visible from afar.
    const grad = ctx.createLinearGradient(0, y - 220, 0, y);
    grad.addColorStop(0, 'rgba(255,220,80,0)');
    grad.addColorStop(1, 'rgba(255,220,80,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 7, y - 220, 14, 220);
  }

  function drawCar(car, time) {
    const { w, h } = car.spec;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(3, 4, w / 2, h / 2 + 2, 0, 0, TAU);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#1a1a1e';
    const ww = 10;
    const wh = 5;
    ctx.fillRect(-w / 2 + 4, -h / 2 - 2, ww, wh);
    ctx.fillRect(w / 2 - 14, -h / 2 - 2, ww, wh);
    ctx.fillRect(-w / 2 + 4, h / 2 - 3, ww, wh);
    ctx.fillRect(w / 2 - 14, h / 2 - 3, ww, wh);
    // Body.
    ctx.fillStyle = car.wreck ? '#3a3a3e' : car.color;
    roundRect(-w / 2, -h / 2, w, h, 7);
    ctx.fill();
    if (car.police && !car.wreck) {
      ctx.fillStyle = '#2e4a8a';
      ctx.fillRect(-w / 2 + 4, -h / 2 + 2, w - 8, 5);
      ctx.fillRect(-w / 2 + 4, h / 2 - 7, w - 8, 5);
      text('POLICE', 0, 3, 7, '#1c1c22', 'center', 800);
    }
    if (car.type === 'taxi' && !car.wreck) {
      ctx.fillStyle = '#1c1c22';
      for (let cx = -w / 2 + 8; cx < w / 2 - 8; cx += 8) ctx.fillRect(cx, -2, 4, 4);
      ctx.fillStyle = '#fff8d6';
      roundRect(-8, -h / 2 - 1, 16, 5, 2);
      ctx.fill();
    }
    // Windows and roof.
    ctx.fillStyle = car.wreck ? '#222226' : '#20242e';
    roundRect(-w / 2 + 8, -h / 2 + 3, 12, h - 6, 3);
    ctx.fill();
    roundRect(w / 2 - 20, -h / 2 + 3, 12, h - 6, 3);
    ctx.fill();
    ctx.fillStyle = car.wreck ? '#2c2c30' : 'rgba(255,255,255,0.22)';
    roundRect(-w / 2 + 20, -h / 2 + 3, w - 40, h - 6, 3);
    ctx.fill();
    // Headlights and taillights.
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(w / 2 - 2, -h / 2 + 2, 3, 4);
    ctx.fillRect(w / 2 - 2, h / 2 - 6, 3, 4);
    ctx.fillStyle = car.brake ? '#ff2e2e' : '#a82e2e';
    ctx.fillRect(-w / 2 - 1, -h / 2 + 2, 3, 4);
    ctx.fillRect(-w / 2 - 1, h / 2 - 6, 3, 4);
    ctx.restore();
    // Police light bar, flashing.
    if (car.police && !car.wreck) {
      const phase = Math.sin(time * 10 + car.sirenPhase) > 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#3b82ff';
      ctx.beginPath();
      ctx.arc(car.x - 4, car.y, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = phase ? '#3b82ff' : '#ff3b30';
      ctx.beginPath();
      ctx.arc(car.x + 4, car.y, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = phase ? 'rgba(255,59,48,0.25)' : 'rgba(59,130,255,0.25)';
      ctx.beginPath();
      ctx.arc(car.x, car.y, 46, 0, TAU);
      ctx.fill();
    }
    if (car.criminal && !car.wreck) {
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(car.x, car.y, 30 + Math.sin(time * 5) * 3, 0, TAU);
      ctx.stroke();
    }
  }

  function drawPerson(x, y, angle, shirt, pants, skin, walkPhase, moving, opts) {
    const o = opts || {};
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 3, 10, 7, 0, 0, TAU);
    ctx.fill();
    if (o.dead) {
      ctx.fillStyle = 'rgba(140,20,20,0.5)';
      ctx.beginPath();
      ctx.ellipse(x, y, 15, 10, angle, 0, TAU);
      ctx.fill();
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.ellipse(x, y, 12, 7, angle, 0, TAU);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * 11, y + Math.sin(angle) * 11, 5, 0, TAU);
      ctx.fill();
      return;
    }
    const bob = moving ? Math.sin(walkPhase) * 1.5 : 0;
    // Legs.
    ctx.fillStyle = pants;
    const px = Math.cos(angle + Math.PI / 2);
    const py = Math.sin(angle + Math.PI / 2);
    ctx.beginPath();
    ctx.arc(x - px * 4 - Math.cos(angle) * bob, y - py * 4 - Math.sin(angle) * bob, 4, 0, TAU);
    ctx.arc(x + px * 4 + Math.cos(angle) * bob, y + py * 4 + Math.sin(angle) * bob, 4, 0, TAU);
    ctx.fill();
    // Body.
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, TAU);
    ctx.fill();
    // Head, slightly toward the facing.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3, 5.5, 0, TAU);
    ctx.fill();
    if (o.cap) {
      ctx.fillStyle = '#1c2a4a';
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3, 5.5, Math.PI, TAU);
      ctx.fill();
    }
    if (o.gun) {
      ctx.strokeStyle = '#222226';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * 8, y + Math.sin(angle) * 8);
      ctx.lineTo(x + Math.cos(angle) * 20, y + Math.sin(angle) * 20);
      ctx.stroke();
    }
  }

  function drawEntities(state) {
    const cam = state.camera;
    const time = state.time;
    const inView = (x, y, m) => Math.abs(x - cam.x) < W / 2 + (m || 60) && Math.abs(y - cam.y) < H / 2 + (m || 60);

    // Mission markers under everything else.
    if (state.mission) {
      const obj = state.missionObjective;
      if (obj && obj.target) drawMarker(obj.target.x, obj.target.y, '#ffd93b', time, null);
    } else if (state.missionOffer) {
      const next = state.missionOffer;
      const start = state.city.place(next.start.place);
      drawMarker(start.x, start.y, '#ffd93b', time, '!');
    } else if (state.nextMissionStart) {
      drawMarker(state.nextMissionStart.x, state.nextMissionStart.y, '#ffd93b', time, '!');
    }
    if (state.taxi && state.taxi.active) drawMarker(state.taxi.x, state.taxi.y, '#e8c832', time + 1, 'T');
    if (state.vigilante && state.vigilante.target && !state.vigilante.target.wreck) {
      const t = state.vigilante.target;
      drawMarker(t.x, t.y, '#ff3b30', time + 2, null);
    }

    // Hidden packages.
    for (const pkg of state.city.packages) {
      if (pkg.taken || !inView(pkg.x, pkg.y, 40)) continue;
      const pulse = 1 + Math.sin(time * 4 + pkg.x) * 0.25;
      ctx.fillStyle = 'rgba(255,154,217,0.3)';
      ctx.beginPath();
      ctx.arc(pkg.x, pkg.y, 18 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff9ad9';
      ctx.save();
      ctx.translate(pkg.x, pkg.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-6 * pulse, -6 * pulse, 12 * pulse, 12 * pulse);
      ctx.restore();
    }

    // Pickups.
    for (const pk of state.pickups) {
      if (pk.respawn > 0 || !inView(pk.x, pk.y, 40)) continue;
      const bobY = pk.y + Math.sin(time * 3 + pk.x) * 3;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(pk.x, bobY, 16, 0, TAU);
      ctx.fill();
      if (pk.kind === 'health') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(pk.x - 9, bobY - 9, 18, 18);
        ctx.fillStyle = '#d92e2e';
        ctx.fillRect(pk.x - 2.5, bobY - 6, 5, 12);
        ctx.fillRect(pk.x - 6, bobY - 2.5, 12, 5);
      } else if (pk.kind === 'armor') {
        ctx.fillStyle = '#6ea8ff';
        ctx.beginPath();
        ctx.arc(pk.x, bobY, 10, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(pk.x, bobY, 5, 0, TAU);
        ctx.fill();
      } else if (pk.kind === 'cash') {
        ctx.fillStyle = '#57d977';
        ctx.fillRect(pk.x - 10, bobY - 6, 20, 12);
        text('$', pk.x, bobY + 4, 12, '#0c4a1e', 'center', 800);
      } else if (pk.kind === 'smg') {
        ctx.fillStyle = '#222226';
        ctx.fillRect(pk.x - 11, bobY - 3, 22, 6);
        ctx.fillRect(pk.x + 2, bobY + 3, 4, 7);
        ctx.fillStyle = '#ffd76e';
        ctx.fillRect(pk.x - 11, bobY - 1, 6, 2);
      }
    }

    // Pedestrians.
    for (const ped of state.peds) {
      if (!inView(ped.x, ped.y, 40)) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.guard ? '#3a3a42' : ped.shirt, ped.pants, ped.skin,
        ped.walkPhase, ped.state !== 'wait', { dead: ped.state === 'dead', gun: ped.guard && ped.state !== 'dead' });
      if (ped.state === 'wait') text('!', ped.x, ped.y - 18, 18, '#ffd93b', 'center', 800);
    }
    // Cops.
    for (const cop of state.cops) {
      if (!inView(cop.x, cop.y, 40)) continue;
      drawPerson(cop.x, cop.y, cop.angle, '#2e4a8a', '#1c2a4a', '#e8b88a', cop.walkPhase, true, { cap: true });
      if (cop.bustT > 0.15) {
        ctx.fillStyle = 'rgba(255,46,46,0.9)';
        ctx.fillRect(cop.x - 14, cop.y - 24, 28 * (cop.bustT / 0.9), 5);
      }
    }
    // Cars.
    for (const car of state.cars) {
      if (!inView(car.x, car.y, 80)) continue;
      drawCar(car, time);
    }
    // The player.
    const p = state.player;
    if (p && !p.inCar) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16 + Math.sin(time * 3) * 1.5, 0, TAU);
      ctx.stroke();
      drawPerson(p.x, p.y, p.angle, '#e84a3f', '#2e3a4f', '#f0c8a0', p.walkPhase, p.moving, { gun: true });
    }
    // Tracers.
    for (const t of state.tracers) {
      ctx.strokeStyle = t.color;
      ctx.globalAlpha = clamp(t.life / 0.07, 0, 1);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x0, t.y0);
      ctx.lineTo(t.x1, t.y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Particles.
    for (const pt of state.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Floating texts.
    for (const f of state.floats) {
      ctx.globalAlpha = clamp(f.life, 0, 1);
      text(f.text, f.x, f.y, 17, f.color, 'center', 800);
    }
    ctx.globalAlpha = 1;
  }

  function drawNight(state, night, dusk) {
    const cam = state.camera;
    if (dusk) {
      ctx.fillStyle = 'rgba(255,110,40,0.10)';
      ctx.fillRect(cam.x - W / 2, cam.y - H / 2, W, H);
    }
    if (!night) return;
    ctx.fillStyle = 'rgba(8,10,38,0.34)';
    ctx.fillRect(cam.x - W / 2, cam.y - H / 2, W, H);
    // Headlight cones and streetlights punch through the dark.
    ctx.globalCompositeOperation = 'lighter';
    for (const car of state.cars) {
      if (car.wreck) continue;
      const moving = Math.hypot(car.vx, car.vy) > 30 || car.driver === 'player';
      if (!moving) continue;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const grad = ctx.createRadialGradient(car.x + fx * 40, car.y + fy * 40, 6, car.x + fx * 40, car.y + fy * 40, 130);
      grad.addColorStop(0, 'rgba(255,240,170,0.20)');
      grad.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(car.x + fx * 20, car.y + fy * 20);
      ctx.lineTo(car.x + fx * 150 - fy * 42, car.y + fy * 150 + fx * 42);
      ctx.lineTo(car.x + fx * 150 + fy * 42, car.y + fy * 150 - fx * 42);
      ctx.closePath();
      ctx.fill();
    }
    for (const ax of state.city.avenues) {
      for (const st of state.city.streets) {
        if (Math.abs(ax - cam.x) > W / 2 || Math.abs(st - cam.y) > H / 2) continue;
        const grad = ctx.createRadialGradient(ax, st, 4, ax, st, 90);
        grad.addColorStop(0, 'rgba(255,220,140,0.16)');
        grad.addColorStop(1, 'rgba(255,220,140,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ax, st, 90, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
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

  function clockText(state) {
    const h = Math.floor(state.clock / 60) % 24;
    const m = Math.floor(state.clock % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function drawMinimap(state) {
    const size = 200;
    const mx = 16;
    const my = H - size - 16;
    const s = size / WORLD_W;
    const sy = size / WORLD_H;
    panel(mx - 4, my - 4, size + 8, size + 8, 0.75);
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, size, size);
    ctx.clip();
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(mx, my, size, size);
    ctx.fillStyle = COLORS.park;
    ctx.fillRect(mx + state.city.park.x0 * s, my + state.city.park.y0 * sy,
      (state.city.park.x1 - state.city.park.x0) * s, (state.city.park.y1 - state.city.park.y0) * sy);
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(mx + SAND_X0 * s, my, (WATER_X0 - SAND_X0) * s, size);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(mx + WATER_X0 * s, my, (WORLD_W - WATER_X0) * s, size);
    ctx.strokeStyle = COLORS.road;
    ctx.lineWidth = 2.5;
    for (const ax of state.city.avenues) {
      ctx.beginPath();
      ctx.moveTo(mx + ax * s, my);
      ctx.lineTo(mx + ax * s, my + size);
      ctx.stroke();
    }
    for (const st of state.city.streets) {
      ctx.beginPath();
      ctx.moveTo(mx, my + st * sy);
      ctx.lineTo(mx + size, my + st * sy);
      ctx.stroke();
    }
    // Shops.
    for (const shop of state.city.shops) {
      ctx.fillStyle = shop.color;
      ctx.beginPath();
      ctx.arc(mx + shop.x * s, my + shop.y * sy, 3, 0, TAU);
      ctx.fill();
    }
    // Packages.
    ctx.fillStyle = '#ff9ad9';
    for (const pkg of state.city.packages) {
      if (!pkg.taken) ctx.fillRect(mx + pkg.x * s - 1, my + pkg.y * sy - 1, 2.5, 2.5);
    }
    // Mission target.
    const obj = state.missionObjective;
    if (obj && obj.target) {
      const pulse = 4 + Math.sin(state.time * 5) * 1.5;
      ctx.fillStyle = '#ffd93b';
      ctx.beginPath();
      ctx.arc(mx + obj.target.x * s, my + obj.target.y * sy, pulse, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (state.nextMissionStart) {
      ctx.fillStyle = '#ffd93b';
      ctx.beginPath();
      ctx.arc(mx + state.nextMissionStart.x * s, my + state.nextMissionStart.y * sy, 4, 0, TAU);
      ctx.fill();
    }
    if (state.taxi && state.taxi.active) {
      ctx.fillStyle = '#e8c832';
      ctx.beginPath();
      ctx.arc(mx + state.taxi.x * s, my + state.taxi.y * sy, 4, 0, TAU);
      ctx.fill();
    }
    if (state.vigilante && state.vigilante.target && !state.vigilante.target.wreck) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(mx + state.vigilante.target.x * s, my + state.vigilante.target.y * sy, 4, 0, TAU);
      ctx.fill();
    }
    // Police.
    ctx.fillStyle = '#5b9bff';
    for (const cop of state.cops) {
      if (!cop.leaving) ctx.fillRect(mx + cop.x * s - 1.5, my + cop.y * sy - 1.5, 3, 3);
    }
    for (const car of state.cars) {
      if (car.driver === 'police' && !car.wreck) {
        ctx.fillRect(mx + car.x * s - 2, my + car.y * sy - 2, 4, 4);
      }
    }
    // The player: a white arrow that turns with them.
    const p = state.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    const pa = p.inCar ? p.inCar.angle : p.angle;
    ctx.save();
    ctx.translate(mx + px * s, my + py * sy);
    ctx.rotate(pa);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1c1c22';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    text('SOLMAR', mx + 8, my - 8, 11, 'rgba(255,255,255,0.85)', 'left', 800);
    text('N', mx + size - 4, my - 8, 11, 'rgba(255,255,255,0.85)', 'right', 800);
  }

  function drawHud(state, ui) {
    const p = state.player;
    // Objective panel, top-left.
    const obj = state.missionObjective;
    if (obj) {
      const lines = wrapLines(obj.text, 44);
      const ph = 44 + lines.length * 20;
      panel(16, 16, 360, ph, 0.78);
      text(obj.title.toUpperCase(), 32, 42, 15, '#ffd93b', 'left', 800);
      lines.forEach((line, i) => text(line, 32, 66 + i * 20, 15, '#ffffff', 'left', 500));
    } else {
      panel(16, 16, 360, 64, 0.6);
      text(state.storyDone ? 'SOLMAR IS YOURS' : 'FREE ROAM', 32, 42, 15, '#ffd93b', 'left', 800);
      text(`Missions ${state.doneMissions.length}/6  ·  Packages ${state.stats.packages}/20`, 32, 62, 14, '#dddddd', 'left', 500);
    }
    // Money, clock and wanted stars, top-right.
    const money = `$${p.money.toLocaleString('en-US')}`;
    text(money, W - 20, 48, 30, '#57d977', 'right', 800);
    const h = Math.floor(state.clock / 60) % 24;
    const icon = h < 6 || h >= 20 ? '☾' : h >= 17 ? '◐' : '☀';
    text(`${icon} ${clockText(state)}`, W - 20, 74, 16, 'rgba(255,255,255,0.9)', 'right', 600);
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
    text(stars, W - 20, 104, 26, state.wanted > 0 ? '#ffd93b' : 'rgba(255,255,255,0.35)', 'right', 800);
    if (state.wanted > 0 && state.evade > 0) {
      text('Losing them…', W - 20, 130, 14, '#9fe8ff', 'right', 600);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(W - 140, 138, 120, 6);
      ctx.fillStyle = '#9fe8ff';
      ctx.fillRect(W - 140, 138, 120 * (state.evade / EVADE_SECONDS), 6);
    }
    // Centre message and banner.
    if (state.message) {
      const alpha = clamp(state.message.t, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.font = font(18, 700);
      const w = ctx.measureText(state.message.text).width;
      panel(W / 2 - w / 2 - 16, 16, w + 32, 36, 0.78);
      text(state.message.text, W / 2, 41, 18, '#ffffff', 'center', 700);
      ctx.globalAlpha = 1;
    }
    if (state.banner) {
      const alpha = clamp(state.banner.t, 0, 1);
      ctx.globalAlpha = alpha;
      text(state.banner.title, W / 2, H * 0.3, 54, '#ffd93b', 'center', 900);
      if (state.banner.sub) text(state.banner.sub, W / 2, H * 0.3 + 34, 20, '#ffffff', 'center', 600);
      ctx.globalAlpha = 1;
    }
    // Cop grabbing warning.
    const grabbing = state.cops.some((c) => c.bustT > 0.15);
    if (grabbing) {
      const flash = Math.sin(state.time * 12) > 0;
      text('A COP IS GRABBING YOU — RUN!', W / 2, 110, 22, flash ? '#ff3b30' : '#ffffff', 'center', 900);
    }
    // Health, armour, weapon, speed — bottom-right.
    const bw = 230;
    const bx = W - bw - 20;
    const by = H - 88;
    panel(bx - 12, by - 12, bw + 24, 84, 0.7);
    text('HP', bx, by + 14, 13, '#ffffff', 'left', 800);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(bx + 30, by + 2, bw - 30, 13);
    ctx.fillStyle = p.hp > 30 ? '#57d977' : '#ff3b30';
    ctx.fillRect(bx + 30, by + 2, (bw - 30) * (p.hp / PLAYER.maxHp), 13);
    text('ARMOUR', bx, by + 36, 13, '#ffffff', 'left', 800);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(bx + 30, by + 24, bw - 30, 13);
    ctx.fillStyle = '#6ea8ff';
    ctx.fillRect(bx + 30, by + 24, (bw - 30) * (p.armor / PLAYER.maxArmor), 13);
    if (p.inCar) {
      const speed = Math.round(Math.abs(p.inCar.speed) * 0.2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(bx + 30, by + 46, bw - 30, 6);
      ctx.fillStyle = p.inCar.hp > 35 ? '#ffd93b' : '#ff3b30';
      ctx.fillRect(bx + 30, by + 46, (bw - 30) * (p.inCar.hp / p.inCar.maxHp), 6);
      text(`${p.inCar.spec.name}  ·  ${speed} km/h`, bx, by + 70, 14, '#ffffff', 'left', 700);
    } else {
      text(`${WEAPONS[p.weapon].name}${p.hasSmg ? '  ·  Q to switch' : ''}`, bx, by + 58, 14, '#ffffff', 'left', 700);
    }
    // Prompt pill, bottom-centre.
    if (state.prompt) {
      ctx.font = font(16, 700);
      const w = ctx.measureText(state.prompt.text).width + 64;
      panel(W / 2 - w / 2, H - 64, w, 38, 0.85);
      ctx.fillStyle = '#ffd93b';
      roundRect(W / 2 - w / 2 + 10, H - 56, 22, 22, 5);
      ctx.fill();
      text('E', W / 2 - w / 2 + 21, H - 40, 15, '#1c1c22', 'center', 900);
      text(state.prompt.text, W / 2 + 14, H - 40, 16, '#ffffff', 'center', 700);
    } else if (ui.showHint) {
      text('WASD move / drive  ·  Mouse aim, click shoot  ·  E enter car  ·  Shift run  ·  Space handbrake',
        W / 2, H - 24, 14, 'rgba(255,255,255,0.75)', 'center', 600);
    }
    if (state.saveFlash > 0) text('✓ Saved', W - 20, H - 110, 14, '#57d977', 'right', 700);
    drawMinimap(state);
    // Off-screen objective arrow.
    const target = obj && obj.target ? obj.target : state.nextMissionStart;
    if (target) {
      const cam = state.camera;
      const sx = target.x - cam.x + W / 2;
      const sy = target.y - cam.y + H / 2;
      if (sx < 30 || sx > W - 30 || sy < 30 || sy > H - 30) {
        let cx = clamp(sx, 46, W - 46);
        const cy = clamp(sy, 46, H - 46);
        if (cy < 140 && cx < 400) cx = 400; // keep off the objective panel
        if (cy > H - 140 && cx > W - 300) cx = W - 300; // keep off the status panel
        const a = Math.atan2(sy - cy, sx - cx);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.fillStyle = '#ffd93b';
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(-8, -11);
        ctx.lineTo(-8, 11);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ---- Menus and overlays ----
  function drawButton(id, x, y, w, h, label, selected, disabled) {
    buttons.push({ id, x, y, w, h, disabled: !!disabled });
    ctx.fillStyle = disabled ? 'rgba(255,255,255,0.08)' : selected ? '#ffd93b' : 'rgba(255,255,255,0.12)';
    roundRect(x, y, w, h, 10);
    ctx.fill();
    if (selected && !disabled) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    text(label, x + w / 2, y + h / 2 + 7, 19, disabled ? 'rgba(255,255,255,0.4)' : selected ? '#1c1c22' : '#ffffff', 'center', 700);
  }

  function drawTitle(state, ui) {
    ctx.fillStyle = 'rgba(10,10,20,0.45)';
    ctx.fillRect(0, 0, W, H);
    const grad = ctx.createLinearGradient(0, H * 0.16, 0, H * 0.36);
    grad.addColorStop(0, '#ffd93b');
    grad.addColorStop(0.55, '#ff7a3c');
    grad.addColorStop(1, '#e84a8a');
    ctx.font = font(92, 900);
    ctx.fillStyle = grad;
    ctx.textAlign = 'center';
    ctx.fillText('SOLMAR', W / 2, H * 0.3);
    ctx.font = font(40, 900);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('C I T Y', W / 2, H * 0.3 + 48);
    text('An open-world crime game — built by an AI agent', W / 2, H * 0.3 + 84, 17, 'rgba(255,255,255,0.85)', 'center', 600);
    const items = ui.menuItems;
    const bw = 340;
    const bh = 54;
    const gap = 14;
    const top = H * 0.3 + 130;
    items.forEach((item, i) => {
      drawButton(item.id, W / 2 - bw / 2, top + i * (bh + gap), bw, bh, item.label, ui.menuIndex === i, item.disabled);
    });
    text('WASD move · Mouse aim · Click shoot · E enter car · P pause · M mute', W / 2, H - 52, 14, 'rgba(255,255,255,0.65)', 'center', 600);
    text('Steal cars, run missions, dodge the cops — and mind the sun.', W / 2, H - 28, 14, 'rgba(255,255,255,0.65)', 'center', 600);
  }

  function drawHowto(state, ui) {
    ctx.fillStyle = 'rgba(10,10,20,0.6)';
    ctx.fillRect(0, 0, W, H);
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

  function drawPaused(state, ui) {
    ctx.fillStyle = 'rgba(10,10,20,0.55)';
    ctx.fillRect(0, 0, W, H);
    const w = 480;
    const h = 480;
    const x = W / 2 - w / 2;
    const y = H / 2 - h / 2;
    panel(x, y, w, h, 0.94);
    text('PAUSED', W / 2, y + 52, 30, '#ffffff', 'center', 900);
    const s = state.stats;
    const mins = Math.floor(s.playTime / 60);
    const lines = [
      `Cash  $${state.player.money.toLocaleString('en-US')}`,
      `Missions  ${state.doneMissions.length}/6`,
      `Hidden packages  ${s.packages}/20`,
      `Taxi fares  ${s.fares}`,
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

  function drawBriefing(state) {
    const m = state.overlayData.mission;
    ctx.fillStyle = 'rgba(10,10,20,0.55)';
    ctx.fillRect(0, 0, W, H);
    const w = 640;
    const lines = wrapLines(m.brief, 62);
    const h = 250 + lines.length * 24;
    const x = W / 2 - w / 2;
    const y = H / 2 - h / 2;
    panel(x, y, w, h, 0.95);
    // Giver portrait: a coloured circle with an initial.
    ctx.fillStyle = m.giverColor;
    ctx.beginPath();
    ctx.arc(x + 52, y + 58, 26, 0, TAU);
    ctx.fill();
    text(m.giver[0], x + 52, y + 67, 26, '#ffffff', 'center', 900);
    text(m.giver, x + 92, y + 52, 20, '#ffffff', 'left', 800);
    text(m.title, x + 92, y + 80, 24, '#ffd93b', 'left', 900);
    lines.forEach((line, i) => text(line, x + 52, y + 122 + i * 24, 16, 'rgba(255,255,255,0.9)', 'left', 500));
    text(`Reward  $${m.reward.toLocaleString('en-US')}`, x + 52, y + h - 58, 18, '#57d977', 'left', 800);
    text('Enter — accept   ·   Esc — decline', x + w - 52, y + h - 58, 16, 'rgba(255,255,255,0.7)', 'right', 600);
  }

  function drawBigOverlay(title, titleColor, lines, prompt) {
    ctx.fillStyle = 'rgba(10,10,20,0.6)';
    ctx.fillRect(0, 0, W, H);
    text(title, W / 2, H / 2 - 60, 72, titleColor, 'center', 900);
    lines.forEach((line, i) => text(line, W / 2, H / 2 + 6 + i * 30, 20, '#ffffff', 'center', 600));
    const flash = Math.sin(Date.now() / 300) > -0.4;
    if (flash) text(prompt, W / 2, H / 2 + 110, 18, '#ffd93b', 'center', 700);
  }

  function drawOverlay(state) {
    const ov = state.overlay;
    if (!ov) return;
    if (ov === 'briefing') {
      drawBriefing(state);
      return;
    }
    if (ov === 'busted') {
      const d = state.overlayData || {};
      const lines = [`The cops caught you. Fine: $${(d.fine || 0).toLocaleString('en-US')}.`];
      if (d.failedMission) lines.push(`Mission failed: ${d.failedMission}.`);
      lines.push('You wake up at Central Precinct.');
      drawBigOverlay('BUSTED', '#5b9bff', lines, 'Press Enter to continue');
      return;
    }
    if (ov === 'wasted') {
      const d = state.overlayData || {};
      const lines = [`Hospital bill: $${(d.bill || 0).toLocaleString('en-US')}.`];
      if (d.failedMission) lines.push(`Mission failed: ${d.failedMission}.`);
      lines.push('You wake up at Solmar General.');
      drawBigOverlay('WASTED', '#ff3b30', lines, 'Press Enter to continue');
      return;
    }
    if (ov === 'done') {
      const d = state.overlayData || {};
      drawBigOverlay('MISSION PASSED', '#57d977',
        [d.title || '', `+$${(d.reward || 0).toLocaleString('en-US')}`], 'Press Enter to keep playing');
      return;
    }
    if (ov === 'fail') {
      const d = state.overlayData || {};
      drawBigOverlay('MISSION FAILED', '#ff3b30',
        [d.title || '', d.reason || '', 'Drive back to the yellow ! to try again.'], 'Press Enter to continue');
      return;
    }
    if (ov === 'complete') {
      const d = state.overlayData || {};
      drawBigOverlay('YOU OWN SOLMAR CITY', '#ffd93b',
        [`Final score: ${d.title || ''} — +$${(d.reward || 0).toLocaleString('en-US')}`,
          'Every mission done. The city is yours — keep driving.'],
        'Press Enter to keep playing');
    }
  }

  // Paint one frame. `world` is the world object (for the objective); `ui` carries the
  // menu state main.js owns.
  function draw(world, screen, ui) {
    const state = world.state;
    buttons.length = 0;
    state.missionObjective = world.currentObjective();
    const nm = nextMission(state.doneMissions);
    state.nextMissionStart = (!state.mission && nm && !state.missionOffer)
      ? { x: state.city.place(nm.start.place).x, y: state.city.place(nm.start.place).y }
      : null;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0c0e16';
    ctx.fillRect(0, 0, W, H);

    // Camera, clamped so it never looks past the map edge.
    const camX = W >= WORLD_W ? WORLD_W / 2 : clamp(state.camera.x, W / 2, WORLD_W - W / 2);
    const camY = H >= WORLD_H ? WORLD_H / 2 : clamp(state.camera.y, H / 2, WORLD_H - H / 2);
    const viewCam = { x: camX, y: camY };
    const realCam = state.camera;
    state.camera = viewCam;
    ctx.save();
    ctx.translate(W / 2 - camX, H / 2 - camY);
    drawCity(state);
    drawShops(state);
    drawEntities(state);
    drawNight(state, world.isNight(), world.isDusk());
    ctx.restore();
    state.camera = realCam;

    if (screen === SCREEN_TITLE) drawTitle(state, ui);
    else if (screen === SCREEN_HOWTO) drawHowto(state, ui);
    else if (screen === SCREEN_PAUSED) {
      drawHud(state, ui);
      drawPaused(state, ui);
    } else {
      drawHud(state, ui);
      drawOverlay(state);
    }
  }

  return {
    draw,
    buttons,
    resize,
    get w() { return W; },
    get h() { return H; },
  };
}
