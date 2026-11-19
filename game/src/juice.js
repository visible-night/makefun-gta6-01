// Game feel for Solmar City: trauma-based camera shake, hit-stop, FOV punch,
// a pooled particle burst system and a one-frame screen flash. Juice never
// touches the simulation — it only moves the camera and spawns visuals.
import * as THREE from 'three';

export function createJuice(scene, camera) {
  let trauma = 0;
  let hitStopUntil = 0;
  let hitStopId = 0;
  let fovPunch = 0;
  const baseFov = camera.fov;
  const particles = [];
  const pGeo = new THREE.BufferGeometry();
  const pCount = 240;
  const pPos = new Float32Array(pCount * 3);
  const pVel = [];
  const pLife = new Float32Array(pCount);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: 0xffc93c, size: 0.35, transparent: true, opacity: 0.9 });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  let pCursor = 0;
  for (let i = 0; i < pCount; i++) { pVel.push(new THREE.Vector3()); pPos[i * 3 + 1] = -100; }

  const flashDiv = document.createElement('div');
  flashDiv.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:40';
  document.body.appendChild(flashDiv);

  function shakeOffset(t) {
    // Summed sines at unrelated rates: smooth noise, never per-frame random.
    const s = trauma * trauma;
    return {
      x: s * 0.55 * (Math.sin(t * 39.7) * 0.6 + Math.sin(t * 23.3) * 0.4),
      y: s * 0.45 * (Math.sin(t * 44.1) * 0.6 + Math.sin(t * 29.7) * 0.4),
      roll: s * 0.09 * Math.sin(t * 31.7),
    };
  }

  return {
    addTrauma(v) { trauma = Math.min(1, trauma + v); },
    hitStop(seconds) {
      const id = ++hitStopId;
      hitStopUntil = performance.now() + seconds * 1000;
      setTimeout(() => { if (id === hitStopId) hitStopUntil = 0; }, seconds * 1000 + 30);
    },
    fovKick(v) { fovPunch = Math.min(10, fovPunch + v); },
    flash() {
      flashDiv.animate([{ opacity: 0.75 }, { opacity: 0 }], { duration: 110, easing: 'ease-out' });
    },
    // A burst of sparks/debris at a world position.
    burst(pos, color = 0xffc93c, n = 16, speed = 6) {
      pMat.color.setHex(color);
      for (let k = 0; k < n; k++) {
        const i = pCursor; pCursor = (pCursor + 1) % pCount;
        pPos[i * 3] = pos.x; pPos[i * 3 + 1] = pos.y; pPos[i * 3 + 2] = pos.z;
        const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
        pVel[i].set(Math.cos(a) * Math.cos(e), Math.abs(Math.sin(e)) + 0.4, Math.sin(a) * Math.cos(e))
          .multiplyScalar(speed * (0.5 + Math.random() * 0.8));
        pLife[i] = 0.5 + Math.random() * 0.4;
      }
      pGeo.attributes.position.needsUpdate = true;
    },
    // Returns the time scale for this frame (0.05 during hit-stop) and
    // applies the camera shake + FOV after the camera rig has run.
    update(dt, time) {
      trauma = Math.max(0, trauma - dt * 1.3);
      fovPunch = Math.max(0, fovPunch - dt * 30);
      const wantFov = baseFov + fovPunch;
      if (Math.abs(camera.fov - wantFov) > 0.01) {
        camera.fov = wantFov;
        camera.updateProjectionMatrix();
      }
      const off = shakeOffset(time);
      camera.position.x += off.x;
      camera.position.y += off.y;
      camera.rotation.z += off.roll;
      // Particles: gravity, fade by sinking the dead ones below the world.
      let any = false;
      for (let i = 0; i < pCount; i++) {
        if (pLife[i] <= 0) continue;
        any = true;
        pLife[i] -= dt;
        pVel[i].y -= 9.8 * dt;
        pPos[i * 3] += pVel[i].x * dt;
        pPos[i * 3 + 1] += pVel[i].y * dt;
        pPos[i * 3 + 2] += pVel[i].z * dt;
        if (pLife[i] <= 0 || pPos[i * 3 + 1] < 0) { pPos[i * 3 + 1] = -100; pLife[i] = 0; }
      }
      if (any) pGeo.attributes.position.needsUpdate = true;
      return performance.now() < hitStopUntil ? 0.05 : 1;
    },
    get trauma() { return trauma; },
  };
}
