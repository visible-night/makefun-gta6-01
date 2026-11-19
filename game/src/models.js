// Model factories for Solmar City. Every mesh is built from primitives and
// shared materials, so the whole city is authored geometry — no loaded assets.
// Cars carry their own wheel groups (spun by speed) and brake-light materials
// (flared while braking); the helicopter carries a spinning main rotor.
import * as THREE from 'three';
import { PALETTE } from './config.js';

function std(color, rough = 0.6, metal = 0.25) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}
function glow(color, intensity = 1.2) {
  return new THREE.MeshStandardMaterial({
    color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.4,
  });
}

const CAR_KINDS = {
  sedan: { len: 4.4, wid: 1.9, h: 0.62, cabin: 0.55, color: PALETTE.playerCar },
  taxi: { len: 4.4, wid: 1.9, h: 0.62, cabin: 0.55, color: PALETTE.taxi },
  cruiser: { len: 4.7, wid: 2.0, h: 0.66, cabin: 0.6, color: PALETTE.cruiser },
  sports: { len: 4.2, wid: 2.0, h: 0.5, cabin: 0.45, color: 0xd21f3c },
  van: { len: 5.0, wid: 2.1, h: 1.1, cabin: 0.9, color: 0xd8d2c4 },
  truck: { len: 6.4, wid: 2.3, h: 1.0, cabin: 1.1, color: 0x5a6b7a },
};

function makeWheel(r = 0.36) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, 0.26, 18), std(0x141414, 0.95, 0));
  tire.rotation.z = Math.PI / 2; // axle along local X after the group is placed
  tire.castShadow = true;
  g.add(tire);
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.28, 12),
    std(0xb8bcc2, 0.35, 0.85));
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  // Five spokes, so rotation is visible from the side at any speed.
  const spokeMat = std(0x3a3d42, 0.5, 0.6);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, r * 0.34, 0.08), spokeMat);
    const a = (i / 5) * Math.PI * 2;
    s.position.set(0, Math.sin(a) * r * 0.42, Math.cos(a) * r * 0.42);
    s.rotation.x = -a;
    g.add(s);
  }
  return g;
}

// A car. Returns the group plus the parts the simulation animates:
// wheels[] spin with speed, brakeMat flares while braking, headMat glows at
// night, and the light bar marks police cruisers.
export function makeCar(kindName, colorOverride) {
  const kind = CAR_KINDS[kindName] || CAR_KINDS.sedan;
  const color = colorOverride ?? kind.color;
  const g = new THREE.Group();
  const bodyMat = std(color, 0.32, 0.55);
  const glassMat = std(0x18242e, 0.12, 0.9);
  const body = new THREE.Mesh(new THREE.BoxGeometry(kind.wid, kind.h, kind.len), bodyMat);
  body.position.y = 0.55 + kind.h / 2 - 0.31;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(kind.wid * 0.86, kind.cabin, kind.len * 0.52), glassMat);
  cabin.position.set(0, body.position.y + kind.h / 2 + kind.cabin / 2 - 0.06, -kind.len * 0.04);
  cabin.castShadow = true;
  g.add(cabin);
  // Bumpers, grille, spoiler strip — the silhouette details that read at speed.
  const trim = new THREE.Mesh(new THREE.BoxGeometry(kind.wid + 0.06, 0.16, 0.14), std(0x22252a, 0.5, 0.6));
  trim.position.set(0, 0.42, kind.len / 2); g.add(trim);
  const trim2 = trim.clone(); trim2.position.z = -kind.len / 2; g.add(trim2);
  if (kindName === 'sports') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(kind.wid * 0.9, 0.06, 0.5), std(0x1a1c20, 0.4, 0.7));
    wing.position.set(0, body.position.y + kind.h / 2 + 0.28, -kind.len / 2 + 0.2);
    g.add(wing);
  }
  if (kindName === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.4), glow(0xffc93c, 1.6));
    sign.position.set(0, cabin.position.y + kind.cabin / 2 + 0.1, 0);
    g.add(sign);
  }
  if (kindName === 'cruiser') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(kind.wid * 0.5, 0.12, 0.5), glow(0x3a7bff, 2.0));
    bar.position.set(0, cabin.position.y + kind.cabin / 2 + 0.08, 0);
    g.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(kind.wid + 0.02, 0.2, kind.len * 0.9), std(0xe8e8e8, 0.5, 0.2));
    stripe.position.y = body.position.y; g.add(stripe);
  }
  // Headlights (steady glow) and brake lights (one shared material per car,
  // flared by the simulation while braking).
  const headMat = glow(0xfff2c0, 1.4);
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), headMat);
    hl.position.set(sx * (kind.wid / 2 - 0.3), 0.62, kind.len / 2 + 0.02);
    g.add(hl);
  }
  const brakeMat = glow(0xff2211, 0.55);
  const brakeGlow = new THREE.Group();
  for (const sx of [-1, 1]) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.13, 0.08), brakeMat);
    bl.position.set(sx * (kind.wid / 2 - 0.32), 0.66, -kind.len / 2 - 0.02);
    g.add(bl);
    const flare = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.5),
      new THREE.MeshBasicMaterial({
        color: 0xff3020, transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false,
      }));
    flare.position.set(sx * (kind.wid / 2 - 0.32), 0.66, -kind.len / 2 - 0.3);
    flare.rotation.y = Math.PI;
    brakeGlow.add(flare);
  }
  g.add(brakeGlow);
  // Wheels: front pair steers, all four spin. Axle along local X.
  const wheels = [];
  const wx = kind.wid / 2 - 0.05, wz = kind.len / 2 - 0.85;
  for (const [sx, sz, steer] of [[-1, 1, true], [1, 1, true], [-1, -1, false], [1, -1, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * wx, 0.36, sz * wz);
    const wheel = makeWheel();
    pivot.add(wheel);
    g.add(pivot);
    wheels.push({ pivot, wheel, steer });
  }
  return { group: g, wheels, brakeMat, brakeGlow, headMat, kind: kindName, length: kind.len };
}

// Police helicopter: body, tail, skids, a searchlight cone and a main rotor
// that spins whenever it flies. The rotor is one long thin box so its spin
// reads clearly from the ground.
export function makeHelicopter() {
  const g = new THREE.Group();
  const bodyMat = std(0x24344a, 0.4, 0.5);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 4.6), bodyMat);
  body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 1.4), std(0x18242e, 0.1, 0.9));
  glass.position.set(0, 0.25, 1.7);
  g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.4), bodyMat);
  tail.position.set(0, 0.3, -4.2);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 1.0), bodyMat);
  fin.position.set(0, 0.9, -6.2);
  g.add(fin);
  const skidMat = std(0x111418, 0.6, 0.6);
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 4.0), skidMat);
    skid.position.set(sx * 1.0, -0.95, 0.2);
    g.add(skid);
  }
  const rotor = new THREE.Group();
  rotor.position.y = 0.95;
  const bladeMat = std(0x1a1d22, 0.5, 0.7);
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), bladeMat);
    blade.rotation.y = a;
    rotor.add(blade);
  }
  g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.3), bladeMat);
  tailRotor.position.set(0.35, 0.6, -6.2);
  g.add(tailRotor);
  // Searchlight: a translucent cone under the nose, aimed down.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 14, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff6c0, transparent: true, opacity: 0.10,
      side: THREE.DoubleSide, depthWrite: false,
    }));
  cone.position.set(0, -7.5, 1.2);
  cone.rotation.x = Math.PI;
  g.add(cone);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), glow(0xfff6c0, 2.5));
  lamp.position.set(0, -0.7, 1.9);
  g.add(lamp);
  return { group: g, rotor, tailRotor, cone };
}

// A palm: a leaning trunk of stacked segments and a crown of frond planes
// using the painted frond texture, double-sided so it reads from any angle.
export function makePalm(tex, height = 7) {
  const g = new THREE.Group();
  const trunkMat = std(PALETTE.palmTrunk, 0.9, 0);
  const lean = 0.08 + Math.random() * 0.1;
  let y = 0;
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    const r0 = 0.22 - i * 0.02, r1 = 0.2 - i * 0.02;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, height / segs, 7), trunkMat);
    seg.position.set(lean * y, y + height / segs / 2, 0);
    seg.rotation.z = -lean;
    seg.castShadow = true;
    g.add(seg);
    y += height / segs;
  }
  const crown = new THREE.Group();
  crown.position.set(lean * height, height, 0);
  const frondMat = new THREE.MeshBasicMaterial({
    map: tex.palmFrond, transparent: true, side: THREE.DoubleSide, alphaTest: 0.25,
  });
  for (let i = 0; i < 8; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), frondMat);
    const a = (i / 8) * Math.PI * 2;
    f.rotation.set(-0.5 - Math.random() * 0.4, a, 0, 'YXZ');
    f.position.set(Math.cos(a) * 1.1, -0.2, Math.sin(a) * 1.1);
    crown.add(f);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), std(0x6b4a22, 0.8, 0));
  nuts.position.y = -0.35;
  crown.add(nuts);
  g.add(crown);
  return g;
}

// A pedestrian: capsule body, head, simple arms — readable at street distance,
// cheap enough for two dozen of them. Shirt and skin vary per pedestrian.
export function makePedestrian(rng) {
  const g = new THREE.Group();
  const skin = [0xc98d64, 0x8a5a3b, 0xe8b98d, 0x6b4423][rng.int(0, 3)];
  const shirt = [0x3a6fd8, 0xd83a3a, 0x3ad86b, 0xe8c93a, 0x8a3ad8, 0xe8e8e8][rng.int(0, 5)];
  const pants = [0x2a2f38, 0x4a3a28, 0x5a6b7a][rng.int(0, 2)];
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.75, 4, 8), std(shirt, 0.85, 0));
  body.position.y = 1.05; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), std(skin, 0.7, 0));
  head.position.y = 1.85; head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8, 0, Math.PI * 2, 0, 1.2),
    std([0x1a1a1a, 0x4a2a12, 0x8a8a8a][rng.int(0, 2)], 0.9, 0));
  hair.position.y = 1.9;
  g.add(hair);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.75, 6), std(pants, 0.9, 0));
    leg.position.set(sx * 0.14, 0.38, 0);
    g.add(leg);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.62, 6), std(shirt, 0.85, 0));
    arm.position.set(sx * 0.44, 1.15, 0);
    arm.rotation.z = sx * 0.12;
    g.add(arm);
  }
  return g;
}

// Small street props: hydrant, bench, street lamp, beach umbrella, lifeguard
// tower, crate stack. One function, one type string — the city places them.
export function makeProp(type) {
  const g = new THREE.Group();
  if (type === 'hydrant') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 10), std(0xc22a1e, 0.5, 0.4));
    m.position.y = 0.35; m.castShadow = true; g.add(m);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), std(0x8a1a12, 0.5, 0.4));
    cap.position.y = 0.75; g.add(cap);
  } else if (type === 'bench') {
    const wood = std(0x7a5230, 0.85, 0);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.55), wood);
    seat.position.y = 0.5; seat.castShadow = true; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.08), wood);
    back.position.set(0, 0.85, -0.25); g.add(back);
    for (const sx of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.5), std(0x222222, 0.6, 0.6));
      leg.position.set(sx, 0.25, 0); g.add(leg);
    }
  } else if (type === 'lamp') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.5, 8), std(0x2a2d33, 0.5, 0.7));
    pole.position.y = 3.25; pole.castShadow = true; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), std(0x2a2d33, 0.5, 0.7));
    arm.position.set(0.7, 6.4, 0); g.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), glow(0xffd98a, 1.8));
    bulb.position.set(1.45, 6.3, 0); g.add(bulb);
  } else if (type === 'umbrella') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), std(0xd8d2c4, 0.7, 0));
    pole.position.y = 1.2; g.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.8, 10), std(0xe8632c, 0.8, 0));
    top.position.y = 2.6; top.castShadow = true; g.add(top);
  } else if (type === 'lifeguard') {
    const wood = std(0xe8dcc0, 0.8, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.18), wood);
      leg.position.set(sx * 0.9, 1.7, sz * 0.9); leg.castShadow = true; g.add(leg);
    }
    const hut = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.6), std(0xffffff, 0.8, 0));
    hut.position.y = 4.2; hut.castShadow = true; g.add(hut);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.0, 4), std(0xc22a1e, 0.7, 0));
    roof.position.y = 5.5; roof.rotation.y = Math.PI / 4; g.add(roof);
  } else if (type === 'crate') {
    const wood = std(0x8a6a3a, 0.9, 0);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), wood);
      c.position.set((i % 2) * 0.95, 0.45 + Math.floor(i / 2) * 0.9, 0);
      c.rotation.y = i * 0.4; c.castShadow = true; g.add(c);
    }
  }
  return g;
}
