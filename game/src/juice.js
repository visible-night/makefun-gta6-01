// Juice: the layer that makes actions feel physical. Trauma-based screen shake,
// hit-stop, a pooled particle system, skid marks, shockwave rings, muzzle
// flashes and screen flashes. The world feeds events in; the renderer reads the
// offsets and the lists out. Every effect honours prefers-reduced-motion.
import { JUICE } from './config.js';

const POOL_SIZE = 480;
const TAU = Math.PI * 2;

export function createJuice(rng, reduceMotion) {
  // One preallocated pool: bursts overwrite the oldest slots, so the hot path
  // never allocates and never triggers a GC hitch.
  const pool = [];
  for (let i = 0; i < POOL_SIZE; i += 1) {
    pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#ffffff', size: 3, drag: 2, gravity: 0 });
  }
  let cursor = 0;

  const juice = {
    trauma: 0,
    freezeT: 0,
    flashT: 0,
    flashMax: 1,
    flashColor: '#ffffff',
    redT: 0,
    redMax: 1,
    shakeX: 0,
    shakeY: 0,
    zoomPunch: 0,
    particles: pool,
    skids: [],
    rings: [],
    flashes: [],
    time: 0,

    addTrauma(amount) {
      if (reduceMotion) return;
      juice.trauma = Math.min(1, juice.trauma + amount);
    },

    // Freeze the simulation briefly; the render keeps going, so the moment reads.
    freeze(seconds) {
      if (reduceMotion) return;
      juice.freezeT = Math.max(juice.freezeT, seconds);
    },

    flash(seconds, color) {
      if (reduceMotion) return;
      juice.flashT = seconds;
      juice.flashMax = seconds;
      juice.flashColor = color || '#ffffff';
    },

    redPulse(seconds) {
      juice.redT = seconds;
      juice.redMax = seconds;
    },

    burst(x, y, count, color, speed, life, size, opts) {
      const o = opts || {};
      const n = reduceMotion ? Math.ceil(count / 3) : count;
      for (let i = 0; i < n; i += 1) {
        const p = pool[cursor];
        cursor = (cursor + 1) % POOL_SIZE;
        const a = o.angle !== undefined
          ? o.angle + (rng.next() - 0.5) * (o.spread ?? 1.2)
          : rng.next() * TAU;
        const s = speed * (0.3 + rng.next() * 0.7);
        p.x = x;
        p.y = y;
        p.vx = Math.cos(a) * s;
        p.vy = Math.sin(a) * s;
        p.life = life * (0.5 + rng.next() * 0.5);
        p.maxLife = life;
        p.color = Array.isArray(color) ? rng.pick(color) : color;
        p.size = size * (0.6 + rng.next() * 0.8);
        p.drag = o.drag ?? 2;
        p.gravity = o.gravity ?? 0;
      }
    },

    ring(x, y, maxR, color) {
      if (reduceMotion) return;
      juice.rings.push({ x, y, r: 8, maxR, life: 0.5, maxLife: 0.5, color: color || '#ffd76e' });
      if (juice.rings.length > 12) juice.rings.shift();
    },

    skidMark(x, y, angle) {
      if (reduceMotion) return;
      juice.skids.push({ x, y, angle, life: JUICE.skidLife });
      if (juice.skids.length > JUICE.skidMax) juice.skids.splice(0, juice.skids.length - JUICE.skidMax);
    },

    muzzle(x, y, angle) {
      if (reduceMotion) return;
      juice.flashes.push({ x, y, angle, life: 0.06, size: 14 + rng.next() * 8 });
      if (juice.flashes.length > 8) juice.flashes.shift();
    },

    // One step: decay everything and advance the live particles.
    update(dt) {
      juice.time += dt;
      juice.trauma = Math.max(0, juice.trauma - JUICE.traumaDecay * dt);
      if (juice.freezeT > 0) juice.freezeT -= dt;
      if (juice.flashT > 0) juice.flashT -= dt;
      if (juice.redT > 0) juice.redT -= dt;
      juice.zoomPunch = Math.max(0, juice.zoomPunch - dt * 3);
      // Shake follows trauma squared, so small hits stay subtle and big ones land.
      const mag = juice.trauma * juice.trauma * JUICE.shakeMax;
      const t = juice.time;
      juice.shakeX = mag * (Math.sin(t * 91) * 0.6 + Math.sin(t * 47 + 1.7) * 0.4);
      juice.shakeY = mag * (Math.cos(t * 83 + 0.6) * 0.6 + Math.sin(t * 59 + 2.9) * 0.4);
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.gravity * dt;
        const d = 1 - p.drag * dt;
        p.vx *= d;
        p.vy *= d;
      }
      for (let i = juice.skids.length - 1; i >= 0; i -= 1) {
        juice.skids[i].life -= dt;
        if (juice.skids[i].life <= 0) juice.skids.splice(i, 1);
      }
      for (let i = juice.rings.length - 1; i >= 0; i -= 1) {
        const r = juice.rings[i];
        r.life -= dt;
        const k = 1 - r.life / r.maxLife;
        r.r = 8 + (r.maxR - 8) * (1 - (1 - k) * (1 - k));
        if (r.life <= 0) juice.rings.splice(i, 1);
      }
      for (let i = juice.flashes.length - 1; i >= 0; i -= 1) {
        juice.flashes[i].life -= dt;
        if (juice.flashes[i].life <= 0) juice.flashes.splice(i, 1);
      }
    },

    // True while a hit-stop holds the simulation.
    get frozen() {
      return juice.freezeT > 0;
    },
  };
  return juice;
}
