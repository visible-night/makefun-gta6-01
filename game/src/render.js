// The painter: Solmar City as the player sees it. One canvas, drawn in
// logical CSS pixels over a device-pixel backing store. The world is painted
// first through the camera transform (zoom, shake, zoom punch), then the
// day-cycle tint and the juice overlays, then the HUD, then whatever screen
// or overlay is on top. Screens are just strings; main.js owns which one is
// current and this module only paints the one it is handed.
//
// The renderer keeps two pieces of state of its own: the menu buttons it
// laid out on the last paint (main.js reads them for clicks and hover) and
// the smoothed speedometer, which eases toward the car's real speed so the
// needle sweeps instead of snapping.
import {
  COLORS, ROAD_W, WORLD_W, WORLD_H, WANTED_MAX, PLAYER,
} from './config.js';
import { SAND_X0, WATER_X0, HARBOR_Y0 } from './city.js';
import { lighting, formatClock, formatDuration } from './sky.js';
import {
  panel, pill, button, bar, wrapText, label, roundRectPath,
} from './text.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_HOWTO = 'howto';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';

const TAU = Math.PI * 2;
const FONT = 'system-ui, sans-serif';
const ACCENT = '#ffd93b';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const api = {
    w: window.innerWidth || 1280,
    h: window.innerHeight || 720,
    buttons: [],
  };
  let dpr = 1;
  let smoothSpeed = 0;
  let now = 0;
  let vignette = null;
  let sized = false;

  // Match the backing store to the window at the device pixel ratio, capped
  // at 2 so a retina display does not quadruple the fill cost. Runs every
  // paint: a resize mid-game then just works. The first paint always sizes
  // the canvas, since the element starts life at the default 300 by 150.
  function resize() {
    const w = canvas.clientWidth || window.innerWidth || 1280;
    const h = canvas.clientHeight || window.innerHeight || 720;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (!sized || w !== api.w || h !== api.h || ratio !== dpr) {
      sized = true;
      api.w = w;
      api.h = h;
      dpr = ratio;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      vignette = null;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function viewRect(cam, zoom) {
    const halfW = api.w / 2 / zoom;
    const halfH = api.h / 2 / zoom;
    return {
      x0: cam.x - halfW - 80, y0: cam.y - halfH - 80,
      x1: cam.x + halfW + 80, y1: cam.y + halfH + 80,
    };
  }

  function inView(view, x, y, r) {
    return x + r >= view.x0 && x - r <= view.x1 && y + r >= view.y0 && y - r <= view.y1;
  }

  // ---- Ground ----
  function drawGround(view) {
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    // Dry patches break the green up: a few soft ellipses, placed by a
    // cheap hash of their grid cell so they never move between frames.
    ctx.fillStyle = COLORS.grassDry;
    const cell = 420;
    const gx0 = Math.floor(view.x0 / cell);
    const gx1 = Math.floor(view.x1 / cell);
    const gy0 = Math.floor(view.y0 / cell);
    const gy1 = Math.floor(view.y1 / cell);
    for (let gx = gx0; gx <= gx1; gx += 1) {
      for (let gy = gy0; gy <= gy1; gy += 1) {
        const hash = Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453;
        const frac = hash - Math.floor(hash);
        if (frac < 0.45) continue;
        ctx.beginPath();
        ctx.ellipse(
          gx * cell + frac * cell * 0.6, gy * cell + (1 - frac) * cell * 0.6,
          90 + frac * 80, 50 + frac * 40, frac * 3, 0, TAU,
        );
        ctx.fill();
      }
    }
  }

  function drawParkAndWater(city, view) {
    const park = city.park;
    ctx.fillStyle = COLORS.park;
    ctx.fillRect(park.x0, park.y0, park.x1 - park.x0, park.y1 - park.y0);
    const pond = city.pond;
    ctx.fillStyle = COLORS.water;
    ctx.beginPath();
    ctx.ellipse(pond.x, pond.y, pond.rx, pond.ry, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COLORS.waterLine;
    ctx.beginPath();
    ctx.ellipse(pond.x - 20, pond.y - 12, pond.rx * 0.5, pond.ry * 0.3, -0.3, 0, TAU);
    ctx.fill();
    // The beach, the sea and the harbour strip.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(Math.max(view.x0, SAND_X0), view.y0, WATER_X0 - Math.max(view.x0, SAND_X0), view.y1 - view.y0);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(Math.max(view.x0, WATER_X0), view.y0, view.x1 - Math.max(view.x0, WATER_X0), view.y1 - view.y0);
    ctx.fillStyle = COLORS.waterDeep;
    ctx.fillRect(Math.max(view.x0, WATER_X0 + 140), view.y0, view.x1 - Math.max(view.x0, WATER_X0 + 140), view.y1 - view.y0);
    ctx.strokeStyle = COLORS.waterLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = Math.floor(view.y0 / 90) * 90; y < view.y1; y += 90) {
      const wob = Math.sin(y * 0.05 + now * 0.8) * 8;
      ctx.moveTo(WATER_X0 + 24 + wob, y);
      ctx.lineTo(WATER_X0 + 90 + wob, y + 30);
    }
    ctx.stroke();
    ctx.fillStyle = COLORS.harbor;
    ctx.fillRect(view.x0, Math.max(view.y0, HARBOR_Y0), view.x1 - view.x0, view.y1 - Math.max(view.y0, HARBOR_Y0));
  }

  function drawRoads(city, view) {
    // Sidewalks first, as a wider pale strip under each road, then the
    // asphalt, then the centre dashes.
    ctx.fillStyle = COLORS.sidewalk;
    for (const ax of city.avenues) {
      if (ax + ROAD_W < view.x0 || ax - ROAD_W > view.x1) continue;
      ctx.fillRect(ax - ROAD_W / 2 - 18, view.y0, ROAD_W + 36, view.y1 - view.y0);
    }
    for (const st of city.streets) {
      if (st + ROAD_W < view.y0 || st - ROAD_W > view.y1) continue;
      ctx.fillRect(view.x0, st - ROAD_W / 2 - 18, view.x1 - view.x0, ROAD_W + 36);
    }
    ctx.fillStyle = COLORS.road;
    for (const ax of city.avenues) {
      if (ax + ROAD_W < view.x0 || ax - ROAD_W > view.x1) continue;
      ctx.fillRect(ax - ROAD_W / 2, view.y0, ROAD_W, view.y1 - view.y0);
    }
    for (const st of city.streets) {
      if (st + ROAD_W < view.y0 || st - ROAD_W > view.y1) continue;
      ctx.fillRect(view.x0, st - ROAD_W / 2, view.x1 - view.x0, ROAD_W);
    }
    ctx.strokeStyle = COLORS.laneDash;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    ctx.beginPath();
    for (const ax of city.avenues) {
      if (ax < view.x0 || ax > view.x1) continue;
      ctx.moveTo(ax, view.y0);
      ctx.lineTo(ax, view.y1);
    }
    for (const st of city.streets) {
      if (st < view.y0 || st > view.y1) continue;
      ctx.moveTo(view.x0, st);
      ctx.lineTo(view.x1, st);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Kerb lines where the sidewalk meets the grass.
    ctx.strokeStyle = COLORS.sidewalkEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const ax of city.avenues) {
      if (ax + ROAD_W < view.x0 || ax - ROAD_W > view.x1) continue;
      ctx.moveTo(ax - ROAD_W / 2 - 18, view.y0);
      ctx.lineTo(ax - ROAD_W / 2 - 18, view.y1);
      ctx.moveTo(ax + ROAD_W / 2 + 18, view.y0);
      ctx.lineTo(ax + ROAD_W / 2 + 18, view.y1);
    }
    for (const st of city.streets) {
      if (st + ROAD_W < view.y0 || st - ROAD_W > view.y1) continue;
      ctx.moveTo(view.x0, st - ROAD_W / 2 - 18);
      ctx.lineTo(view.x1, st - ROAD_W / 2 - 18);
      ctx.moveTo(view.x0, st + ROAD_W / 2 + 18);
      ctx.lineTo(view.x1, st + ROAD_W / 2 + 18);
    }
    ctx.stroke();
  }

  function drawSkids(state, view) {
    const skids = state.juice.skids;
    if (skids.length === 0) return;
    ctx.lineCap = 'round';
    for (const s of skids) {
      if (!inView(view, s.x, s.y, 20)) continue;
      const a = clamp(s.life / s.maxLife, 0, 1) * 0.5;
      ctx.strokeStyle = `rgba(20, 18, 22, ${a.toFixed(3)})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * 12, s.y - Math.sin(s.angle) * 12);
      ctx.lineTo(s.x + Math.cos(s.angle) * 12, s.y + Math.sin(s.angle) * 12);
      ctx.stroke();
    }
  }

  function drawBuildings(city, view) {
    for (const b of city.buildings) {
      if (b.x > view.x1 || b.x + b.w < view.x0 || b.y > view.y1 || b.y + b.h < view.y0) continue;
      // The shadow falls south-east, longer for taller buildings.
      const sh = Math.min(46, b.hgt * 0.45);
      ctx.fillStyle = 'rgba(20, 22, 30, 0.28)';
      ctx.fillRect(b.x + sh * 0.7, b.y + sh * 0.7, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      if (b.glass) {
        // Glass towers get a window grid and a sun glint.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
        const step = 22;
        for (let wx = b.x + 10; wx < b.x + b.w - 8; wx += step) {
          for (let wy = b.y + 10; wy < b.y + b.h - 8; wy += step) {
            ctx.fillRect(wx, wy, 10, 12);
          }
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.beginPath();
        ctx.moveTo(b.x, b.y + b.h);
        ctx.lineTo(b.x + b.w * 0.45, b.y);
        ctx.lineTo(b.x + b.w * 0.7, b.y);
        ctx.lineTo(b.x + b.w * 0.25, b.y + b.h);
        ctx.closePath();
        ctx.fill();
      } else if (b.container) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        for (let rx = b.x + 12; rx < b.x + b.w - 6; rx += 16) {
          ctx.fillRect(rx, b.y + 4, 3, b.h - 8);
        }
      } else {
        // A house or shop: a paler roof inset and a door dot.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        const doorX = b.x + b.w * (0.3 + b.seed * 0.4);
        ctx.fillRect(doorX, b.y + b.h - 8, 12, 8);
      }
    }
  }

  function drawTrees(city, view) {
    for (const t of city.trees) {
      if (!inView(view, t.x, t.y, t.r + 10)) continue;
      ctx.fillStyle = 'rgba(20, 22, 30, 0.25)';
      ctx.beginPath();
      ctx.ellipse(t.x + 5, t.y + 6, t.r * 0.9, t.r * 0.6, 0, 0, TAU);
      ctx.fill();
      if (t.palm) {
        ctx.strokeStyle = COLORS.treeDark;
        ctx.lineWidth = 3;
        for (let f = 0; f < 7; f += 1) {
          const a = (f / 7) * TAU + t.shade;
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.quadraticCurveTo(
            t.x + Math.cos(a) * t.r * 0.7, t.y + Math.sin(a) * t.r * 0.7 - 4,
            t.x + Math.cos(a) * t.r * 1.3, t.y + Math.sin(a) * t.r * 1.3 + 5,
          );
          ctx.stroke();
        }
        ctx.fillStyle = '#6b4a26';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 3, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = t.shade > 0.5 ? COLORS.tree : COLORS.treeDark;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.beginPath();
        ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.55, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawPlaces(city, view) {
    for (const shop of city.shops) {
      if (!inView(view, shop.x, shop.y, 60)) continue;
      const pulse = 1 + Math.sin(now * 2.2 + shop.x) * 0.06;
      ctx.fillStyle = shop.color;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(shop.x, shop.y, 30 * pulse, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = shop.color;
      ctx.beginPath();
      ctx.arc(shop.x, shop.y, 15, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = shop.color === '#e8e4da' ? '#20242e' : '#ffffff';
      ctx.font = `700 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(shop.letter, shop.x, shop.y + 1);
      label(ctx, shop.name.toUpperCase(), shop.x, shop.y + 34, {
        font: `700 10px ${FONT}`, color: 'rgba(255, 255, 255, 0.85)', align: 'center',
      });
    }
  }

  function drawPickups(state, view) {
    for (const pk of state.pickups) {
      if (pk.respawn > 0 || !inView(view, pk.x, pk.y, 30)) continue;
      const bob = Math.sin(now * 3 + pk.x * 0.05) * 3;
      const y = pk.y + bob;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.arc(pk.x, y, 13, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#20242e';
      ctx.font = `700 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (pk.kind === 'health') {
        ctx.fillStyle = '#2e9e4f';
        ctx.fillRect(pk.x - 2, y - 7, 4, 14);
        ctx.fillRect(pk.x - 7, y - 2, 14, 4);
      } else if (pk.kind === 'armor') {
        ctx.fillStyle = '#3f6fb8';
        ctx.beginPath();
        ctx.moveTo(pk.x, y - 8);
        ctx.lineTo(pk.x + 7, y - 4);
        ctx.lineTo(pk.x + 7, y + 2);
        ctx.quadraticCurveTo(pk.x + 7, y + 7, pk.x, y + 9);
        ctx.quadraticCurveTo(pk.x - 7, y + 7, pk.x - 7, y + 2);
        ctx.lineTo(pk.x - 7, y - 4);
        ctx.closePath();
        ctx.fill();
      } else if (pk.kind === 'cash') {
        ctx.fillStyle = '#2e9e4f';
        ctx.fillText('$', pk.x, y + 1);
      } else {
        ctx.fillStyle = '#8a6d1f';
        ctx.fillRect(pk.x - 8, y - 3, 13, 5);
        ctx.fillRect(pk.x + 3, y - 2, 6, 2);
        ctx.fillRect(pk.x - 4, y + 2, 3, 5);
      }
    }
    // Hidden packages: a pink diamond that breathes, hard to miss up close.
    for (const pkg of state.city.packages) {
      if (pkg.taken || !inView(view, pkg.x, pkg.y, 40)) continue;
      const breathe = 1 + Math.sin(now * 4 + pkg.y) * 0.18;
      ctx.fillStyle = 'rgba(255, 154, 217, 0.25)';
      ctx.beginPath();
      ctx.arc(pkg.x, pkg.y, 22 * breathe, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(pkg.x, pkg.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ff9ad9';
      ctx.fillRect(-7 * breathe, -7 * breathe, 14 * breathe, 14 * breathe);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(-7 * breathe, -7 * breathe, 14 * breathe, 14 * breathe);
      ctx.restore();
    }
  }

  // One car, top-down: shadow, body, glass, roof, lights and wheels. The
  // body leans a touch into a slide, brake lights flare when it slows, and
  // a police light bar alternates red and blue on its siren phase.
  function drawCar(car) {
    const spec = car.spec;
    const w = spec.w;
    const h = spec.h;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.fillStyle = 'rgba(20, 22, 30, 0.3)';
    ctx.beginPath();
    ctx.ellipse(3, 5, w * 0.55, h * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(car.angle + (car.lean || 0));
    // Wheels peek out at the four corners.
    ctx.fillStyle = '#15151a';
    const ww = 9;
    const wh = 5;
    ctx.fillRect(-w / 2 + 3, -h / 2 - 2, ww, wh);
    ctx.fillRect(w / 2 - 12, -h / 2 - 2, ww, wh);
    ctx.fillRect(-w / 2 + 3, h / 2 - 3, ww, wh);
    ctx.fillRect(w / 2 - 12, h / 2 - 3, ww, wh);
    if (car.wreck) {
      ctx.fillStyle = '#26262b';
      roundRectPath(ctx, -w / 2, -h / 2, w, h, 7);
      ctx.fill();
      ctx.fillStyle = '#3a3a40';
      roundRectPath(ctx, -w / 2 + 8, -h / 2 + 5, w - 16, h - 10, 4);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = car.color;
    roundRectPath(ctx, -w / 2, -h / 2, w, h, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Glass front and rear, roof between them.
    ctx.fillStyle = 'rgba(180, 220, 240, 0.85)';
    roundRectPath(ctx, w * 0.18, -h / 2 + 4, w * 0.2, h - 8, 3);
    ctx.fill();
    roundRectPath(ctx, -w * 0.38, -h / 2 + 4, w * 0.18, h - 8, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    roundRectPath(ctx, -w * 0.16, -h / 2 + 4, w * 0.32, h - 8, 3);
    ctx.fill();
    if (car.type === 'taxi') {
      ctx.fillStyle = '#ffd93b';
      ctx.fillRect(-4, -h / 2 - 1, 10, 5);
      ctx.fillStyle = '#20242e';
      ctx.font = `700 5px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 1, -h / 2 + 3);
    }
    if (car.police) {
      ctx.fillStyle = '#20242e';
      ctx.fillRect(-w * 0.1, -h / 2 + 2, w * 0.24, 3);
      ctx.fillRect(-w * 0.1, h / 2 - 5, w * 0.24, 3);
      const phase = Math.sin(car.sirenPhase || 0) > 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#7a1a16';
      ctx.fillRect(-3, -h / 2 + 1, 7, 5);
      ctx.fillStyle = phase ? '#1a3a8a' : '#3f7ad9';
      ctx.fillRect(-3, h / 2 - 6, 7, 5);
    }
    // Headlights ahead, tail lights behind; braking flares the red.
    ctx.fillStyle = 'rgba(255, 244, 190, 0.95)';
    ctx.fillRect(w / 2 - 3, -h / 2 + 3, 3, 5);
    ctx.fillRect(w / 2 - 3, h / 2 - 8, 3, 5);
    ctx.fillStyle = car.brake ? '#ff2e2e' : 'rgba(255, 60, 60, 0.75)';
    ctx.fillRect(-w / 2, -h / 2 + 3, 3, 5);
    ctx.fillRect(-w / 2, h / 2 - 8, 3, 5);
    if (car.criminal) {
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 2;
      roundRectPath(ctx, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCars(state, view) {
    for (const car of state.cars) {
      if (inView(view, car.x, car.y, 60)) drawCar(car);
    }
  }

  // A walker, top-down: legs that scissor with the walk phase, a shirt, a
  // head, and a gun line for an armed guard. The dead lie flat and fade.
  function drawPedFigure(x, y, angle, walkPhase, shirt, pants, skin, opts) {
    const o = opts || {};
    ctx.save();
    ctx.translate(x, y);
    if (o.dead) {
      ctx.globalAlpha = clamp(1 - (o.deadT || 0) / 25, 0.15, 1);
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = pants;
      roundRectPath(ctx, -6, -13, 12, 26, 5);
      ctx.fill();
      ctx.fillStyle = shirt;
      roundRectPath(ctx, -6, -6, 12, 14, 5);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(0, -11, 5, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(20, 22, 30, 0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 11, 8, 0, 0, TAU);
    ctx.fill();
    const swing = Math.sin(walkPhase) * 5;
    ctx.rotate(angle);
    ctx.fillStyle = pants;
    ctx.fillRect(-4, -7 + swing * 0.4, 8, 6);
    ctx.fillRect(-4, 1 - swing * 0.4, 8, 6);
    ctx.fillStyle = shirt;
    roundRectPath(ctx, -7, -8, 15, 16, 6);
    ctx.fill();
    if (o.vest) {
      ctx.fillStyle = '#2e3138';
      roundRectPath(ctx, -4, -8, 9, 16, 3);
      ctx.fill();
    }
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(8, 0, 5.5, 0, TAU);
    ctx.fill();
    if (o.gun) {
      ctx.strokeStyle = '#1c1c22';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(20, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPeds(state, view) {
    for (const ped of state.peds) {
      if (!inView(view, ped.x, ped.y, 30)) continue;
      drawPedFigure(ped.x, ped.y, ped.angle, ped.walkPhase, ped.shirt, ped.pants, ped.skin, {
        dead: ped.state === 'dead',
        deadT: ped.deadT,
        vest: ped.guard,
        gun: ped.guard,
      });
    }
    for (const cop of state.cops) {
      if (!inView(view, cop.x, cop.y, 30)) continue;
      drawPedFigure(cop.x, cop.y, cop.angle, cop.walkPhase, '#2e4a8a', '#20242e', '#e8b88a', {});
      ctx.fillStyle = '#1c2f5e';
      ctx.beginPath();
      ctx.arc(cop.x + Math.cos(cop.angle) * 8, cop.y + Math.sin(cop.angle) * 8, 6, 0, TAU);
      ctx.fill();
    }
  }

  function drawPlayer(state, view) {
    const hero = state.player;
    if (hero.inCar) return;
    if (!inView(view, hero.x, hero.y, 40)) return;
    drawPedFigure(hero.x, hero.y, hero.angle, hero.walkPhase, '#2e8b8b', '#2e3a4f', '#e8b88a', { gun: true });
    // The aim reticle sits where the next shot will go.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hero.aimX, hero.aimY, 9, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hero.aimX - 13, hero.aimY);
    ctx.lineTo(hero.aimX - 5, hero.aimY);
    ctx.moveTo(hero.aimX + 5, hero.aimY);
    ctx.lineTo(hero.aimX + 13, hero.aimY);
    ctx.moveTo(hero.aimX, hero.aimY - 13);
    ctx.lineTo(hero.aimX, hero.aimY - 5);
    ctx.moveTo(hero.aimX, hero.aimY + 5);
    ctx.lineTo(hero.aimX, hero.aimY + 13);
    ctx.stroke();
  }

  function drawTracers(state, view) {
    ctx.lineCap = 'round';
    for (const t of state.tracers) {
      if (!inView(view, (t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, 300)) continue;
      ctx.strokeStyle = t.color;
      ctx.globalAlpha = clamp(t.life / 0.07, 0, 1);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x0, t.y0);
      ctx.lineTo(t.x1, t.y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles(state, view) {
    for (const p of state.particles) {
      if (p.life <= 0 || !inView(view, p.x, p.y, 20)) continue;
      const frac = p.life / p.maxLife;
      ctx.globalAlpha = clamp(frac, 0, 1);
      ctx.fillStyle = p.color;
      const size = p.shrink ? p.size * (0.4 + 0.6 * frac) : p.size;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.6, size), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRingsAndMuzzles(state, view) {
    for (const ring of state.juice.rings) {
      if (!inView(view, ring.x, ring.y, ring.maxR)) continue;
      const frac = 1 - ring.life / ring.maxLife;
      const radius = ring.maxR * easeOutCubic(frac);
      ctx.globalAlpha = clamp(ring.life / ring.maxLife, 0, 1) * 0.8;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 3 + 4 * (1 - frac);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const m of state.juice.muzzles) {
      if (!inView(view, m.x, m.y, 30)) continue;
      const frac = m.life / m.maxLife;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      ctx.globalAlpha = frac;
      ctx.fillStyle = '#fff2a8';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(2, 3);
      ctx.lineTo(2, -3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats(state, view) {
    for (const f of state.floats) {
      if (!inView(view, f.x, f.y, 60)) continue;
      label(ctx, f.text, f.x, f.y, {
        font: `700 15px ${FONT}`, color: f.color, align: 'center',
      });
    }
  }

  // The objective beacon: a shaft of light and a pulsing diamond over the
  // place the player is headed. Taxi and vigilante targets get their own
  // colors so the three never blur together.
  function drawMarker(x, y, color, letter) {
    const pulse = 1 + Math.sin(now * 3.4) * 0.14;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.13;
    ctx.fillRect(x - 7, y - 150, 14, 150);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color;
    const s = 11 * pulse;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-s, -s, s * 2, s * 2);
    ctx.restore();
    if (letter) {
      label(ctx, letter, x, y + 4, {
        font: `700 11px ${FONT}`, color: '#1a1405', align: 'center', shadow: false,
      });
    }
  }

  function drawObjectiveMarkers(world, view) {
    const state = world.state;
    const objective = world.currentObjective();
    if (objective && objective.target && inView(view, objective.target.x, objective.target.y, 200)) {
      drawMarker(objective.target.x, objective.target.y, ACCENT, null);
    }
    if (state.missionOffer) {
      const start = world.city.place(state.missionOffer.start.place);
      if (inView(view, start.x, start.y, 200)) drawMarker(start.x, start.y, '#57d977', '!');
    }
    if (state.taxi && state.taxi.active && inView(view, state.taxi.x, state.taxi.y, 200)) {
      drawMarker(state.taxi.x, state.taxi.y, '#6ea8ff', state.taxi.stage === 'pickup' ? 'P' : 'D');
    }
    if (state.vigilante && state.vigilante.target && !state.vigilante.target.wreck) {
      const t = state.vigilante.target;
      if (inView(view, t.x, t.y, 200)) drawMarker(t.x, t.y, '#ff3b30', '!');
    }
  }

  // Headlight cones after dark: a soft wedge of warm light ahead of each
  // car in view. Cheap, and it sells the night driving.
  function drawHeadlights(state, view, light) {
    if (light.lampGlow < 0.4) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const car of state.cars) {
      if (car.wreck || !inView(view, car.x, car.y, 220)) continue;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const grad = ctx.createRadialGradient(
        car.x + fx * 30, car.y + fy * 30, 10,
        car.x + fx * 30, car.y + fy * 30, 190,
      );
      grad.addColorStop(0, `rgba(255, 240, 180, ${0.14 * light.lampGlow})`);
      grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(car.x + fx * 20, car.y + fy * 20);
      ctx.lineTo(car.x + fx * 190 - fy * 70, car.y + fy * 190 + fx * 70);
      ctx.lineTo(car.x + fx * 190 + fy * 70, car.y + fy * 190 - fx * 70);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWorld(world, view) {
    const state = world.state;
    const city = world.city;
    const light = lighting(state.clock);
    drawGround(view);
    drawParkAndWater(city, view);
    drawRoads(city, view);
    drawSkids(state, view);
    drawPlaces(city, view);
    drawPickups(state, view);
    drawBuildings(city, view);
    drawTrees(city, view);
    drawObjectiveMarkers(world, view);
    drawCars(state, view);
    drawPeds(state, view);
    drawPlayer(state, view);
    drawTracers(state, view);
    drawParticles(state, view);
    drawRingsAndMuzzles(state, view);
    drawFloats(state, view);
    drawHeadlights(state, view, light);
    return light;
  }

  // ---- Screen-space overlays: day tint, lamps, flashes, hurt vignette ----
  function drawLightOverlays(world, light, cam, zoom) {
    const state = world.state;
    if (light.alpha > 0.004) {
      ctx.fillStyle = light.overlay;
      ctx.fillRect(0, 0, api.w, api.h);
    }
    // Streetlamps pool light at the intersections once the lamps are on.
    if (light.lampGlow > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const ax of world.city.avenues) {
        for (const st of world.city.streets) {
          const sx = (ax - cam.x) * zoom + api.w / 2;
          const sy = (st - cam.y) * zoom + api.h / 2;
          if (sx < -60 || sx > api.w + 60 || sy < -60 || sy > api.h + 60) continue;
          const grad = ctx.createRadialGradient(sx, sy, 4, sx, sy, 70 * zoom);
          grad.addColorStop(0, `rgba(255, 214, 130, ${0.13 * light.lampGlow})`);
          grad.addColorStop(1, 'rgba(255, 214, 130, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, 70 * zoom, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    // Fullscreen flashes, then the red hurt vignette closing in.
    for (const f of state.juice.flashes) {
      ctx.globalAlpha = clamp(f.t / f.dur, 0, 1) * 0.55;
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, api.w, api.h);
    }
    ctx.globalAlpha = 1;
    if (state.juice.red > 0.01) {
      const grad = ctx.createRadialGradient(
        api.w / 2, api.h / 2, Math.min(api.w, api.h) * 0.32,
        api.w / 2, api.h / 2, Math.max(api.w, api.h) * 0.72,
      );
      grad.addColorStop(0, 'rgba(200, 30, 30, 0)');
      grad.addColorStop(1, `rgba(200, 30, 30, ${(state.juice.red * 0.55).toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, api.w, api.h);
    }
    // A permanent soft vignette to seat the HUD on the frame.
    if (!vignette) {
      vignette = ctx.createRadialGradient(
        api.w / 2, api.h / 2, Math.min(api.w, api.h) * 0.42,
        api.w / 2, api.h / 2, Math.max(api.w, api.h) * 0.75,
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.26)');
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, api.w, api.h);
  }

  // ---- HUD ----
  function drawStatusBars(state) {
    const hero = state.player;
    const x = 16;
    const y = 16;
    panel(ctx, x - 6, y - 6, 250, 78, { fill: 'rgba(10, 12, 20, 0.66)' });
    label(ctx, 'HP', x, y + 12, { font: `700 11px ${FONT}`, color: '#f2f0e6' });
    bar(ctx, x + 52, y + 2, 112, 13, hero.hp / PLAYER.maxHp, { fill: hero.hp < 30 ? '#ff5040' : '#57d977' });
    label(ctx, String(Math.ceil(hero.hp)), x + 172, y + 13, { font: `700 12px ${FONT}`, color: '#f2f0e6' });
    label(ctx, 'ARMOR', x, y + 34, { font: `700 11px ${FONT}`, color: '#9fc4ff' });
    bar(ctx, x + 52, y + 24, 112, 13, hero.armor / PLAYER.maxArmor, { fill: '#6ea8ff' });
    label(ctx, String(Math.ceil(hero.armor)), x + 172, y + 35, { font: `700 12px ${FONT}`, color: '#9fc4ff' });
    label(ctx, `$${hero.money.toLocaleString('en-US')}`, x, y + 58, { font: `700 17px ${FONT}`, color: '#57d977' });
    label(ctx, formatClock(state.clock), x + 150, y + 58, { font: `700 15px ${FONT}`, color: '#f2f0e6' });
    if (state.saveFlash > 0) {
      label(ctx, 'Saved', x + 208, y + 58, {
        font: `700 12px ${FONT}`, color: `rgba(87, 217, 119, ${clamp(state.saveFlash, 0, 1).toFixed(2)})`,
      });
    }
    if (!hero.inCar) {
      label(ctx, hero.weapon === 'smg' ? 'SMG' : 'Pistol', x + 240, y + 13, {
        font: `700 11px ${FONT}`, color: '#ffd76e', align: 'right',
      });
    }
  }

  function drawWanted(state) {
    const x = api.w - 16;
    const y = 16;
    panel(ctx, x - 152, y - 6, 158, 40, { fill: 'rgba(10, 12, 20, 0.66)' });
    const pulse = state.time - state.starPulseT < 0.8
      ? 1 + (0.8 - (state.time - state.starPulseT)) * 0.35
      : 1;
    ctx.save();
    ctx.font = `700 ${Math.round(24 * pulse)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < WANTED_MAX; i += 1) {
      const sx = x - 138 + i * 28;
      ctx.fillStyle = i < state.wanted ? ACCENT : 'rgba(255, 255, 255, 0.22)';
      ctx.shadowColor = i < state.wanted ? 'rgba(255, 217, 59, 0.8)' : 'transparent';
      ctx.shadowBlur = i < state.wanted ? 10 : 0;
      ctx.fillText('★', sx, y + 15);
    }
    ctx.restore();
  }

  function drawSpeedo(state) {
    const hero = state.player;
    if (!hero.inCar) return;
    const car = hero.inCar;
    const mph = Math.round(smoothSpeed * 0.14);
    const x = 16;
    const y = api.h - 78;
    panel(ctx, x - 6, y - 6, 190, 68, { fill: 'rgba(10, 12, 20, 0.66)' });
    label(ctx, String(mph), x + 6, y + 32, { font: `700 34px ${FONT}`, color: '#f2f0e6' });
    label(ctx, 'MPH', x + 80, y + 32, { font: `700 13px ${FONT}`, color: '#b8b4a4' });
    label(ctx, car.spec.name, x + 6, y + 58, { font: `600 12px ${FONT}`, color: '#b8b4a4' });
    bar(ctx, x + 96, y + 50, 82, 9, car.hp / car.maxHp, {
      fill: car.hp < 35 ? '#ff5040' : '#c9c4b4',
    });
  }

  function drawObjectivePanel(world) {
    const state = world.state;
    const objective = world.currentObjective();
    const lines = [];
    if (objective) {
      lines.push({ title: objective.title, text: objective.text, color: ACCENT });
    }
    if (state.taxi && state.taxi.active) {
      const cab = state.taxi;
      const stage = cab.stage === 'pickup' ? 'Pick up the passenger' : `Drop off — $${cab.reward}`;
      const timer = cab.stage === 'dropoff' ? ` (${Math.ceil(cab.deadline)}s)` : '';
      lines.push({ title: 'Taxi job', text: stage + timer, color: '#6ea8ff' });
    }
    if (state.vigilante && !state.vigilante.paused) {
      lines.push({ title: 'Vigilante', text: 'Stop the criminal car (red outline)', color: '#ff7a6e' });
    }
    if (lines.length === 0) return;
    const w = 340;
    const h = 30 + lines.length * 40;
    const x = api.w / 2 - w / 2;
    const y = 14;
    panel(ctx, x, y, w, h, { fill: 'rgba(10, 12, 20, 0.66)' });
    lines.forEach((line, i) => {
      const ly = y + 20 + i * 40;
      label(ctx, line.title.toUpperCase(), x + 14, ly, { font: `700 11px ${FONT}`, color: line.color });
      label(ctx, line.text, x + 14, ly + 18, { font: `600 14px ${FONT}`, color: '#f2f0e6' });
    });
  }

  function drawMessageAndBanner(state) {
    if (state.message) {
      const alpha = clamp(state.message.t, 0, 1);
      pill(ctx, api.w / 2, 118, state.message.text, {
        font: `600 14px ${FONT}`,
        fill: `rgba(10, 12, 20, ${0.78 * alpha})`,
        color: `rgba(242, 240, 230, ${alpha})`,
      });
    }
    if (state.banner) {
      const t = state.banner.t;
      const alpha = t > 2.5 ? (3 - t) / 0.5 : clamp(t, 0, 1);
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      label(ctx, state.banner.title, api.w / 2, api.h * 0.3, {
        font: `800 40px ${FONT}`, color: ACCENT, align: 'center',
      });
      if (state.banner.sub) {
        label(ctx, state.banner.sub, api.w / 2, api.h * 0.3 + 34, {
          font: `600 16px ${FONT}`, color: '#f2f0e6', align: 'center',
        });
      }
      ctx.restore();
    }
  }

  function drawPromptAndHint(state, ui) {
    let y = api.h - 52;
    if (state.prompt) {
      pill(ctx, api.w / 2, y - 8, `E  —  ${state.prompt.text}`, {
        font: `700 15px ${FONT}`, fill: 'rgba(255, 217, 59, 0.92)', color: '#1a1405',
      });
      y -= 40;
    }
    if (ui.showHint && state.hint) {
      pill(ctx, api.w / 2, y - 8, state.hint, { font: `600 14px ${FONT}` });
    }
  }

  // An arrow at the screen edge pointing at an objective the camera cannot
  // see, with the distance in metres beside it.
  function drawOffscreenArrow(world) {
    const state = world.state;
    const objective = world.currentObjective();
    const target = objective && objective.target
      ? objective.target
      : state.taxi && state.taxi.active ? { x: state.taxi.x, y: state.taxi.y } : null;
    if (!target) return;
    const zoom = state.zoom * (1 + state.juice.zoomPunch);
    const sx = (target.x - state.camera.x) * zoom + api.w / 2;
    const sy = (target.y - state.camera.y) * zoom + api.h / 2;
    if (sx > 60 && sx < api.w - 60 && sy > 60 && sy < api.h - 60) return;
    const cx = api.w / 2;
    const cy = api.h / 2;
    const angle = Math.atan2(sy - cy, sx - cx);
    const ex = clamp(sx, 70, api.w - 70);
    const ey = clamp(sy, 70, api.h - 60);
    const dist = Math.round(Math.hypot(target.x - state.camera.x, target.y - state.camera.y) / 10);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(angle);
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, 11);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, -11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    label(ctx, `${dist}m`, ex, ey + 26, {
      font: `700 12px ${FONT}`, color: ACCENT, align: 'center',
    });
  }

  function drawMinimap(world) {
    const state = world.state;
    const mw = 200;
    const mh = 150;
    const x = api.w - mw - 14;
    const y = api.h - mh - 14;
    panel(ctx, x - 5, y - 5, mw + 10, mh + 10, { fill: 'rgba(8, 10, 16, 0.78)', stroke: 'rgba(255, 255, 255, 0.25)' });
    const sx = mw / WORLD_W;
    const sy = mh / WORLD_H;
    const mapX = (wx) => x + wx * sx;
    const mapY = (wy) => y + wy * sy;
    ctx.fillStyle = '#5d7a44';
    ctx.fillRect(x, y, mw, mh);
    ctx.fillStyle = '#2e7cb4';
    ctx.fillRect(mapX(WATER_X0), y, mw - WATER_X0 * sx, mh);
    ctx.fillStyle = '#e9d8a4';
    ctx.fillRect(mapX(SAND_X0), y, (WATER_X0 - SAND_X0) * sx, mh);
    ctx.strokeStyle = '#8d8a94';
    ctx.lineWidth = 2;
    for (const ax of world.city.avenues) {
      ctx.beginPath();
      ctx.moveTo(mapX(ax), y);
      ctx.lineTo(mapX(ax), y + mh);
      ctx.stroke();
    }
    for (const st of world.city.streets) {
      ctx.beginPath();
      ctx.moveTo(x, mapY(st));
      ctx.lineTo(x + mw, mapY(st));
      ctx.stroke();
    }
    for (const shop of world.city.shops) {
      ctx.fillStyle = shop.color;
      ctx.beginPath();
      ctx.arc(mapX(shop.x), mapY(shop.y), 2.5, 0, TAU);
      ctx.fill();
    }
    const objective = world.currentObjective();
    if (objective && objective.target) {
      const pulse = 3 + Math.sin(now * 4) * 1.2;
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(mapX(objective.target.x), mapY(objective.target.y), pulse, 0, TAU);
      ctx.fill();
    }
    if (state.taxi && state.taxi.active) {
      ctx.fillStyle = '#6ea8ff';
      ctx.beginPath();
      ctx.arc(mapX(state.taxi.x), mapY(state.taxi.y), 3, 0, TAU);
      ctx.fill();
    }
    if (state.vigilante && state.vigilante.target && !state.vigilante.target.wreck) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(mapX(state.vigilante.target.x), mapY(state.vigilante.target.y), 3.5, 0, TAU);
      ctx.fill();
    }
    for (const cop of state.cops) {
      ctx.fillStyle = '#4f7ad9';
      ctx.fillRect(mapX(cop.x) - 1.5, mapY(cop.y) - 1.5, 3, 3);
    }
    for (const car of state.cars) {
      if (car.driver === 'police' && !car.wreck) {
        ctx.fillStyle = '#4f7ad9';
        ctx.fillRect(mapX(car.x) - 1.5, mapY(car.y) - 1.5, 3, 3);
      }
    }
    // The player: a white arrow that turns with the hero or the car.
    const hero = state.player;
    const px = hero.inCar ? hero.inCar.x : hero.x;
    const py = hero.inCar ? hero.inCar.y : hero.y;
    const pa = hero.inCar ? hero.inCar.angle : hero.angle;
    ctx.save();
    ctx.translate(mapX(px), mapY(py));
    ctx.rotate(pa);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#20242e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, 5);
    ctx.lineTo(-5, -5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    label(ctx, 'SOLMAR CITY', x + 6, y + 12, {
      font: `700 9px ${FONT}`, color: 'rgba(255, 255, 255, 0.75)',
    });
  }

  function drawHud(world, ui) {
    const state = world.state;
    drawStatusBars(state);
    drawWanted(state);
    drawSpeedo(state);
    drawObjectivePanel(world);
    drawMessageAndBanner(state);
    drawPromptAndHint(state, ui);
    drawOffscreenArrow(world);
    drawMinimap(world);
  }

  // ---- Overlays ----
  function overlayPanel(title, titleColor, lines, footer) {
    ctx.fillStyle = 'rgba(6, 8, 14, 0.62)';
    ctx.fillRect(0, 0, api.w, api.h);
    const w = Math.min(560, api.w - 40);
    const x = (api.w - w) / 2;
    const h = 96 + lines.length * 24 + (footer ? 40 : 0);
    const y = (api.h - h) / 2;
    panel(ctx, x, y, w, h, { fill: 'rgba(12, 14, 22, 0.94)', stroke: 'rgba(255, 255, 255, 0.18)' });
    label(ctx, title, api.w / 2, y + 46, {
      font: `800 30px ${FONT}`, color: titleColor, align: 'center',
    });
    lines.forEach((line, i) => {
      label(ctx, line, api.w / 2, y + 82 + i * 24, {
        font: `600 15px ${FONT}`, color: '#f2f0e6', align: 'center',
      });
    });
    if (footer) {
      label(ctx, footer, api.w / 2, y + h - 18, {
        font: `600 13px ${FONT}`, color: '#b8b4a4', align: 'center',
      });
    }
  }

  function drawOverlay(state) {
    const overlay = state.overlay;
    if (!overlay) return;
    const data = state.overlayData || {};
    if (overlay === 'briefing') {
      const mission = data.mission;
      ctx.fillStyle = 'rgba(6, 8, 14, 0.62)';
      ctx.fillRect(0, 0, api.w, api.h);
      const w = Math.min(580, api.w - 40);
      ctx.font = `600 15px ${FONT}`;
      const briefLines = wrapText(ctx, mission.brief, w - 64);
      const h = 150 + briefLines.length * 24 + 44;
      const x = (api.w - w) / 2;
      const y = (api.h - h) / 2;
      panel(ctx, x, y, w, h, { fill: 'rgba(12, 14, 22, 0.94)', stroke: 'rgba(255, 255, 255, 0.18)' });
      label(ctx, `${mission.giver}  —  ${mission.title}`, api.w / 2, y + 40, {
        font: `800 24px ${FONT}`, color: mission.giverColor || ACCENT, align: 'center',
      });
      label(ctx, `Reward: $${mission.reward.toLocaleString('en-US')}`, api.w / 2, y + 68, {
        font: `700 15px ${FONT}`, color: '#57d977', align: 'center',
      });
      briefLines.forEach((line, i) => {
        label(ctx, line, api.w / 2, y + 102 + i * 24, {
          font: `600 15px ${FONT}`, color: '#f2f0e6', align: 'center',
        });
      });
      label(ctx, 'Enter — Accept mission    ·    Esc — Decline', api.w / 2, y + h - 20, {
        font: `600 13px ${FONT}`, color: '#b8b4a4', align: 'center',
      });
      return;
    }
    if (overlay === 'busted') {
      const lines = [`Fine: $${(data.fine || 0).toLocaleString('en-US')}`, 'You wake up at Central Precinct.'];
      if (data.failedMission) lines.push(`Mission failed: ${data.failedMission}`);
      overlayPanel('BUSTED', '#ff5040', lines, 'Press Enter to continue');
      return;
    }
    if (overlay === 'wasted') {
      const lines = [`Hospital bill: $${(data.bill || 0).toLocaleString('en-US')}`, 'You wake up at Solmar General.'];
      if (data.failedMission) lines.push(`Mission failed: ${data.failedMission}`);
      overlayPanel('WASTED', '#ff5040', lines, 'Press Enter to continue');
      return;
    }
    if (overlay === 'done') {
      overlayPanel('MISSION PASSED', '#57d977', [
        data.title || '',
        `Reward: $${(data.reward || 0).toLocaleString('en-US')}`,
      ], 'Press Enter to continue');
      return;
    }
    if (overlay === 'fail') {
      overlayPanel('MISSION FAILED', '#ff5040', [
        data.title || '',
        data.reason || '',
      ], 'Press Enter to continue');
      return;
    }
    if (overlay === 'complete') {
      overlayPanel('STORY COMPLETE', ACCENT, [
        data.title || '',
        `Reward: $${(data.reward || 0).toLocaleString('en-US')}`,
        'Every mission in Solmar City is done. The city is yours.',
      ], 'Press Enter to keep playing');
    }
  }

  // ---- Menus and screens ----
  function layoutMenu(items, selectedIndex, cx, startY) {
    const list = items || [];
    const w = 280;
    const h = 46;
    const gap = 12;
    list.forEach((item, i) => {
      const rect = { x: cx - w / 2, y: startY + i * (h + gap), w, h };
      api.buttons.push({
        id: item.id, disabled: !!item.disabled,
        x: rect.x, y: rect.y, w: rect.w, h: rect.h,
      });
      button(ctx, rect, item.label, { selected: i === selectedIndex, disabled: !!item.disabled });
    });
    return startY + list.length * (h + gap);
  }

  function drawTitle(world, ui) {
    const grad = ctx.createLinearGradient(0, 0, 0, api.h);
    grad.addColorStop(0, 'rgba(8, 10, 18, 0.55)');
    grad.addColorStop(0.45, 'rgba(8, 10, 18, 0.25)');
    grad.addColorStop(1, 'rgba(8, 10, 18, 0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, api.w, api.h);
    const cx = api.w / 2;
    const titleY = api.h * 0.24;
    ctx.save();
    ctx.font = `800 68px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    try {
      ctx.letterSpacing = '8px';
    } catch {
      // Older engines ignore letter spacing; the title still reads.
    }
    const sun = ctx.createLinearGradient(0, titleY - 34, 0, titleY + 34);
    sun.addColorStop(0, '#fff3b0');
    sun.addColorStop(0.55, ACCENT);
    sun.addColorStop(1, '#ff9a3d');
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(10, 10, 16, 0.85)';
    ctx.strokeText('SOLMAR CITY', cx, titleY);
    ctx.fillStyle = sun;
    ctx.fillText('SOLMAR CITY', cx, titleY);
    ctx.restore();
    label(ctx, 'AN OPEN-WORLD CRIME GAME', cx, titleY + 52, {
      font: `700 16px ${FONT}`, color: '#f2f0e6', align: 'center',
    });
    label(ctx, 'Steal cars. Outrun the cops. Take the city.', cx, titleY + 78, {
      font: `600 15px ${FONT}`, color: '#cfccc0', align: 'center',
    });
    const menuY = Math.max(titleY + 120, api.h * 0.46);
    layoutMenu(ui.menuItems, ui.menuIndex, cx, menuY);
    label(ctx, 'WASD drive  ·  Mouse aim  ·  E enter car  ·  Space handbrake  ·  P pause  ·  M mute  ·  F fullscreen', cx, api.h - 44, {
      font: `600 13px ${FONT}`, color: 'rgba(242, 240, 230, 0.75)', align: 'center',
    });
    label(ctx, 'A make.fun bounty entry — static files, no network, no build step', cx, api.h - 22, {
      font: `600 12px ${FONT}`, color: 'rgba(242, 240, 230, 0.5)', align: 'center',
    });
  }

  function drawHowto(ui) {
    ctx.fillStyle = 'rgba(6, 8, 14, 0.72)';
    ctx.fillRect(0, 0, api.w, api.h);
    const w = Math.min(620, api.w - 40);
    const x = (api.w - w) / 2;
    const rows = [
      ['Move / drive', 'W A S D or arrow keys'],
      ['Aim & shoot (on foot)', 'Mouse — hold left click'],
      ['Run', 'Shift'],
      ['Handbrake', 'Space'],
      ['Enter / exit car, use, buy, save', 'E'],
      ['Switch weapon (once you own the SMG)', 'Q'],
      ['Horn', 'H'],
      ['Pause', 'P or Esc'],
      ['Mute', 'M'],
      ['Fullscreen', 'F'],
    ];
    const h = 150 + rows.length * 28 + 70;
    const y = Math.max(20, (api.h - h) / 2);
    panel(ctx, x, y, w, h, { fill: 'rgba(12, 14, 22, 0.94)', stroke: 'rgba(255, 255, 255, 0.18)' });
    label(ctx, 'HOW TO PLAY', api.w / 2, y + 42, {
      font: `800 26px ${FONT}`, color: ACCENT, align: 'center',
    });
    label(ctx, 'Steal a car, lose the heat, and work up from chop-shop errands to the big score.', api.w / 2, y + 70, {
      font: `600 13px ${FONT}`, color: '#cfccc0', align: 'center',
    });
    rows.forEach((row, i) => {
      const ry = y + 104 + i * 28;
      label(ctx, row[0], x + 32, ry, { font: `600 14px ${FONT}`, color: '#f2f0e6' });
      label(ctx, row[1], x + w - 32, ry, { font: `600 14px ${FONT}`, color: ACCENT, align: 'right' });
    });
    const backY = y + h - 62;
    const backRect = { x: api.w / 2 - 110, y: backY, w: 220, h: 42 };
    api.buttons.push({
      id: 'back', disabled: false,
      x: backRect.x, y: backRect.y, w: backRect.w, h: backRect.h,
    });
    button(ctx, backRect, 'Back', { selected: true });
  }

  function drawPaused(world, ui) {
    ctx.fillStyle = 'rgba(6, 8, 14, 0.6)';
    ctx.fillRect(0, 0, api.w, api.h);
    label(ctx, 'PAUSED', api.w / 2, api.h * 0.2, {
      font: `800 40px ${FONT}`, color: '#f2f0e6', align: 'center',
    });
    layoutMenu(ui.menuItems, ui.menuIndex, api.w / 2, api.h * 0.2 + 60);
    const state = world.state;
    const stats = state.stats;
    const lines = [
      `Cash  $${state.player.money.toLocaleString('en-US')}`,
      `Missions  ${state.doneMissions.length} / 6`,
      `Packages  ${stats.packages} / 20`,
      `Play time  ${formatDuration(stats.playTime)}`,
      `Kills  ${stats.kills}   ·   Fares  ${stats.fares}`,
    ];
    lines.forEach((line, i) => {
      label(ctx, line, api.w / 2, api.h * 0.2 + 60 + ui.menuItems.length * 58 + 30 + i * 22, {
        font: `600 14px ${FONT}`, color: '#cfccc0', align: 'center',
      });
    });
  }

  // ---- The one entry point ----
  function draw(world, screen, ui) {
    now = performance.now() / 1000;
    resize();
    api.buttons = [];
    const state = world.state;
    // The speedometer eases 15% of the way to the real speed every paint,
    // so the needle sweeps instead of snapping.
    const targetSpeed = state.player && state.player.inCar ? Math.abs(state.player.inCar.speed) : 0;
    smoothSpeed += (targetSpeed - smoothSpeed) * 0.15;
    const zoom = state.zoom * (1 + state.juice.zoomPunch);
    const cam = { x: state.camera.x + state.juice.shakeX, y: state.camera.y + state.juice.shakeY };
    const view = viewRect(cam, zoom);
    ctx.save();
    ctx.translate(api.w / 2, api.h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);
    const light = drawWorld(world, view);
    ctx.restore();
    drawLightOverlays(world, light, cam, zoom);
    if (screen === SCREEN_PLAY) {
      drawHud(world, ui);
      drawOverlay(state);
    } else if (screen === SCREEN_TITLE) {
      drawTitle(world, ui);
    } else if (screen === SCREEN_HOWTO) {
      drawHowto(ui);
    } else if (screen === SCREEN_PAUSED) {
      drawHud(world, ui);
      drawPaused(world, ui);
    }
  }

  api.draw = draw;
  return api;
}
