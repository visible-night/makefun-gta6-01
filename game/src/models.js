// Detailed vehicle / character / prop builders (San Andreas look: real silhouettes,
// wheels, windows, limbs). Everything merges to few draw calls: cars and
// characters are vertex-coloured, one shared material, one mesh per car,
// five meshes per character (torso+head, two arms, two legs) so limbs swing.
import * as THREE from 'three';

export function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
export function xg(g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  return g;
}
// Merge parts into one non-indexed geometry. part: { g, mat = 0, color }.
// Groups follow mat runs; a color fills a vertex-colour attribute.
export function mergeGeoms(parts) {
  const pos = [], nor = [], uv = [], col = [];
  const hasColor = parts.some((p) => p.color !== undefined);
  const groups = [];
  let vBase = 0, curMat = -1, gStart = 0;
  for (const p of parts) {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    const n = g.attributes.position.count;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    if (g.attributes.uv) uv.push(...g.attributes.uv.array);
    else for (let i = 0; i < n; i++) uv.push(0, 0);
    if (hasColor) {
      const c = new THREE.Color(p.color ?? 0xffffff);
      for (let i = 0; i < n; i++) col.push(c.r, c.g, c.b);
    }
    const m = p.mat ?? 0;
    if (m !== curMat) {
      if (curMat >= 0) groups.push([gStart, vBase - gStart, curMat]);
      curMat = m; gStart = vBase;
    }
    vBase += n;
  }
  if (curMat >= 0) groups.push([gStart, vBase - gStart, curMat]);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (hasColor) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  for (const [s, c, m] of groups) out.addGroup(s, c, m);
  return out;
}
// Scale a box's UVs per face so a facade tile repeats every `tile` units.
// Box faces: px, nx, py, ny, pz, nz (4 verts each).
export function facadeUVs(g, w, h, d, tile = 8) {
  const uv = g.attributes.uv;
  const sc = (i, su, sv) => {
    for (let k = 0; k < 4; k++) uv.setXY(i + k, uv.getX(i + k) * su, uv.getY(i + k) * sv);
  };
  sc(0, d / tile, h / tile); sc(4, d / tile, h / tile);
  sc(16, w / tile, h / tile); sc(20, w / tile, h / tile);
  return g;
}

const DARK = 0x1a1c20, GLASS = 0x18242e, TYRE = 0x141414;
function wheel(x, z, r = 0.36, w = 0.26) {
  return { g: xg(new THREE.CylinderGeometry(r, r, w, 10), x, r, z, 0, 0, Math.PI / 2), color: TYRE };
}
function lights(zFront, zRear) {
  return [
    { g: xg(box(0.3, 0.12, 0.08), -0.62, 0.62, zFront), color: 0xfff2c0 },
    { g: xg(box(0.3, 0.12, 0.08), 0.62, 0.62, zFront), color: 0xfff2c0 },
    { g: xg(box(0.3, 0.12, 0.08), -0.62, 0.62, zRear), color: 0xd21f1f },
    { g: xg(box(0.3, 0.12, 0.08), 0.62, 0.62, zRear), color: 0xd21f1f },
  ];
}
// One merged mesh, vertex colours, faces +Z. type: sedan | taxi | police | truck.
// Glass goes in a second, transparent mesh so the driver shows through.
export function buildCar(type, color, mat, glassMat) {
  const P = [], G = [];
  if (type === 'truck') {
    P.push({ g: xg(box(1.9, 1.5, 1.7), 0, 1.05, 1.5), color });
    G.push({ g: xg(box(1.8, 0.7, 1.2), 0, 1.35, 1.55) });
    P.push({ g: xg(box(1.9, 0.9, 2.9), 0, 0.85, -0.9), color });
    P.push({ g: xg(box(0.08, 0.7, 2.9), -0.95, 1.15, -0.9), color: DARK });
    P.push({ g: xg(box(0.08, 0.7, 2.9), 0.95, 1.15, -0.9), color: DARK });
    P.push({ g: xg(box(1.9, 0.12, 2.9), 0, 1.35, -0.9), color: DARK });
    P.push(wheel(-0.88, 1.5, 0.44, 0.3), wheel(0.88, 1.5, 0.44, 0.3));
    P.push(wheel(-0.88, -1.2, 0.44, 0.3), wheel(0.88, -1.2, 0.44, 0.3));
    P.push(...lights(2.36, -2.36));
    P.push({ g: xg(box(1.9, 0.18, 0.1), 0, 0.45, 2.37), color: DARK });
  } else {
    P.push({ g: xg(box(1.9, 0.55, 4.4), 0, 0.58, 0), color });
    P.push({ g: xg(box(1.7, 0.5, 2.2), 0, 1.1, -0.2), color });
    G.push({ g: xg(box(1.74, 0.38, 1.9), 0, 1.12, -0.2) });
    G.push({ g: xg(box(1.5, 0.34, 0.06), 0, 1.12, 0.92) });
    G.push({ g: xg(box(1.5, 0.34, 0.06), 0, 1.12, -1.32) });
    P.push(wheel(-0.85, 1.45), wheel(0.85, 1.45), wheel(-0.85, -1.45), wheel(0.85, -1.45));
    P.push({ g: xg(box(1.9, 0.16, 0.12), 0, 0.42, 2.22), color: DARK });
    P.push({ g: xg(box(1.9, 0.16, 0.12), 0, 0.42, -2.22), color: DARK });
    P.push({ g: xg(box(0.5, 0.1, 0.06), 0, 0.62, 2.24), color: DARK }); // grille
    P.push({ g: xg(box(0.16, 0.1, 0.3), -0.98, 1.05, 0.4), color });
    P.push({ g: xg(box(0.16, 0.1, 0.3), 0.98, 1.05, 0.4), color });
    P.push(...lights(2.21, -2.21));
    if (type === 'taxi') P.push({ g: xg(box(0.55, 0.2, 0.32), 0, 1.46, -0.2), color: 0xffe9a0 });
    if (type === 'police') {
      P.push({ g: xg(box(0.5, 0.14, 0.3), -0.25, 1.44, -0.2), color: 0xd21f1f });
      P.push({ g: xg(box(0.5, 0.14, 0.3), 0.25, 1.44, -0.2), color: 0x2244dd });
      P.push({ g: xg(box(0.06, 0.5, 1.1), -0.96, 0.85, 0.1), color: 0xe8e8e8 });
      P.push({ g: xg(box(0.06, 0.5, 1.1), 0.96, 0.85, 0.1), color: 0xe8e8e8 });
    }
  }
  const mesh = new THREE.Mesh(mergeGeoms(P), mat);
  mesh.castShadow = true;
  const glass = new THREE.Mesh(mergeGeoms(G), glassMat);
  const body = new THREE.Group();
  body.add(mesh, glass);
  const group = new THREE.Group();
  group.add(body);
  return { group, body };
}
// Pedestrian / cop / guard / player. Limbs pivot at shoulder/hip for swing.
// Faces +Z. opts: { shirt, skin, pants, gun, scale }.
export function buildCharacter(opts, mat) {
  const shirt = opts.shirt, skin = opts.skin, pants = opts.pants ?? 0x2a2d34;
  const s = opts.scale ?? 1;
  const bodyGeom = mergeGeoms([
    { g: xg(box(0.44, 0.55, 0.24), 0, 1.18, 0), color: shirt },
    { g: xg(box(0.26, 0.26, 0.26), 0, 1.6, 0), color: skin },
    { g: xg(box(0.28, 0.08, 0.28), 0, 1.76, 0), color: 0x1c1a18 },
  ]);
  const body = new THREE.Mesh(bodyGeom, mat);
  body.castShadow = true;
  const limb = (x, y, parts) => {
    const grp = new THREE.Group();
    grp.position.set(x, y, 0);
    const m = new THREE.Mesh(mergeGeoms(parts), mat);
    m.castShadow = true;
    grp.add(m);
    return grp;
  };
  const arm = (x) => limb(x, 1.42, [
    { g: xg(box(0.11, 0.6, 0.13), 0, -0.3, 0), color: shirt },
    { g: xg(box(0.1, 0.1, 0.1), 0, -0.62, 0), color: skin },
  ]);
  const leg = (x) => limb(x, 0.9, [
    { g: xg(box(0.15, 0.8, 0.17), 0, -0.42, 0), color: pants },
    { g: xg(box(0.15, 0.1, 0.3), 0, -0.85, 0.05), color: 0x141210 },
  ]);
  const armL = arm(-0.28), armR = arm(0.28);
  const legL = leg(-0.1), legR = leg(0.1);
  let gun = null;
  if (opts.gun) {
    gun = new THREE.Mesh(mergeGeoms([{ g: xg(box(0.06, 0.09, 0.34), 0, -0.64, 0.1), color: 0x111111 }]), mat);
    armR.add(gun);
  }
  const group = new THREE.Group();
  group.add(body, armL, armR, legL, legR);
  group.scale.setScalar(s);
  return { group, body, armL, armR, legL, legR, gun };
}
// Police helicopter: body, tail, spinning main rotor, searchlight cone.
export function buildHeli(mat) {
  const P = [
    { g: xg(box(1.7, 1.1, 3.0), 0, 0, 0), color: 0x1c2733 },
    { g: xg(box(1.5, 0.7, 0.9), 0, 0.1, 1.35), color: GLASS },
    { g: xg(box(0.32, 0.32, 3.2), 0, 0.25, -2.8), color: 0x1c2733 },
    { g: xg(box(0.1, 1.0, 0.7), 0, 0.7, -4.3), color: 0x1c2733 },
    { g: xg(box(0.5, 0.1, 0.08), -0.6, -0.6, 0.8), color: DARK },
    { g: xg(box(0.5, 0.1, 0.08), 0.6, -0.6, 0.8), color: DARK },
    { g: xg(box(0.5, 0.1, 0.08), -0.6, -0.6, -0.8), color: DARK },
    { g: xg(box(0.5, 0.1, 0.08), 0.6, -0.6, -0.8), color: DARK },
  ];
  const body = new THREE.Mesh(mergeGeoms(P), mat);
  body.castShadow = true;
  const rotor = new THREE.Mesh(mergeGeoms([
    { g: xg(box(5.4, 0.06, 0.22), 0, 0, 0), color: DARK },
    { g: xg(box(0.22, 0.06, 5.4), 0, 0, 0), color: DARK },
  ]), mat);
  rotor.position.y = 0.75;
  const tailRotor = new THREE.Mesh(mergeGeoms([
    { g: xg(box(0.06, 1.1, 0.16), 0, 0, 0), color: DARK },
  ]), mat);
  tailRotor.position.set(-0.2, 0.7, -4.3);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  cone.position.y = -17.5;
  cone.rotation.x = Math.PI;
  const group = new THREE.Group();
  group.add(body, rotor, tailRotor, cone);
  return { group, rotor, tailRotor, cone };
}
// Instanced prop geometries (one material each, transforms per instance).
export function palmTrunkGeom() {
  return mergeGeoms([{ g: xg(new THREE.CylinderGeometry(0.13, 0.22, 3.6, 6), 0, 1.8, 0), color: 0x6a4a2a }]);
}
export function palmFrondGeom() {
  const P = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    P.push({ g: xg(box(0.22, 0.06, 2.4), 0, 3.6, 1.05, a, 0.6, 0), color: i % 2 ? 0x2f7a2a : 0x3a8a32 });
  }
  return mergeGeoms(P);
}
export function bushGeom() {
  const g = new THREE.IcosahedronGeometry(0.7, 0);
  g.scale(1, 0.7, 1);
  return mergeGeoms([{ g, color: 0x3a7a2e }]);
}
export function lampGeom() {
  return mergeGeoms([
    { g: xg(new THREE.CylinderGeometry(0.07, 0.09, 5.2, 6), 0, 2.6, 0), color: 0x22242a },
    { g: xg(box(0.08, 0.08, 1.1), 0, 5.1, 0.5), color: 0x22242a },
    { g: xg(box(0.34, 0.12, 0.2), 0, 5.05, 1.0), color: 0x333333 },
  ]);
}
export function packageGeom() { return new THREE.OctahedronGeometry(0.55); }
