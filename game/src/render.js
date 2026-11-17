// Three.js scene: procedural city meshes, entity sync, third-person camera,
// day-cycle lighting, minimap. State lives in world.js; this file only draws it.
import * as THREE from 'three';
import { createSky } from './sky.js';
import { buildingTexture, signTexture, glowTexture } from './text.js';
import { createJuice } from './juice.js';
import { ROADS, BLOCKS } from './city.js';

// Merge coloured boxes into one geometry: one mesh per car/ped, one draw call each.
function mergeBoxes(parts) {
  const pos = [], norm = [], col = [], idx = [];
  let base = 0;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const bp = box.attributes.position.array, bn = box.attributes.normal.array, bi = box.index.array;
  for (const p of parts) {
    const c = new THREE.Color(p.color);
    for (let i = 0; i < bp.length; i += 3) {
      let x = bp[i] * p.w, y = bp[i + 1] * p.h, z = bp[i + 2] * p.d;
      if (p.ry) { const cs = Math.cos(p.ry), sn = Math.sin(p.ry); const ox = x; x = ox * cs - z * sn; z = ox * sn + z * cs; }
      pos.push(x + (p.x || 0), y + (p.y || 0), z + (p.z || 0));
      norm.push(bn[i], bn[i + 1], bn[i + 2]);
      col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < bi.length; i++) idx.push(bi[i] + base);
    base += bp.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
const VC_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 });
function instanced(geo, mat, items, shadow = false) {
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  items.forEach((it, i) => {
    Q.setFromEuler(new THREE.Euler(0, it.ry || 0, 0));
    P.set(it.x, it.y || 0, it.z);
    S.set(it.sx || 1, it.sy || 1, it.sz || 1);
    M.compose(P, Q, S);
    m.setMatrixAt(i, M);
    if (it.color !== undefined) m.setColorAt(i, new THREE.Color(it.color));
  });
  m.castShadow = shadow; m.receiveShadow = true;
  m.frustumCulled = false;
  return m;
}
// Software renderers (SwiftShader/llvmpipe) rasterize shadows and MSAA on the CPU
// at a few frames per second, so they get a degraded-but-identical-looking path:
// no shadow map, no MSAA, DPR 1. Real GPUs keep full quality.
function isSoftwareGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    return /swiftshader|software|llvmpipe/i.test(String(r));
  } catch { return false; }
}
export function createRenderer(container, city, S) {
  const canvas = document.getElementById('game');
  // ?lowq=1 forces the cheap path (headless testing, weak hardware).
  const lowq = new URLSearchParams(location.search).get('lowq') === '1';
  const software = isSoftwareGL() || lowq;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !software });
  renderer.setPixelRatio(lowq ? 0.5 : software ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !software;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5d6);
  scene.fog = new THREE.Fog(0xbcd4e2, 90, 420);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1600);
  camera.position.set(0, 30, 40);
  const hemi = new THREE.HemisphereLight(0xbbddff, 0x554433, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2cc, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 300;
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5;
  scene.add(sun); scene.add(sun.target);
  // Procedural environment for PBR reflections (no HDR file). Skipped in lowq:
  // envmap lookups are the biggest per-pixel cost in a software renderer.
  if (!lowq) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const panel = (color, intensity, x, y, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m);
    };
    panel(0xbfd9ff, 6, 0, 6, 0); panel(0xffe0b3, 3, 6, 2, 4); panel(0x40342a, 1, 0, -4, 0);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    scene.environmentIntensity = 0.7;
  }
  const sky = createSky(scene);
  const juice = createJuice(scene, { reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Ground: concrete base, beach sand, ocean, park pond ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(480, 480), new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(50, 440), new THREE.MeshStandardMaterial({ color: 0xe0c98f, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(195, 0.01, 0); sand.receiveShadow = true;
  scene.add(sand);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(400, 900), new THREE.MeshStandardMaterial({ color: 0x2e7fa8, roughness: 0.25, metalness: 0.1 }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(420, -0.1, 0);
  scene.add(ocean);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(18, 24), new THREE.MeshStandardMaterial({ color: 0x3a8ab0, roughness: 0.2 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(-120, 0.02, -120); pond.receiveShadow = true;
  scene.add(pond);
  // Roads: instanced dark strips.
  const roadItems = [];
  for (const r of ROADS) {
    roadItems.push({ x: r, y: 0.02, z: 0, sx: 12, sy: 1, sz: 400 });
    roadItems.push({ x: 0, y: 0.02, z: r, sx: 400, sy: 1, sz: 12 });
  }
  const roadGeo = new THREE.PlaneGeometry(1, 1); roadGeo.rotateX(-Math.PI / 2);
  scene.add(instanced(roadGeo, new THREE.MeshStandardMaterial({ color: 0x33363b, roughness: 0.95 }), roadItems));
  // Sidewalk slabs per block (park blocks green).
  const slabItems = [];
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    const park = bx <= -80 && bz <= -80;
    slabItems.push({ x: bx, y: 0.05, z: bz, sx: 28, sy: 1, sz: 28, color: park ? 0x6fae5f : 0x9a958a });
  }
  scene.add(instanced(roadGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), slabItems));
  // Lane dashes + zebra crossings.
  const dashItems = [];
  for (const r of ROADS) {
    for (let t = -196; t <= 196; t += 10) {
      dashItems.push({ x: r, y: 0.04, z: t, sx: 0.35, sy: 1, sz: 3, color: 0xf5d90a });
      dashItems.push({ x: t, y: 0.04, z: r, sx: 3, sy: 1, sz: 0.35, color: 0xf5d90a });
    }
  }
  scene.add(instanced(roadGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), dashItems));
  const zebraItems = [];
  for (const rx of ROADS) for (const rz of ROADS) {
    for (let k = -2; k <= 2; k++) {
      zebraItems.push({ x: rx + k * 1.4, y: 0.04, z: rz + 8, sx: 0.8, sy: 1, sz: 3, color: 0xeeeeee });
      zebraItems.push({ x: rx + 8, y: 0.04, z: rz + k * 1.4, sx: 3, sy: 1, sz: 0.8, color: 0xeeeeee });
    }
  }
  scene.add(instanced(roadGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), zebraItems));
  // Buildings: one InstancedMesh per kind, window textures, per-instance tint.
  const byKind = { glass: [], house: [], warehouse: [] };
  for (const b of city.buildings) (byKind[b.kind] || byKind.house).push(b);
  for (const [kind, list] of Object.entries(byKind)) {
    if (!list.length) continue;
    const tex = buildingTexture(kind);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: kind === 'glass' ? 0.45 : 0.85, metalness: kind === 'glass' ? 0.25 : 0.05 });
    const items = list.map((b) => ({ x: b.x, y: b.h / 2, z: b.z, sx: b.w, sy: b.h, sz: b.d, color: b.color }));
    scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat, items, true));
  }
  // Harbour containers.
  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.3 }),
    city.containers.map((c) => ({ x: c.x, y: 1.5, z: c.z, sx: 12, sy: 3, sz: 5, color: c.color })), true));
  // Streetlamps: poles + heads (heads glow at night via shared material).
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xffd98a, emissiveIntensity: 0 });
  scene.add(instanced(new THREE.CylinderGeometry(0.09, 0.12, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.6 }),
    city.lamps.map((l) => ({ x: l.x, y: 3, z: l.z }))));
  scene.add(instanced(new THREE.BoxGeometry(0.5, 0.25, 1.2), lampHeadMat,
    city.lamps.map((l) => ({ x: l.x, y: 6.1, z: l.z }))));
  // Trees: trunks + canopies (palms taller, thinner).
  scene.add(instanced(new THREE.CylinderGeometry(0.18, 0.25, 2.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }),
    city.trees.map((t) => ({ x: t.x, y: 1.2 * t.s, z: t.z, sx: t.s, sy: t.s * (t.palm ? 1.8 : 1), sz: t.s }))));
  scene.add(instanced(new THREE.ConeGeometry(1.8, 4.5, 7),
    new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 1 }),
    city.trees.map((t) => ({ x: t.x, y: (t.palm ? 5.2 : 4.2) * t.s, z: t.z, sx: t.s, sy: t.s, sz: t.s })), true));
  // Signs at landmarks.
  const signs = [
    { text: 'SOLMAR BANK', sub: '', x: 20, y: 12, z: 9.8, ry: Math.PI },
    { text: 'Sundown Beach Bar', sub: 'DRINKS • MUSIC', x: 176, y: 5, z: 54, ry: Math.PI },
    { text: 'Spray & Go', sub: 'REPAINT • $50', x: 80, y: 5.5, z: -87.2, ry: 0 },
    { text: "Mack's Chop Shop", sub: 'CASH FOR CARS', x: -120, y: 6, z: 111.8, ry: Math.PI },
    { text: 'Safehouse', sub: '', x: -20, y: 4.5, z: -136.8, ry: Math.PI },
  ];
  for (const s of signs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 3),
      new THREE.MeshBasicMaterial({ map: signTexture(s.text, { sub: s.sub }), transparent: false }));
    m.position.set(s.x, s.y, s.z); m.rotation.y = s.ry;
    scene.add(m);
  }
  // Mission beacon + package glows.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 40, 12, 1, true), beaconMat);
  beacon.position.y = 20;
  scene.add(beacon);
  const pkgMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.7),
    new THREE.MeshStandardMaterial({ color: 0x39ff88, emissive: 0x1fae54, emissiveIntensity: 1.2 }), city.packages.length);
  pkgMesh.frustumCulled = false;
  scene.add(pkgMesh);
  const M = new THREE.Matrix4();
  const updatePackages = () => {
    city.packages.forEach((p, i) => {
      M.makeScale(p.found ? 0 : 1, p.found ? 0 : 1, p.found ? 0 : 1);
      M.setPosition(p.x, 1.2, p.z);
      pkgMesh.setMatrixAt(i, M);
    });
    pkgMesh.instanceMatrix.needsUpdate = true;
  };
  updatePackages();

  // --- Entity meshes: one merged-geometry mesh per car/ped ---
  const carMeshes = new Map();
  const pedMeshes = new Map();
  const namedMeshes = new Map();
  const guardMeshes = new Map();
  const copMeshes = new Map();
  let midSeq = 1;
  function carGeometry(car) {
    const tall = car.type === 'truck';
    const parts = [
      { w: 2, h: 0.75, d: 4.4, x: 0, y: 0.62, z: 0, color: car.color },
      { w: 1.8, h: tall ? 1.1 : 0.65, d: tall ? 1.6 : 2.2, x: 0, y: tall ? 1.6 : 1.28, z: tall ? 1.2 : -0.2, color: tall ? car.color : 0x18222e },
      { w: 0.35, h: 0.7, d: 0.7, x: -0.95, y: 0.35, z: 1.4, color: 0x111111 },
      { w: 0.35, h: 0.7, d: 0.7, x: 0.95, y: 0.35, z: 1.4, color: 0x111111 },
      { w: 0.35, h: 0.7, d: 0.7, x: -0.95, y: 0.35, z: -1.4, color: 0x111111 },
      { w: 0.35, h: 0.7, d: 0.7, x: 0.95, y: 0.35, z: -1.4, color: 0x111111 },
      { w: 0.5, h: 0.25, d: 0.1, x: -0.6, y: 0.7, z: 2.22, color: 0xfff6c9 },
      { w: 0.5, h: 0.25, d: 0.1, x: 0.6, y: 0.7, z: 2.22, color: 0xfff6c9 },
      { w: 0.4, h: 0.2, d: 0.1, x: -0.6, y: 0.7, z: -2.22, color: 0xff2222 },
      { w: 0.4, h: 0.2, d: 0.1, x: 0.6, y: 0.7, z: -2.22, color: 0xff2222 },
    ];
    if (car.type === 'taxi') parts.push({ w: 0.9, h: 0.3, d: 0.5, x: 0, y: 1.75, z: -0.2, color: 0xffe93a });
    if (car.type === 'truck') parts.push({ w: 2.1, h: 1.6, d: 2.4, x: 0, y: 1.5, z: -0.9, color: 0xd8d8d8 });
    return mergeBoxes(parts);
  }
  function carMesh(car) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(carGeometry(car), VC_MAT);
    body.castShadow = true;
    g.add(body);
    if (car.type === 'police') {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff2222, emissiveIntensity: 1.5 }));
      bar.position.set(0, 1.72, -0.2);
      g.add(bar);
      g.userData.bar = bar;
    }
    // Headlight cones (player + police only, visible at night).
    if (car.type === 'police' || car.role === 'player') {
      const coneGeo = new THREE.ConeGeometry(2.2, 12, 10, 1, true);
      coneGeo.rotateX(-Math.PI / 2);
      const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
        color: 0xfff2b0, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
      }));
      cone.position.set(0, 0.8, 7);
      cone.visible = false;
      g.add(cone);
      g.userData.cone = cone;
    }
    g.userData.body = body;
    return g;
  }
  function personGeometry(shirt, skin, armed) {
    const parts = [
      { w: 0.62, h: 0.85, d: 0.36, x: 0, y: 1.05, z: 0, color: shirt },
      { w: 0.4, h: 0.4, d: 0.4, x: 0, y: 1.68, z: 0, color: skin },
      { w: 0.24, h: 0.62, d: 0.26, x: -0.18, y: 0.31, z: 0, color: 0x2a2f3a },
      { w: 0.24, h: 0.62, d: 0.26, x: 0.18, y: 0.31, z: 0, color: 0x2a2f3a },
    ];
    if (armed) parts.push({ w: 0.12, h: 0.12, d: 0.55, x: 0.35, y: 1.15, z: 0.3, color: 0x111111 });
    return mergeBoxes(parts);
  }
  function personMesh(shirt, skin, armed) {
    const m = new THREE.Mesh(personGeometry(shirt, skin, armed), VC_MAT);
    m.castShadow = true;
    return m;
  }
  // Player: red jacket, always distinct.
  const playerMesh = personMesh(0xc93a3a, 0xe8b88a, true);
  scene.add(playerMesh);
  const playerGun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  playerGun.position.set(0.35, 1.15, 0.4);
  playerMesh.add(playerGun);
  // Helicopter: body + spinning rotor + spotlight cone.
  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(mergeBoxes([
    { w: 1.8, h: 1.2, d: 4.2, x: 0, y: 0, z: 0, color: 0x1c2733 },
    { w: 1.4, h: 0.8, d: 1.4, x: 0, y: 0.2, z: 1.6, color: 0x9fc8e8 },
    { w: 0.3, h: 0.3, d: 3, x: 0, y: 0.3, z: -3.2, color: 0x1c2733 },
  ]), VC_MAT);
  heli.add(heliBody);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.35), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  rotor.position.y = 0.85;
  heli.add(rotor);
  const spotGeo = new THREE.ConeGeometry(7, 38, 12, 1, true);
  const spot = new THREE.Mesh(spotGeo, new THREE.MeshBasicMaterial({ color: 0xfff6c9, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  spot.position.y = -19;
  heli.add(spot);
  heli.visible = false;
  scene.add(heli);
  // Explosion light (one pooled point light).
  const boomLight = new THREE.PointLight(0xff7722, 0, 30, 1.5);
  scene.add(boomLight);
  function syncCars() {
    const seen = new Set();
    for (const car of S.cars) {
      seen.add(car.id);
      let g = carMeshes.get(car.id);
      if (!g) { g = carMesh(car); carMeshes.set(car.id, g); scene.add(g); }
      if (g.userData.color !== car.color) {
        g.userData.color = car.color;
        g.userData.body.geometry.dispose();
        g.userData.body.geometry = carGeometry(car);
      }
      g.position.set(car.x, 0, car.z);
      g.rotation.y = car.angle;
      // Damage: tilt + darken via smoke handled by particles; lean on speed.
      g.rotation.z = -car.steer * Math.min(1, Math.abs(car.speed) / 30) * 0.06;
      if (g.userData.bar) {
        const on = Math.floor(performance.now() / 250) % 2 === 0;
        g.userData.bar.material.emissive.setHex(on ? 0xff2222 : 0x2244ff);
      }
      if (g.userData.cone) g.userData.cone.visible = sky.state.night > 0.5;
    }
    for (const [id, g] of carMeshes) {
      if (!seen.has(id)) { scene.remove(g); carMeshes.delete(id); }
    }
  }
  function syncPeople(list, map, armed) {
    const seen = new Set();
    for (const p of list) {
      const key = p._mid ?? (p._mid = midSeq++);
      seen.add(key);
      let m = map.get(key);
      if (!m) { m = personMesh(p.shirt, p.skin, armed); map.set(key, m); scene.add(m); }
      const bob = p.speed > 0.1 ? Math.abs(Math.sin(performance.now() * 0.012 * p.speed)) * 0.06 : 0;
      m.position.set(p.x, bob, p.z);
      m.rotation.y = p.angle;
    }
    for (const [key, m] of map) {
      if (!seen.has(key)) { scene.remove(m); map.delete(key); }
    }
  }
  function syncEntities() {
    syncCars();
    syncPeople(S.peds, pedMeshes, false);
    syncPeople(S.named, namedMeshes, false);
    syncPeople(S.cops, copMeshes, false);
    syncPeople(S.guards, guardMeshes, true);
    playerMesh.visible = !S.player.inCar;
    playerMesh.position.set(S.player.x, 0, S.player.z);
    playerMesh.rotation.y = S.player.angle;
    heli.visible = !!S.heli;
    if (S.heli) {
      heli.position.set(S.heli.x, S.heli.y, S.heli.z);
      heli.rotation.y = -S.heli.a;
      rotor.rotation.y += 0.5;
      spot.lookAt(S.player.x, 0, S.player.z);
    }
    boomLight.intensity = Math.max(0, boomLight.intensity - 0.25);
  }

  // --- Minimap: static city canvas + dynamic markers ---
  const mm = document.getElementById('minimap');
  const mmCtx = mm.getContext('2d');
  const mmStatic = document.createElement('canvas');
  mmStatic.width = 200; mmStatic.height = 200;
  {
    const g = mmStatic.getContext('2d');
    const sc = (v) => (v + 220) * (200 / 440);
    g.fillStyle = '#1a2632'; g.fillRect(0, 0, 200, 200);
    g.fillStyle = '#2e7fa8'; g.fillRect(sc(220), 0, 200 - sc(220), 200);
    g.fillStyle = '#3f7d3a'; g.fillRect(sc(-165), sc(-165), sc(-75) - sc(-165), sc(-75) - sc(-165));
    g.fillStyle = '#e0c98f'; g.fillRect(sc(168), 0, sc(220) - sc(168), 200);
    g.strokeStyle = '#5a6a7a'; g.lineWidth = 3;
    for (const r of ROADS) {
      g.beginPath(); g.moveTo(sc(r), 0); g.lineTo(sc(r), 200); g.stroke();
      g.beginPath(); g.moveTo(0, sc(r)); g.lineTo(200, sc(r)); g.stroke();
    }
    g.fillStyle = '#8a94a0';
    for (const b of city.buildings) g.fillRect(sc(b.x - b.w / 2), sc(b.z - b.d / 2), Math.max(2, b.w * 200 / 440), Math.max(2, b.d * 200 / 440));
  }
  function drawMinimap(target) {
    const g = mmCtx, W = mm.width, H = mm.height;
    const sc = (v) => (v + 220) * (W / 440);
    g.clearRect(0, 0, W, H);
    g.drawImage(mmStatic, 0, 0, W, H);
    const dot = (x, z, color, r = 3) => { g.fillStyle = color; g.beginPath(); g.arc(sc(x), sc(z), r, 0, 6.29); g.fill(); };
    for (const pkg of city.packages) if (!pkg.found) dot(pkg.x, pkg.z, '#39ff88', 2);
    for (const c of S.cars) if (c.role === 'police') dot(c.x, c.z, '#3a8aff', 3);
    if (S.sideJob && S.criminal) dot(S.criminal.x, S.criminal.z, '#ff3a3a', 4);
    if (target) {
      g.fillStyle = '#ffd166';
      const tx = sc(target.x), tz = sc(target.z);
      g.save(); g.translate(tx, tz); g.rotate(Math.PI / 4); g.fillRect(-4, -4, 8, 8); g.restore();
    }
    // Player arrow.
    g.save();
    g.translate(sc(S.player.x), sc(S.player.z));
    g.rotate(Math.atan2(Math.sin(S.player.angle), Math.cos(S.player.angle)) + Math.PI / 2);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath(); g.fill();
    g.restore();
  }
  // --- Camera rig: smoothed follow + pointer-lock orbit + speed zoom ---
  let camYaw = Math.PI / 2, camPitch = 0.32, orbitYaw = 0, orbitPitch = 0, orbitHold = false, zoom = 1;
  const camPos = new THREE.Vector3(0, 30, 40);
  const camTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const R = {
    renderer, scene, camera, juice, sky,
    aim: { x: 0, z: 0 },
    get camYaw() { return camYaw; },
    boom(x, y, z) { boomLight.position.set(x, y + 2, z); boomLight.intensity = 4; },
    // Staging helpers for scripted screenshots: hold a fixed orbit offset
    // (yaw PI = camera in front, looking back at the chase) and zoom.
    setOrbit(yaw, pitch) { orbitYaw = yaw; orbitPitch = pitch; orbitHold = true; },
    setZoom(z) { zoom = z; },
    setBeacon(target) {
      if (!target) { beacon.visible = false; return; }
      beacon.visible = true;
      beacon.position.set(target.x, 20, target.z);
      beacon.material.opacity = 0.28 + Math.sin(performance.now() * 0.005) * 0.12;
    },
    updatePackages,
    onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    },
    update(dt, realDt, t, input, target) {
      // Day cycle drives sun, sky, fog and lamps.
      const st = sky.update(S.time, camera.position);
      if (scene.fog) scene.fog.color.copy(st.fog);
      sun.intensity = st.sunI;
      sun.color.copy(st.sun);
      hemi.intensity = st.hemiI;
      sun.position.set(S.player.x + st.sunDir.x * 120, st.sunDir.y * 120 + 20, S.player.z + st.sunDir.z * 120);
      sun.target.position.set(S.player.x, 0, S.player.z);
      lampHeadMat.emissiveIntensity = st.night * 2.2;
      // Camera: follow behind the heading, orbit with the mouse, zoom with the wheel.
      if (input) {
        orbitYaw -= input.orbitDX * 0.0022;
        orbitPitch = THREE.MathUtils.clamp(orbitPitch + input.orbitDY * 0.0015, -0.25, 0.45);
        zoom = THREE.MathUtils.clamp(zoom + input.wheel * 0.08, 0.65, 1.5);
        if (!input.locked && !orbitHold) { orbitYaw *= Math.pow(0.2, dt); orbitPitch *= Math.pow(0.2, dt); }
      }
      const inCar = !!S.player.inCar;
      const speed = inCar ? Math.abs(S.player.inCar.speed) : 0;
      const wantYaw = S.player.angle + orbitYaw;
      let dy = wantYaw - camYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      camYaw += dy * (1 - Math.exp(-(inCar ? 2.2 : 4.5) * dt));
      const dist = (inCar ? 12 + speed * 0.14 : 8.5) * zoom;
      const height = (inCar ? 5.2 : 3.9) + orbitPitch * 4;
      camTarget.set(
        S.player.x - Math.sin(camYaw) * dist,
        height,
        S.player.z - Math.cos(camYaw) * dist,
      );
      const k = 1 - Math.exp(-6 * dt);
      camPos.lerp(camTarget, k);
      lookTarget.set(
        S.player.x + Math.sin(S.player.angle) * 4,
        1.4,
        S.player.z + Math.cos(S.player.angle) * 4,
      );
      camera.position.copy(camPos);
      const sh = juice.shakeOffset(t);
      camera.position.x += sh.x; camera.position.y += sh.y;
      camera.lookAt(lookTarget);
      camera.rotation.z += sh.r;
      const baseFov = 60 + (inCar ? Math.min(10, speed * 0.25) : 0) + juice.fovPunch;
      if (Math.abs(camera.fov - baseFov) > 0.05) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
      S.camYaw = camYaw;
      // Aim: mouse ray onto the ground plane.
      if (input) {
        const nx = (input.mouseX / window.innerWidth) * 2 - 1;
        const ny = -(input.mouseY / window.innerHeight) * 2 + 1;
        const v = new THREE.Vector3(nx, ny, 0.5).unproject(camera);
        const dir = v.sub(camera.position).normalize();
        if (dir.y < -0.001) {
          const tt = -camera.position.y / dir.y;
          R.aim.x = THREE.MathUtils.clamp(camera.position.x + dir.x * tt, -250, 250);
          R.aim.z = THREE.MathUtils.clamp(camera.position.z + dir.z * tt, -250, 250);
        }
        S.aim.x = R.aim.x; S.aim.z = R.aim.z;
      }
      syncEntities();
      juice.update(dt, realDt, t);
      drawMinimap(target);
      renderer.render(scene, camera);
    },
  };
  window.addEventListener('resize', R.onResize);
  window.__renderer = renderer;
  window.__scene = scene;
  return R;
}
