// Procedural sky dome + day cycle. One gradient dome, a sun disc, stars at night.
// update(hours) returns the lighting state the renderer applies to lights and fog.
import * as THREE from 'three';

const DAY = {
  zenith: new THREE.Color(0x2f6fb2), horizon: new THREE.Color(0xbfd9e8),
  sun: new THREE.Color(0xfff2cc), fog: new THREE.Color(0xbcd4e2),
  sunI: 3.0, hemiI: 1.35, night: 0,
};
const GOLDEN = {
  zenith: new THREE.Color(0x4a5a9e), horizon: new THREE.Color(0xffb36b),
  sun: new THREE.Color(0xff9a3d), fog: new THREE.Color(0xe8a06a),
  sunI: 2.4, hemiI: 1.1, night: 0,
};
const NIGHT = {
  zenith: new THREE.Color(0x060a18), horizon: new THREE.Color(0x16223a),
  sun: new THREE.Color(0x8fa8d8), fog: new THREE.Color(0x0d1526),
  sunI: 0.3, hemiI: 0.45, night: 1,
};
function mixState(a, b, t, out) {
  out.zenith.lerpColors(a.zenith, b.zenith, t);
  out.horizon.lerpColors(a.horizon, b.horizon, t);
  out.sun.lerpColors(a.sun, b.sun, t);
  out.fog.lerpColors(a.fog, b.fog, t);
  out.sunI = a.sunI + (b.sunI - a.sunI) * t;
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * t;
  out.night = a.night + (b.night - a.night) * t;
  return out;
}
export function createSky(scene) {
  const uniforms = {
    top: { value: new THREE.Color(0x2f6fb2) },
    bottom: { value: new THREE.Color(0xbfd9e8) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(0xfff2cc) },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(800, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 top, bottom, sunDir, sunColor;
        void main(){
          float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 c = mix(bottom, top, pow(h, 0.75));
          float s = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 600.0);
          float glow = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 8.0) * 0.25;
          gl_FragColor = vec4(c + sunColor * (s * 1.2 + glow), 1.0);
        }`,
    }),
  );
  scene.add(dome);
  // Stars: fixed points on the dome, faded in at night.
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(240 * 3);
  let n = 13;
  for (let i = 0; i < 240; i++) {
    n = (n * 16807) % 2147483647; const a = (n / 2147483647) * Math.PI * 2;
    n = (n * 16807) % 2147483647; const e = 0.15 + (n / 2147483647) * 1.3;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * 780;
    starPos[i * 3 + 1] = Math.sin(e) * 780;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 780;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);
  const state = {
    zenith: new THREE.Color(), horizon: new THREE.Color(),
    sun: new THREE.Color(), fog: new THREE.Color(),
    sunI: 2.6, hemiI: 0.9, night: 0, sunDir: new THREE.Vector3(0, 1, 0),
  };
  return {
    state,
    update(hours, cameraPos) {
      const h = ((hours % 24) + 24) % 24;
      // Sun path: rises 6:00, sets 18:30, arcs east to west.
      const dayT = (h - 6) / 12.5;
      const elev = Math.sin(clamp(dayT, -0.2, 1.2) * Math.PI) * 0.9 + 0.08;
      const azim = Math.PI * (0.15 + 0.7 * clamp(dayT, 0, 1));
      state.sunDir.set(Math.cos(azim), Math.max(elev, -0.4), Math.sin(azim) * 0.6).normalize();
      if (h < 6 || h >= 19.5) mixState(GOLDEN, NIGHT, h < 6 ? 1 : Math.min((h - 18.5) / 1, 1), state);
      else if (h < 8) mixState(NIGHT, DAY, (h - 6) / 2, state);
      else if (h < 16.5) mixState(DAY, DAY, 0, state);
      else if (h < 18.5) mixState(DAY, GOLDEN, (h - 16.5) / 2, state);
      else mixState(GOLDEN, NIGHT, (h - 18.5) / 1, state);
      uniforms.top.value.copy(state.zenith);
      uniforms.bottom.value.copy(state.horizon);
      uniforms.sunDir.value.copy(state.sunDir);
      uniforms.sunColor.value.copy(state.sun);
      stars.material.opacity = state.night * 0.9;
      dome.position.copy(cameraPos);
      stars.position.copy(cameraPos);
      return state;
    },
  };
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
