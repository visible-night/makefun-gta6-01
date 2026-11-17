// Game feel: pooled particles, tracers, trauma shake, hit-stop, FOV punch, flashes.
// Juice never moves the simulation — shake moves the camera, hit-stop scales time.
import * as THREE from 'three';
import { glowTexture } from './text.js';

const MAX_P = 512;
const MAX_T = 48;
export function createJuice(scene, opts = {}) {
  const reduced = opts.reducedMotion || false;
  const pos = new Float32Array(MAX_P * 3);
  const col = new Float32Array(MAX_P * 3);
  const vel = new Float32Array(MAX_P * 3);
  const life = new Float32Array(MAX_P);
  const maxLife = new Float32Array(MAX_P);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.55, map: glowTexture(), vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9,
  }));
  points.frustumCulled = false;
  scene.add(points);
  // Tracer lines (hitscan bullet paths).
  const tPos = new Float32Array(MAX_T * 6);
  const tLife = new Float32Array(MAX_T);
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  const tracers = new THREE.LineSegments(tGeo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.8 }));
  tracers.frustumCulled = false;
  scene.add(tracers);
  let pCursor = 0, tCursor = 0;
  let trauma = 0, hitStopT = 0, hitStopId = 0, fovPunch = 0;
  const flashEl = document.getElementById('flash');
  const vigEl = document.getElementById('vignette');
  const J = {
    get timeScale() { return hitStopT > 0 ? 0.06 : 1; },
    get fovPunch() { return fovPunch; },
    addTrauma(x) { if (!reduced) trauma = Math.min(1, trauma + x); },
    hitStop(sec) {
      if (reduced) return;
      const id = ++hitStopId;
      hitStopT = sec;
      setTimeout(() => { if (id === hitStopId) hitStopT = 0; }, sec * 1000);
    },
    punchFov(x) { if (!reduced) fovPunch = Math.min(10, fovPunch + x); },
    flashScreen(opacity = 0.5) {
      if (reduced || !flashEl) return;
      flashEl.style.opacity = String(opacity);
      flashEl.animate([{ opacity }, { opacity: 0 }], { duration: 120, easing: 'ease-out' })
        .onfinish = () => { flashEl.style.opacity = '0'; };
    },
    setVignette(x) { if (vigEl) vigEl.style.opacity = String(Math.min(0.7, Math.max(0, x))); },
    spawn(x, y, z, vx, vy, vz, lifeS, r, g, b) {
      const i = pCursor; pCursor = (pCursor + 1) % MAX_P;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      life[i] = lifeS; maxLife[i] = lifeS;
    },
    burst(x, y, z, n, color, speed = 6, up = 4) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
        this.spawn(x, y, z, Math.cos(a) * s, up * Math.random(), Math.sin(a) * s, 0.4 + Math.random() * 0.5,
          ((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255);
      }
    },
    explosion(x, y, z) {
      this.burst(x, y + 1, z, 36, 0xff7722, 10, 8);
      this.burst(x, y + 1, z, 20, 0xffcc66, 6, 6);
      this.burst(x, y + 1, z, 14, 0x555555, 4, 3);
      this.addTrauma(0.7); this.hitStop(0.09); this.punchFov(8); this.flashScreen(0.45);
    },
    tracer(ax, ay, az, bx, by, bz) {
      const i = tCursor; tCursor = (tCursor + 1) % MAX_T;
      tPos[i * 6] = ax; tPos[i * 6 + 1] = ay; tPos[i * 6 + 2] = az;
      tPos[i * 6 + 3] = bx; tPos[i * 6 + 4] = by; tPos[i * 6 + 5] = bz;
      tLife[i] = 0.08;
    },
    shakeOffset(t) {
      const s = trauma * trauma;
      if (s <= 0.001) return { x: 0, y: 0, r: 0 };
      return {
        x: s * 0.55 * (Math.sin(t * 39.7) + Math.sin(t * 27.3) * 0.6),
        y: s * 0.45 * (Math.cos(t * 33.1) + Math.sin(t * 41.9) * 0.6),
        r: s * 0.08 * Math.sin(t * 31.7),
      };
    },
    update(dt, realDt, t) {
      trauma = Math.max(0, trauma - 1.3 * realDt);
      fovPunch = Math.max(0, fovPunch - realDt * 30);
      for (let i = 0; i < MAX_P; i++) {
        if (life[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
        life[i] -= dt;
        vel[i * 3 + 1] -= 9 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.05) { pos[i * 3 + 1] = 0.05; vel[i * 3 + 1] *= -0.3; }
      }
      geo.attributes.position.needsUpdate = true;
      for (let i = 0; i < MAX_T; i++) {
        if (tLife[i] <= 0) continue;
        tLife[i] -= realDt;
        if (tLife[i] <= 0) { tPos[i * 6 + 1] = -999; tPos[i * 6 + 4] = -999; }
      }
      tGeo.attributes.position.needsUpdate = true;
    },
  };
  return J;
}
