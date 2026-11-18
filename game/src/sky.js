// Sky dome (gradient shader + sun disc), sun + hemisphere lights, fog colour.
// One update(hours) call drives the whole day cycle: noon blue, golden-hour
// orange, night blue with lamps doing the work. The dome follows the camera.
import * as THREE from 'three';
import { FOG_NEAR, FOG_FAR } from './config.js';

// [hour, top, horizon, bottom, sun colour, sun intensity, fog]
const KEYS = [
  [0, 0x0a1226, 0x1a2438, 0x0c0c10, 0x8aa0c8, 0.30, 0x141c2a],
  [5, 0x0a1226, 0x2a2a44, 0x141018, 0x8aa0c8, 0.30, 0x1a2030],
  [7, 0x5a7ab0, 0xffb347, 0x6a4a3a, 0xffb060, 2.0, 0xe8b078],
  [10, 0x6fa8d8, 0xcfe3ee, 0x8a7a66, 0xfff2d0, 2.6, 0xcfe0ea],
  [16, 0x6fa8d8, 0xcfe3ee, 0x8a7a66, 0xfff2d0, 2.6, 0xcfe0ea],
  [18, 0x7a7ab0, 0xff9a3c, 0x6a4a3a, 0xff8a30, 2.2, 0xf0a068],
  [19.5, 0x141a30, 0x3a2a44, 0x120e14, 0x9aa0c8, 0.5, 0x1c2232],
  [22, 0x0a1226, 0x1a2438, 0x0c0c10, 0x8aa0c8, 0.30, 0x141c2a],
];
function lerp(a, b, t) { return a + (b - a) * t; }
function mixHex(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return ca.lerp(cb, t);
}

export function createSky(scene) {
  const uni = {
    top: { value: new THREE.Color(0x6fa8d8) },
    hor: { value: new THREE.Color(0xcfe3ee) },
    bot: { value: new THREE.Color(0x8a7a66) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunCol: { value: new THREE.Color(0xfff2d0) },
    sunI: { value: 2.0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(420, 24, 14),
    new THREE.ShaderMaterial({
      uniforms: uni, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vD; uniform vec3 top, hor, bot, sunDir, sunCol; uniform float sunI;
        void main(){
          vec3 d = normalize(vD);
          vec3 base = d.y >= 0.0 ? mix(hor, top, smoothstep(0.0, 0.55, d.y))
                                 : mix(hor, bot, smoothstep(0.0, -0.25, d.y));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          vec3 col = base + sunCol * (pow(s, 220.0) * 1.4 + pow(s, 18.0) * 0.28) * sunI * 0.5;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -1; dome.frustumCulled = false;
  scene.add(dome);
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x554433, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.6);
  scene.add(sun); scene.add(sun.target);
  if (!scene.fog) scene.fog = new THREE.Fog(0xcfe0ea, FOG_NEAR, FOG_FAR);
  const sky = { dome, sun, hemi, sunDir: uni.sunDir.value, night: 0 };
  sky.update = (hours) => {
    const h = ((hours % 24) + 24) % 24;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = Math.min(1, Math.max(0, (h - a[0]) / (b[0] - a[0] || 1)));
    uni.top.value.copy(mixHex(a[1], b[1], t));
    uni.hor.value.copy(mixHex(a[2], b[2], t));
    uni.bot.value.copy(mixHex(a[3], b[3], t));
    uni.sunCol.value.copy(mixHex(a[4], b[4], t));
    uni.sunI.value = lerp(a[5], b[5], t);
    scene.fog.color.copy(mixHex(a[6], b[6], t));
    const day = h >= 6 && h <= 18.5;
    const frac = day ? (h - 6) / 12.5 : 0.5;
    const el = day ? Math.sin(frac * Math.PI) * 1.1 + 0.15 : 0.9;
    const az = day ? frac * Math.PI : 3.6;
    uni.sunDir.value.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    sun.color.copy(uni.sunCol.value);
    sun.intensity = uni.sunI.value;
    hemi.intensity = day ? lerp(0.9, 0.5, Math.abs(frac - 0.5) * 2) : 0.28;
    hemi.color.setHex(day ? 0xbcd8ff : 0x2a3a55);
    hemi.groundColor.setHex(day ? 0x554433 : 0x1a1a20);
    sky.night = day ? 0 : 1;
    if (h > 18.5 || h < 6) sky.night = 1;
    else if (h < 7 || h > 17.5) sky.night = 0.5;
    else sky.night = 0;
  };
  sky.update(9);
  return sky;
}
