// Juice: pooled particles, tracers, explosion flash + light, trauma shake,
// hit-stop time scale, damage vignette. Steady state allocates ~nothing:
// three fixed Points pools, a tracer pool, two flash sprites, one light.
import * as THREE from 'three';
import { glowTexture } from './text.js';

const POOL_N = 220;
const SIZES = [0.22, 0.45, 0.9];

export function createJuice(scene, opts = {}) {
  const reduced = !!opts.reducedMotion;
  const glow = glowTexture();
  const pools = SIZES.map((size) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(POOL_N * 3);
    const col = new Float32Array(POOL_N * 3);
    for (let i = 0; i < POOL_N; i++) pos[i * 3 + 1] = -999;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size, map: glow, transparent: true, depthWrite: false, vertexColors: true, sizeAttenuation: true,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    return {
      geo, pos, col, vel: new Float32Array(POOL_N * 3), base: new Float32Array(POOL_N * 3),
      life: new Float32Array(POOL_N), max: new Float32Array(POOL_N), cur: 0,
    };
  });
  const tracers = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    line.frustumCulled = false; line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  const flashes = [];
  for (let i = 0; i < 2; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: 0xffc060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.visible = false; scene.add(s);
    flashes.push({ s, life: 0 });
  }
  const flashLight = new THREE.PointLight(0xff7733, 0, 34, 2);
  scene.add(flashLight);
  const vig = document.createElement('div');
  vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;' +
    'background:radial-gradient(ellipse at center, transparent 52%, rgba(180,0,0,0.55) 100%);';
  document.body.appendChild(vig);

  const J = {
    trauma: 0, timeScale: 1, _hitT: 0, _hitScale: 1, _tracerCur: 0, _flashCur: 0,
    setVignette(v) { vig.style.opacity = String(Math.max(0, Math.min(1, v))); },
    addTrauma(a) { J.trauma = Math.min(1, J.trauma + (reduced ? a * 0.3 : a)); },
    hitStop(dur, scale) { J._hitT = Math.max(J._hitT, dur); J._hitScale = scale; },
    burst(x, y, z, n, color, size, speed = 1) {
      const pool = pools[size <= 0.3 ? 0 : size <= 0.7 ? 1 : 2];
      const c = new THREE.Color(color);
      for (let k = 0; k < n; k++) {
        const i = pool.cur; pool.cur = (pool.cur + 1) % POOL_N;
        pool.pos[i * 3] = x + (Math.random() - 0.5) * 0.4;
        pool.pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.4;
        pool.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
        const a = Math.random() * 6.283, e = (Math.random() - 0.35) * 1.6;
        const sp = (2 + Math.random() * 4) * speed;
        pool.vel[i * 3] = Math.cos(a) * Math.cos(e) * sp;
        pool.vel[i * 3 + 1] = Math.sin(e) * sp + 2.2;
        pool.vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * sp;
        pool.base[i * 3] = c.r; pool.base[i * 3 + 1] = c.g; pool.base[i * 3 + 2] = c.b;
        pool.max[i] = pool.life[i] = 0.45 + Math.random() * 0.5;
      }
    },
    tracer(x, y, z, tx, ty, tz) {
      const t = tracers[J._tracerCur]; J._tracerCur = (J._tracerCur + 1) % tracers.length;
      const p = t.line.geometry.attributes.position.array;
      p[0] = x; p[1] = y; p[2] = z; p[3] = tx; p[4] = ty; p[5] = tz;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.visible = true; t.line.material.opacity = 0.9; t.life = 0.12;
    },
    explosion(x, y, z) {
      J.burst(x, y + 0.5, z, 26, 0xff7722, 0.9, 2.5);
      J.burst(x, y + 1, z, 12, 0x666666, 0.9, 1.2);
      const f = flashes[J._flashCur]; J._flashCur = (J._flashCur + 1) % flashes.length;
      f.s.position.set(x, y + 1, z); f.s.scale.setScalar(9);
      f.s.visible = true; f.s.material.opacity = 0.95; f.life = 0.18;
      flashLight.position.set(x, y + 2, z);
      flashLight.intensity = reduced ? 0 : 30;
      J.addTrauma(0.7);
      J.hitStop(0.09, 0.2);
    },
    update(dt) {
      if (J._hitT > 0) { J._hitT -= dt; J.timeScale = J._hitScale; }
      else J.timeScale = 1;
      J.trauma = Math.max(0, J.trauma - dt * 1.3);
      for (const pool of pools) {
        let any = false;
        for (let i = 0; i < POOL_N; i++) {
          if (pool.life[i] <= 0) continue;
          any = true;
          pool.life[i] -= dt;
          if (pool.life[i] <= 0) {
            pool.pos[i * 3 + 1] = -999;
            pool.col[i * 3] = pool.col[i * 3 + 1] = pool.col[i * 3 + 2] = 0;
            continue;
          }
          pool.vel[i * 3 + 1] -= 5 * dt;
          pool.pos[i * 3] += pool.vel[i * 3] * dt;
          pool.pos[i * 3 + 1] += pool.vel[i * 3 + 1] * dt;
          pool.pos[i * 3 + 2] += pool.vel[i * 3 + 2] * dt;
          const f = pool.life[i] / pool.max[i];
          pool.col[i * 3] = pool.base[i * 3] * f;
          pool.col[i * 3 + 1] = pool.base[i * 3 + 1] * f;
          pool.col[i * 3 + 2] = pool.base[i * 3 + 2] * f;
        }
        if (any) {
          pool.geo.attributes.position.needsUpdate = true;
          pool.geo.attributes.color.needsUpdate = true;
        }
      }
      for (const t of tracers) {
        if (!t.line.visible) continue;
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.12) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
      for (const f of flashes) {
        if (!f.s.visible) continue;
        f.life -= dt;
        f.s.material.opacity = Math.max(0, f.life / 0.18) * 0.95;
        f.s.scale.multiplyScalar(1 + dt * 6);
        if (f.life <= 0) f.s.visible = false;
      }
      if (flashLight.intensity > 0) flashLight.intensity = Math.max(0, flashLight.intensity - dt * 160);
    },
  };
  return J;
}
