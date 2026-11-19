// Sky for Solmar City: a gradient dome, a low sun disc, stars that fade in
// after dark, and a day clock that drives the light. The dome follows the
// camera so it never clips, and it never writes depth.
import * as THREE from 'three';
import { CFG } from './config.js';

export function createSky(scene) {
  // Gradient dome: warm horizon, soft middle, cooler zenith.
  const geo = new THREE.SphereGeometry(700, 24, 16);
  const top = new THREE.Color(0x3a5a8c);
  const mid = new THREE.Color(0xf2a35e);
  const bot = new THREE.Color(0x8a5a3a);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  const pos = geo.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 700;
    if (y > 0.12) c.copy(mid).lerp(top, Math.min(1, (y - 0.12) / 0.55));
    else if (y > -0.05) c.copy(bot).lerp(mid, (y + 0.05) / 0.17);
    else c.copy(bot);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  dome.renderOrder = -10;
  scene.add(dome);

  // Sun disc: a bright sprite parked on the sun direction.
  const sunTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,240,200,1)');
    grad.addColorStop(0.35, 'rgba(255,180,90,0.9)');
    grad.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, transparent: true, fog: false, depthWrite: false,
  }));
  sun.scale.set(180, 180, 1);
  scene.add(sun);

  // Stars: points on the upper dome, opacity driven by the clock.
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 500; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = 0.15 + Math.random() * 1.3;
    starPos.push(Math.cos(a) * Math.cos(e) * 680, Math.sin(e) * 680, Math.sin(a) * Math.cos(e) * 680);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false,
  }));
  scene.add(stars);

  const sunDir = new THREE.Vector3(
    Math.cos(CFG.sun.elevation) * Math.cos(CFG.sun.azimuth),
    Math.sin(CFG.sun.elevation),
    Math.cos(CFG.sun.elevation) * Math.sin(CFG.sun.azimuth));

  return {
    // timeOfDay in hours, 0..24. 18:30 is the golden-hour default.
    update(timeOfDay, camera) {
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
      const t = ((timeOfDay % 24) + 24) % 24;
      // Sun swings from east (6h) through south to west (18h); after dark it
      // drops below the horizon and the stars come out.
      const ang = ((t - 6) / 12) * Math.PI;
      const el = Math.sin(ang) * 0.9;
      const dir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(el, -0.25), 0.45).normalize();
      sun.position.copy(camera.position).addScaledVector(dir, 640);
      const night = t < 5.5 || t > 19.5;
      stars.material.opacity = night ? 0.85 : 0;
      sun.material.opacity = night ? 0 : 1;
      return { night, sunDir: dir };
    },
    sunDir,
  };
}
