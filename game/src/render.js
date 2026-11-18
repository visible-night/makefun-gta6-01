// Three.js scene: camera, lighting, city geometry, cars, characters, effects.
// Static geometry is merged per material (a handful of draw calls); cars and
// characters sync from the world state every frame. The camera orbits the
// player; S.camYaw is the movement basis (opposite the camera azimuth, so W
// drives away from the camera). Shadows/MSAA off on software GL, as in v4.
import * as THREE from 'three';
import { createSky } from './sky.js';
import { signTexture } from './text.js';
import { buildTextures } from './textures.js';
import {
  mergeGeoms, facadeUVs, box, xg, buildCar, buildCharacter, buildHeli,
  palmTrunkGeom, palmFrondGeom, bushGeom, lampGeom, packageGeom,
} from './models.js';
import { createJuice } from './juice.js';
import { ROADS, BLOCKS } from './city.js';
import { FOG_NEAR, FOG_FAR, SHADOW_MAP_SIZE, SHADOW_RANGE, SUN_DISTANCE, CAM_FOV } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _sv = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _dp = new THREE.Vector3();
const _dl = new THREE.Vector3();

// Flat ground plane; UVs scaled so the texture tiles square (tu/tv in tiles).
function plane(w, d, x, y, z, tu, tv) {
  const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * tu, uv.getY(i) * tv);
  return xg(g, x, y, z);
}
function disc(r, x, y, z, t) {
  const g = new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * t, uv.getY(i) * t);
  return xg(g, x, y, z);
}
function setInst(mesh, i, x, y, z, ry, s) {
  _q.setFromAxisAngle(UP, ry);
  _m.compose(_v.set(x, y, z), _q, _sv.set(s, s, s));
  mesh.setMatrixAt(i, _m);
}

export function createRenderer(container, city, S) {
  const params = new URLSearchParams(location.search);
  const lowq = params.has('lowq');
  // #game IS the canvas (see index.html): use it directly, so the WebGL
  // output lands on the visible element. A canvas element cannot show
  // child nodes, so appending a new canvas inside it would stay invisible.
  const canvas = container.tagName === 'CANVAS' ? container : document.createElement('canvas');
  if (canvas !== container) container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  const software = /swiftshader|llvmpipe|software|basic render/i.test(gpu);
  const shadows = !software && !lowq;
  renderer.setPixelRatio(lowq ? 0.5 : Math.min(window.devicePixelRatio || 1, software ? 1 : 2));
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe0ea, FOG_NEAR, FOG_FAR);
  const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 900);
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const sky = createSky(scene);
  sky.sun.castShadow = shadows;
  if (shadows) {
    sky.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    Object.assign(sky.sun.shadow.camera, { left: -SHADOW_RANGE, right: SHADOW_RANGE, top: SHADOW_RANGE, bottom: -SHADOW_RANGE, near: 10, far: 400 });
    sky.sun.shadow.bias = -0.0005;
    sky.sun.shadow.normalBias = 0.5;
    sky.sun.shadow.camera.updateProjectionMatrix();
  }
  if (!lowq) {
    const env = new THREE.Scene();
    const panel = (c, x, y, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: c }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(0xfff2d0, 0, 8, 0); panel(0xffb060, 8, 2, 0); panel(0x4a5a6a, -8, 2, 0);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.04).texture;
    scene.environmentIntensity = 0.65;
    pm.dispose();
  }
  const tex = buildTextures(S.seed);
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x555550, roughness: 0.95 });
  const asphaltMat = new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.95 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: tex.sidewalk, roughness: 0.9 });
  const sandMat = new THREE.MeshStandardMaterial({ map: tex.sand, roughness: 1 });
  const waterMat = new THREE.MeshStandardMaterial({ map: tex.water, roughness: 0.15, metalness: 0.1 });
  const grassMat = new THREE.MeshStandardMaterial({ map: tex.grass, roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.95 });
  const shopMat = new THREE.MeshStandardMaterial({ map: tex.shop, roughness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({ map: tex.glass, roughness: 0.25, metalness: 0.6 });
  const midMats = tex.mid.map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.05 }));
  const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex.paint, roughness: 0.38, metalness: 0.5 });
  const charMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex.paint, roughness: 0.7, metalness: 0.05 });
  const carGlassMat = new THREE.MeshStandardMaterial({ color: 0x18242e, transparent: true, opacity: 0.45, roughness: 0.15, metalness: 0.7, depthWrite: false });
  const markMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const lampMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.6 });
  const containerMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.3 });
  const packageMat = new THREE.MeshBasicMaterial({ color: 0x39d353 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0 });

  // Ground: base slab, asphalt roads, sidewalks, beach, ocean, park, boardwalk.
  const base = new THREE.Mesh(plane(440, 440, 0, 0, 0, 1, 1), concreteMat);
  base.receiveShadow = true; scene.add(base);
  const roadGeos = [];
  for (const r of ROADS) {
    roadGeos.push(plane(12, 440, r, 0.02, 0, 0.5, 18.3));
    roadGeos.push(plane(440, 12, 0, 0.03, r, 18.3, 0.5));
  }
  const roads = new THREE.Mesh(mergeGeoms(roadGeos.map((g) => ({ g }))), asphaltMat);
  roads.receiveShadow = true; scene.add(roads);
  const walkGeos = [];
  for (const bx of BLOCKS) for (const bz of BLOCKS) walkGeos.push(plane(28, 28, bx, 0.04, bz, 7, 7));
  const walks = new THREE.Mesh(mergeGeoms(walkGeos.map((g) => ({ g }))), sidewalkMat);
  walks.receiveShadow = true; scene.add(walks);
  const sand = new THREE.Mesh(plane(18, 440, 175, 0.05, 0, 0.75, 18.3), sandMat);
  sand.receiveShadow = true; scene.add(sand);
  const ocean = new THREE.Mesh(plane(120, 440, 244, 0.06, 0, 5, 18.3), waterMat);
  scene.add(ocean);
  const pond = new THREE.Mesh(disc(10, -100, 0.05, -100, 3), waterMat);
  scene.add(pond);
  const grass = new THREE.Mesh(disc(14, -100, 0.045, -100, 4), grassMat);
  grass.receiveShadow = true; scene.add(grass);
  const board = new THREE.Mesh(plane(12, 280, 172, 0.08, 0, 1, 20), woodMat);
  board.receiveShadow = true; scene.add(board);

  // Lane markings: centre dashes, edge lines, zebra crossings downtown.
  const marks = [];
  for (const r of ROADS) {
    for (let p = -216; p < 216; p += 8) {
      marks.push({ g: xg(box(0.35, 0.02, 3.2), r, 0.06, p), color: 0xd8b83a });
      marks.push({ g: xg(box(0.35, 0.02, 3.2), p, 0.06, r), color: 0xd8b83a });
    }
    marks.push({ g: xg(box(0.25, 0.02, 440), r - 5.4, 0.06, 0), color: 0xe8e8e8 });
    marks.push({ g: xg(box(0.25, 0.02, 440), r + 5.4, 0.06, 0), color: 0xe8e8e8 });
    marks.push({ g: xg(box(440, 0.02, 0.25), 0, 0.06, r - 5.4), color: 0xe8e8e8 });
    marks.push({ g: xg(box(440, 0.02, 0.25), 0, 0.06, r + 5.4), color: 0xe8e8e8 });
  }
  for (const rx of ROADS) for (const rz of ROADS) {
    if (Math.abs(rx) > 80 || Math.abs(rz) > 80) continue;
    for (let i = -2; i <= 2; i++) {
      marks.push({ g: xg(box(1.1, 0.02, 4.6), rx + i * 2.2, 0.065, rz - 7.5), color: 0xe8e8e8 });
      marks.push({ g: xg(box(1.1, 0.02, 4.6), rx + i * 2.2, 0.065, rz + 7.5), color: 0xe8e8e8 });
      marks.push({ g: xg(box(4.6, 0.02, 1.1), rx - 7.5, 0.065, rz + i * 2.2), color: 0xe8e8e8 });
      marks.push({ g: xg(box(4.6, 0.02, 1.1), rx + 7.5, 0.065, rz + i * 2.2), color: 0xe8e8e8 });
    }
  }
  const markMesh = new THREE.Mesh(mergeGeoms(marks), markMat);
  markMesh.receiveShadow = true; scene.add(markMesh);

  // Buildings, grouped by facade so each variant is one draw call:
  // mat 0 = facade, mat 1 = shopfront base, mat 2 = roof cap.
  const groups = {
    glass: { f: [], s: [], r: [] }, mid0: { f: [], s: [], r: [] },
    mid1: { f: [], s: [], r: [] }, mid2: { f: [], s: [], r: [] },
  };
  for (const b of city.buildings) {
    const g = groups[b.kind === 'glass' ? 'glass' : 'mid' + b.variant];
    if (b.h > 4) {
      g.s.push({ g: xg(box(b.w, 3, b.d), b.x, 1.5, b.z), mat: 1 });
      g.f.push({ g: facadeUVs(xg(box(b.w, b.h - 3, b.d), b.x, 3 + (b.h - 3) / 2, b.z), b.w, b.h - 3, b.d), mat: 0 });
    } else {
      g.f.push({ g: facadeUVs(xg(box(b.w, b.h, b.d), b.x, b.h / 2, b.z), b.w, b.h, b.d), mat: 0 });
    }
    g.r.push({ g: xg(box(b.w + 0.6, 0.4, b.d + 0.6), b.x, b.h + 0.2, b.z), mat: 2 });
  }
  const bMats = {
    glass: [glassMat, shopMat, roofMat],
    mid0: [midMats[0], shopMat, roofMat],
    mid1: [midMats[1], shopMat, roofMat],
    mid2: [midMats[2], shopMat, roofMat],
  };
  for (const key of Object.keys(groups)) {
    const g = groups[key];
    if (!g.f.length) continue;
    const mesh = new THREE.Mesh(mergeGeoms([...g.f, ...g.s, ...g.r]), bMats[key]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Signs (unlit, so they read at night too). Each sits 0.2 off its wall.
  const signs = [
    { text: 'SOLMAR BANK', x: 20, y: 12, z: 9.8, ry: Math.PI, w: 16 },
    { text: "MACK'S CHOP SHOP", x: -130.8, y: 5, z: 120, ry: Math.PI / 2, w: 10 },
    { text: 'SUNDOWN BEACH BAR', x: 170.8, y: 3.5, z: 60, ry: -Math.PI / 2, w: 8 },
    { text: 'SPRAY & GO', x: 78.2, y: 4, z: -72, ry: Math.PI / 2, w: 7 },
    { text: 'SAFEHOUSE', x: -20, y: 4, z: -132.8, ry: 0, w: 7 },
    { text: 'WAREHOUSE', x: -127.8, y: 5, z: 100, ry: Math.PI / 2, w: 8 },
  ];
  for (const s of signs) {
    const t = signTexture(s.text);
    const asp = t.image.width / t.image.height;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.w / asp), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(s.x, s.y, s.z); m.rotation.y = s.ry;
    scene.add(m);
  }

  // Instanced props: palms, bushes, lamps (+ glow), containers, packages.
  const trunk = new THREE.InstancedMesh(palmTrunkGeom(), trunkMat, city.palms.length);
  const fronds = new THREE.InstancedMesh(palmFrondGeom(), leafMat, city.palms.length);
  city.palms.forEach((p, i) => { setInst(trunk, i, p.x, 0, p.z, p.rot, p.s); setInst(fronds, i, p.x, 0, p.z, p.rot, p.s); });
  trunk.castShadow = true; fronds.castShadow = true;
  scene.add(trunk, fronds);
  const bushMesh = new THREE.InstancedMesh(bushGeom(), leafMat, city.bushes.length);
  city.bushes.forEach((b, i) => setInst(bushMesh, i, b.x, 0, b.z, 0, b.s));
  bushMesh.castShadow = true; scene.add(bushMesh);
  const lampMesh = new THREE.InstancedMesh(lampGeom(), lampMat, city.lamps.length);
  const lampGlow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), lampGlowMat, city.lamps.length);
  city.lamps.forEach((l, i) => {
    setInst(lampMesh, i, l.x, 0, l.z, 0, 1);
    setInst(lampGlow, i, l.x, 5.05, l.z + 1, 0, 1);
  });
  lampMesh.castShadow = true; scene.add(lampMesh, lampGlow);
  const contMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 2.6, 2.6), containerMat, city.containers.length);
  city.containers.forEach((c, i) => {
    setInst(contMesh, i, c.x, c.y + 1.3, c.z, c.ry, 1);
    contMesh.setColorAt(i, new THREE.Color(c.color));
  });
  contMesh.castShadow = true; contMesh.receiveShadow = true; scene.add(contMesh);
  const pkgMesh = new THREE.InstancedMesh(packageGeom(), packageMat, city.packages.length);
  scene.add(pkgMesh);

  // Beacon (objective marker): additive beam + ground ring + floating label.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd970, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 60, 12, 1, true), beaconMat);
  beam.position.y = 30;
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.2, 24), beaconMat.clone());
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
  const labelTex = signTexture('OBJECTIVE');
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthWrite: false }));
  label.scale.set(7, 7 / (labelTex.image.width / labelTex.image.height), 1);
  label.position.y = 9;
  beacon.add(beam, ring, label);
  beacon.visible = false; scene.add(beacon);
  // Headlight cones (one pair, moved to the player's car at night).
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const cones = new THREE.Group();
  const coneGeo = new THREE.ConeGeometry(1.6, 12, 10, 1, true);
  const coneL = new THREE.Mesh(coneGeo, coneMat);
  const coneR = new THREE.Mesh(coneGeo, coneMat);
  coneL.position.set(-0.6, 0.8, 6); coneR.position.set(0.6, 0.8, 6);
  coneL.rotation.x = -Math.PI / 2; coneR.rotation.x = -Math.PI / 2;
  cones.add(coneL, coneR); cones.visible = false; scene.add(cones);
  const nightLight = new THREE.PointLight(0xffd0a0, 0, 40, 2);
  scene.add(nightLight);

  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const juice = createJuice(scene, { reducedMotion });
  const heli = buildHeli(charMat);
  heli.cone.material = coneMat;
  scene.add(heli.group); heli.group.visible = false;

  // --- dynamic objects: cars, characters, helicopter ---
  const carMap = new Map();
  function syncCars() {
    const seen = new Set();
    for (const c of S.cars) {
      seen.add(c.id);
      let e = carMap.get(c.id);
      if (!e) {
        const b = buildCar(c.type, c.color, carMat, carGlassMat);
        scene.add(b.group);
        e = { group: b.group, body: b.body };
        carMap.set(c.id, e);
      }
      e.group.position.set(c.x, 0, c.z);
      e.group.rotation.y = c.angle;
      e.body.rotation.z = -c.steer * Math.min(1, Math.abs(c.speed) / 20) * 0.06;
    }
    for (const [id, e] of carMap) if (!seen.has(id)) { scene.remove(e.group); carMap.delete(id); }
  }
  const charMap = new Map();
  function charFor(key, opts) {
    let e = charMap.get(key);
    if (!e) {
      const b = buildCharacter(opts, charMat);
      b.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(b.group);
      e = { ...b, phase: 0, lx: 0, lz: 0, init: false };
      charMap.set(key, e);
    }
    return e;
  }
  // Limb swing from distance travelled; aim/seated poses override the arms.
  function syncChar(e, x, z, angle, dt, o) {
    if (!e.init) { e.lx = x; e.lz = z; e.init = true; }
    const dx = x - e.lx, dz = z - e.lz, dist = Math.hypot(dx, dz);
    e.lx = x; e.lz = z;
    const speed = dt > 0 ? Math.min(dist / dt, 12) : 0;
    const amp = Math.min(1, speed / 6) * 0.55;
    e.phase += dist * 2.4;
    const s = Math.sin(e.phase);
    e.legL.rotation.x = s * amp;
    e.legR.rotation.x = -s * amp;
    if (o.seated) {
      e.legL.rotation.x = -1.35; e.legR.rotation.x = -1.35;
      e.armL.rotation.x = -0.9; e.armR.rotation.x = -0.9;
    } else if (o.aiming) {
      e.armL.rotation.x = -0.6; e.armR.rotation.x = -1.35;
    } else {
      e.armL.rotation.x = -s * amp * 0.8;
      e.armR.rotation.x = s * amp * 0.8;
    }
    if (speed < 0.2 && !o.seated) {
      e.legL.rotation.x *= 0.8; e.legR.rotation.x *= 0.8;
      if (!o.aiming) { e.armL.rotation.x *= 0.8; e.armR.rotation.x *= 0.8; }
    }
    e.group.position.set(x + (o.ox || 0), o.y ?? 0, z + (o.oz || 0));
    e.group.rotation.y = o.aiming ? Math.atan2(o.aim.x - x, o.aim.z - z) : angle;
  }
  function syncPeople(simDt, input) {
    const p = S.player;
    const pe = charFor('player', { shirt: 0x2a4a7a, skin: 0xe8b88a, gun: true });
    if (p.inCar) {
      const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
      syncChar(pe, p.x, p.z, p.angle, simDt, {
        seated: true, y: -0.35,
        ox: -0.45 * ca + 0.3 * sa, oz: 0.45 * sa + 0.3 * ca,
      });
    } else {
      syncChar(pe, p.x, p.z, p.angle, simDt, {
        aiming: !!(input && input.mouseDown) && S.mode === 'play',
        aim: S.aim, y: 0,
      });
    }
    const seen = new Set(['player']);
    for (const ped of S.peds) {
      const e = charFor('ped' + ped.id, { shirt: ped.shirt, skin: ped.skin });
      seen.add('ped' + ped.id);
      syncChar(e, ped.x, ped.z, ped.angle, simDt, { y: 0 });
    }
    for (const n of S.named) {
      const e = charFor('named' + n.id, { shirt: n.shirt, skin: n.skin });
      seen.add('named' + n.id);
      syncChar(e, n.x, n.z, n.angle, simDt, { y: 0 });
    }
    S.guards.forEach((g, i) => {
      const e = charFor('guard' + i, { shirt: g.shirt, skin: g.skin, gun: true });
      seen.add('guard' + i);
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      syncChar(e, g.x, g.z, g.angle, simDt, { aiming: d < 30, aim: { x: p.x, z: p.z }, y: 0 });
    });
    S.cops.forEach((c, i) => {
      const e = charFor('cop' + i, { shirt: c.shirt, skin: c.skin, gun: true });
      seen.add('cop' + i);
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      syncChar(e, c.x, c.z, c.angle, simDt, { aiming: d < 30, aim: { x: p.x, z: p.z }, y: 0 });
    });
    for (const [key, e] of charMap) if (!seen.has(key)) { scene.remove(e.group); charMap.delete(key); }
  }

  // --- camera + controls ---
  let camYaw = 0, camPitch = 0.35, zoom = 1, fovKick = 0, lastMode = S.mode;
  const camPos = new THREE.Vector3(0, 35, 60);
  const camTarget = new THREE.Vector3(0, 5, 0);
  function setOrbit(yaw, pitch) { camYaw = yaw; camPitch = pitch; }
  function setZoom(f) { zoom = f; }
  function boom() { fovKick = 6; }
  function setBeacon(t) {
    if (!t) { beacon.visible = false; return; }
    beacon.visible = true;
    beacon.position.set(t.x, 0, t.z);
    if (t.label) {
      const nt = signTexture(t.label);
      label.material.map = nt;
      label.scale.set(7, 7 / (nt.image.width / nt.image.height), 1);
    }
  }

  function update(simDt, realDt, timeSec, input, target) {
    sky.update(S.time);
    sky.dome.position.copy(camera.position);
    const p = S.player;
    sky.sun.position.copy(_v.set(p.x, 0, p.z)).addScaledVector(sky.sunDir, SUN_DISTANCE);
    sky.sun.target.position.set(p.x, 0, p.z);
    sky.sun.target.updateMatrixWorld();
    const night = sky.night;
    lampGlow.visible = night > 0.3;
    nightLight.position.set(p.x, 8, p.z);
    nightLight.intensity = night * 25;
    tex.water.offset.x += realDt * 0.01;
    tex.water.offset.y += realDt * 0.004;
    if (beacon.visible) {
      beaconMat.opacity = 0.14 + Math.sin(timeSec * 3) * 0.05;
      const s = 1 + Math.sin(timeSec * 3) * 0.08;
      ring.scale.set(s, s, 1);
    }
    for (let i = 0; i < city.packages.length; i++) {
      const pkg = city.packages[i];
      if (pkg.found) { setInst(pkgMesh, i, 0, -999, 0, 0, 0.01); continue; }
      setInst(pkgMesh, i, pkg.x, 0.8 + Math.sin(timeSec * 2 + i) * 0.15, pkg.z, timeSec * 0.5 + i, 1);
    }
    pkgMesh.instanceMatrix.needsUpdate = true;
    const car = p.inCar;
    if (car && night > 0.3) {
      cones.visible = true;
      cones.position.set(car.x, 0, car.z);
      cones.rotation.y = car.angle;
    } else cones.visible = false;
    if (S.heli) {
      heli.group.visible = true;
      heli.group.position.set(S.heli.x, S.heli.y, S.heli.z);
      heli.group.rotation.y = -S.heli.a;
      heli.rotor.rotation.y += simDt * 25;
      heli.tailRotor.rotation.x += simDt * 40;
    } else heli.group.visible = false;
    syncCars();
    syncPeople(simDt, input);
    const speed = car ? Math.abs(car.speed) : Math.hypot(p.vx, p.vz);
    if (input) {
      camYaw -= (input.orbitDX || 0) * 0.005;
      camPitch = Math.min(1.1, Math.max(0.02, camPitch + (input.orbitDY || 0) * 0.003));
      if (input.wheel) zoom = Math.min(1.8, Math.max(0.6, zoom * (1 + input.wheel * 0.001)));
    }
    if (S.mode === 'title') {
      camYaw += realDt * 0.04;
      _dp.set(Math.sin(camYaw) * 60, 35, Math.cos(camYaw) * 60);
      _dl.set(0, 5, 0);
    } else {
      const dist = 11 * zoom + speed * 0.09;
      _dp.set(p.x + Math.sin(camYaw) * dist, 2.5 + dist * Math.sin(camPitch), p.z + Math.cos(camYaw) * dist);
      _dl.set(p.x, 1.6, p.z);
    }
    if (S.mode !== lastMode) { camPos.copy(_dp); camTarget.copy(_dl); lastMode = S.mode; }
    const k = 1 - Math.exp(-8 * realDt);
    camPos.lerp(_dp, k);
    camTarget.lerp(_dl, k);
    camera.position.copy(camPos);
    const tr = juice.trauma * juice.trauma;
    camera.position.x += Math.sin(timeSec * 47.3) * tr * 0.5;
    camera.position.y += Math.sin(timeSec * 39.7) * tr * 0.4;
    camera.position.z += Math.sin(timeSec * 52.1) * tr * 0.5;
    camera.lookAt(camTarget);
    camera.rotation.z += Math.sin(timeSec * 44.9) * tr * 0.06;
    fovKick *= Math.exp(-5 * realDt);
    const fov = CAM_FOV + fovKick;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    S.camYaw = camYaw + Math.PI;
    juice.update(realDt);
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  resize();
  return { renderer, juice, boom, setBeacon, update, setOrbit, setZoom };
}
