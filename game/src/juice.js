// Juice: everything that makes Solmar City feel physical. The particle pool,
// the trauma-driven camera shake, hit-stop freezes, shockwave rings, skid
// marks, muzzle flashes, the red hurt vignette and the speed zoom punch all
// live here. The simulation triggers effects; the renderer reads the pools
// back each frame and paints them. Nothing in this module draws or touches
// the DOM, and every random draw goes through the seeded RNG so one seed
// always replays the same sparks.
//
// When the player prefers reduced motion, the shake, the flashes and the
// particles stay silent. Skid marks are static decals on the road, so they
// stay: they carry no motion of their own.
import { JUICE } from './config.js';

// One fixed pool, allocated once. Bursts reuse dead slots, so a busy
// explosion never allocates mid-frame and never stutters the game.
const POOL_SIZE = 640;

function deadParticle() {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 1, size: 2, color: '#ffffff',
    drag: 2.2, grav: 0, shrink: true,
  };
}

export function createJuice(rand, reduceMotion) {
  const calm = !!reduceMotion;
  const particles = [];
  for (let i = 0; i < POOL_SIZE; i += 1) particles.push(deadParticle());

  const juice = {
    particles,
    skids: [],
    rings: [],
    flashes: [],
    muzzles: [],
    trauma: 0,
    freezeT: 0,
    zoomPunch: 0,
    red: 0,
    shakeX: 0,
    shakeY: 0,

    // True while a hit-stop freeze is holding the world still.
    get frozen() {
      return juice.freezeT > 0;
    },

    // Spray count particles from a point. Color takes one color or a list to
    // pick from per particle. Speed is the top launch speed; each particle
    // leaves somewhere between a fifth of it and the full value. Options
    // tune the flight: drag slows the spray, grav pulls it down, ring puts
    // every particle on the rim of the burst instead of through its middle.
    burst(x, y, count, color, speed, life, size, opts) {
      if (calm) return;
      const o = opts || {};
      const drag = o.drag === undefined ? 2.2 : o.drag;
      const grav = o.grav || 0;
      const ring = !!o.ring;
      for (let n = 0; n < count; n += 1) {
        let slot = null;
        for (let i = 0; i < particles.length; i += 1) {
          if (particles[i].life <= 0) {
            slot = particles[i];
            break;
          }
        }
        if (!slot) return;
        const angle = rand.next() * Math.PI * 2;
        const power = ring ? speed : speed * (0.2 + rand.next() * 0.8);
        slot.x = x;
        slot.y = y;
        slot.vx = Math.cos(angle) * power;
        slot.vy = Math.sin(angle) * power;
        slot.maxLife = life * (0.6 + rand.next() * 0.8);
        slot.life = slot.maxLife;
        slot.size = size * (0.7 + rand.next() * 0.6);
        slot.color = Array.isArray(color) ? rand.pick(color) : color;
        slot.drag = drag;
        slot.grav = grav;
        slot.shrink = true;
      }
    },

    // A shockwave ring that grows to radius and fades.
    ring(x, y, radius, color) {
      if (calm) return;
      juice.rings.push({ x, y, maxR: radius, life: 0.5, maxLife: 0.5, color });
      if (juice.rings.length > 24) juice.rings.shift();
    },

    // A fullscreen wash of color for a few frames. The renderer draws it
    // last, over the world but under the HUD.
    flash(duration, color) {
      if (calm) return;
      juice.flashes.push({ t: duration, dur: duration, color });
      if (juice.flashes.length > 8) juice.flashes.shift();
    },

    // The red edge that closes in when the hero is hurt or the heat rises.
    // It stacks up to a cap and bleeds away on its own.
    redPulse(amount) {
      juice.red = Math.min(0.6, juice.red + amount);
    },

    // Shake is trauma squared, so small hits stay subtle and only a real
    // impact rattles the frame. Trauma decays on its own in update.
    addTrauma(amount) {
      juice.trauma = Math.min(1, juice.trauma + amount);
    },

    // Hold the world still for a beat. The renderer keeps painting and the
    // juice keeps decaying; only the simulation pauses.
    freeze(seconds) {
      if (seconds > juice.freezeT) juice.freezeT = seconds;
    },

    // The bright star at a gun barrel, gone in a few frames.
    muzzle(x, y, angle) {
      if (calm) return;
      juice.muzzles.push({ x, y, angle, life: 0.055, maxLife: 0.055 });
      if (juice.muzzles.length > 32) juice.muzzles.shift();
    },

    // One tyre mark on the asphalt. Marks fade after a few seconds and the
    // oldest goes first when the road is full of them.
    skidMark(x, y, angle) {
      juice.skids.push({ x, y, angle, life: JUICE.skidLife, maxLife: JUICE.skidLife });
      while (juice.skids.length > JUICE.skidMax) juice.skids.shift();
    },

    // Advance every effect by dt. The world calls this even while frozen,
    // so a freeze feels like the world holding its breath rather than the
    // whole game stalling.
    update(dt) {
      if (juice.freezeT > 0) juice.freezeT = Math.max(0, juice.freezeT - dt);
      if (juice.trauma > 0) juice.trauma = Math.max(0, juice.trauma - JUICE.traumaDecay * dt);
      if (juice.zoomPunch > 0) {
        juice.zoomPunch *= Math.exp(-5.5 * dt);
        if (juice.zoomPunch < 0.001) juice.zoomPunch = 0;
      }
      if (juice.red > 0) juice.red = Math.max(0, juice.red - dt * 1.4);

      // The shake offset the renderer adds to the camera. Trauma squared
      // keeps it gentle until the hits pile up.
      if (calm || juice.trauma <= 0) {
        juice.shakeX = 0;
        juice.shakeY = 0;
      } else {
        const mag = juice.trauma * juice.trauma * JUICE.shakeMax;
        juice.shakeX = (rand.next() * 2 - 1) * mag;
        juice.shakeY = (rand.next() * 2 - 1) * mag;
      }

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) continue;
        const dragK = Math.exp(-p.drag * dt);
        p.vx *= dragK;
        p.vy = p.vy * dragK + p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      for (let i = juice.rings.length - 1; i >= 0; i -= 1) {
        juice.rings[i].life -= dt;
        if (juice.rings[i].life <= 0) juice.rings.splice(i, 1);
      }
      for (let i = juice.flashes.length - 1; i >= 0; i -= 1) {
        juice.flashes[i].t -= dt;
        if (juice.flashes[i].t <= 0) juice.flashes.splice(i, 1);
      }
      for (let i = juice.muzzles.length - 1; i >= 0; i -= 1) {
        juice.muzzles[i].life -= dt;
        if (juice.muzzles[i].life <= 0) juice.muzzles.splice(i, 1);
      }
      for (let i = juice.skids.length - 1; i >= 0; i -= 1) {
        juice.skids[i].life -= dt;
        if (juice.skids[i].life <= 0) juice.skids.splice(i, 1);
      }
    },
  };

  return juice;
}
