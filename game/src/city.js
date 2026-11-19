// Solmar City layout: a street grid, tower blocks, and Sundown Beach — sand,
// boardwalk, palms and ocean along the east edge. The city is data first:
// buildings[], palms[], streets[] and spawn points drive the minimap, the
// traffic, the pedestrians and the screenshot staging.
import * as THREE from 'three';
import { CFG } from './config.js';
import { makePalm, makeProp } from './models.js';

const STREET_AXES = [];
for (let v = -CFG.grid.spacing * 4.5; v <= CFG.grid.spacing * 4.5 + 1; v += CFG.grid.spacing) STREET_AXES.push(Math.round(v));

export function buildCity(tex, rng) {
  const group = new THREE.Group();
  const buildings = [];
  const palms = [];
  const streets = [];
  const lamps = [];

  // Ground: one big grass/concrete base, then roads, sidewalks, sand, ocean.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.world.half * 2 + 120, CFG.world.half * 2 + 120),
    new THREE.MeshStandardMaterial({ color: 0x6b7a52, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(40, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // Roads: dark asphalt strips along every grid axis, with sidewalk borders.
  const roadMat = new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.95 });
  const walkMat = new THREE.MeshStandardMaterial({ map: tex.sidewalk, roughness: 0.95 });
  const roadLen = CFG.world.cityHalf * 2 + 40;
  for (const a of STREET_AXES) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, CFG.grid.roadHalf * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      if (horizontal) { road.rotation.z = Math.PI / 2; road.position.set(a, 0.01, 0); }
      else road.position.set(0, 0.01, a);
      road.receiveShadow = true;
      group.add(road);
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, 4), walkMat);
      walk.rotation.x = -Math.PI / 2;
      if (horizontal) { walk.rotation.z = Math.PI / 2; walk.position.set(a + CFG.grid.roadHalf + 2, 0.02, 0); }
      else walk.position.set(0, 0.02, a + CFG.grid.roadHalf + 2);
      walk.receiveShadow = true;
      group.add(walk);
    }
    streets.push({ axis: 'x', at: a });
    streets.push({ axis: 'z', at: a });
  }

  // Beach: sand from the boardwalk to the water, ocean beyond, boardwalk planks.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(70, CFG.world.cityHalf * 2 + 40),
    new THREE.MeshStandardMaterial({ map: tex.sand, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.rotation.z = Math.PI / 2;
  sand.position.set(CFG.world.beachX + 18, 0.03, 0);
  sand.receiveShadow = true;
  group.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(90, CFG.world.cityHalf * 2 + 120),
    new THREE.MeshStandardMaterial({ map: tex.ocean, roughness: 0.35, metalness: 0.1 }));
  ocean.rotation.x = -Math.PI / 2; ocean.rotation.z = Math.PI / 2;
  ocean.position.set(CFG.world.oceanX + 40, 0.02, 0);
  group.add(ocean);
  const walk = new THREE.Mesh(
    new THREE.PlaneGeometry(10, CFG.world.cityHalf * 2 + 40),
    new THREE.MeshStandardMaterial({ map: tex.boardwalk, roughness: 0.9 }));
  walk.rotation.x = -Math.PI / 2; walk.rotation.z = Math.PI / 2;
  walk.position.set(CFG.world.boardwalkX, 0.04, 0);
  walk.receiveShadow = true;
  group.add(walk);

  // Buildings: one per block, centred BETWEEN the streets (block centres sit
  // at multiples of the grid spacing, streets at 22 + 44k) so no building
  // ever stands on a road. The bank tower — the tallest in the city — stands
  // on its own block at (44, 44), never on an intersection.
  const facadeMats = [tex.facadeA, tex.facadeB, tex.facadeC].map((t) =>
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
  const bankMat = new THREE.MeshStandardMaterial({ map: tex.facadeBank, roughness: 0.7, metalness: 0.15 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 1 });
  for (let bx = -4; bx <= 4; bx++) {
    for (let bz = -4; bz <= 4; bz++) {
      const cx = bx * CFG.grid.spacing;
      const cz = bz * CFG.grid.spacing;
      if (cx > CFG.world.cityHalf - 40) continue; // beach side stays open
      const dist = Math.hypot(cx, cz);
      const isBank = bx === 1 && bz === 1; // block centre (66, 66)
      const h = isBank ? 58 : 8 + rng.range(0, 1) * (dist < 60 ? 34 : 16);
      const w = 20 + rng.range(0, 8), d = 20 + rng.range(0, 8);
      const mat = isBank ? bankMat : facadeMats[rng.int(0, 2)];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(cx, h / 2, cz);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), roofMat);
      roof.position.set(cx, h + 0.4, cz);
      group.add(roof);
      if (isBank) {
        // Bank sign: a glowing slab on the tower crown.
        const sign = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 0.6),
          new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd75e, emissiveIntensity: 1.6 }));
        sign.position.set(cx, h + 2.2, cz + d / 2 + 0.2);
        group.add(sign);
      }
      buildings.push({ x: cx, z: cz, w, d, h, bank: isBank, mesh });
    }
  }

  // Sundown Beach Bar: a low stucco building on the boardwalk with a neon
  // sign, plus a patio of benches and umbrellas facing the ocean.
  const bar = new THREE.Group();
  const barBody = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 10),
    new THREE.MeshStandardMaterial({ map: tex.facadeC, roughness: 0.85 }));
  barBody.position.y = 2.5; barBody.castShadow = true; barBody.receiveShadow = true;
  bar.add(barBody);
  const barRoof = new THREE.Mesh(new THREE.BoxGeometry(17, 0.6, 11), roofMat);
  barRoof.position.y = 5.3; bar.add(barRoof);
  const neon = new THREE.Mesh(new THREE.BoxGeometry(10, 1.4, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff5ad0, emissiveIntensity: 2.2 }));
  neon.position.set(0, 4.2, 5.1); bar.add(neon);
  bar.position.set(CFG.world.boardwalkX + 8, 0, -24);
  group.add(bar);
  buildings.push({ x: CFG.world.boardwalkX + 8, z: -24, w: 16, d: 10, h: 5, bank: false, bar: true, mesh: barBody });

  // Palms: two rows along the boardwalk and clusters on the sand, so every
  // beach shot has them in frame.
  const palmSpots = [];
  for (let z = -200; z <= 200; z += 22) {
    palmSpots.push([CFG.world.boardwalkX - 6, z + rng.range(-4, 4)]);
    palmSpots.push([CFG.world.boardwalkX + 34, z + rng.range(-6, 6)]);
  }
  for (let i = 0; i < 18; i++) {
    palmSpots.push([CFG.world.beachX + 8 + rng.range(0, 40), rng.range(-190, 190)]);
  }
  for (const [x, z] of palmSpots) {
    const palm = makePalm(tex, 6 + rng.range(0, 3));
    palm.position.set(x, 0, z);
    palm.rotation.y = rng.range(0, Math.PI * 2);
    group.add(palm);
    palms.push({ x, z, mesh: palm });
  }

  // Props: lamps along every street corner, hydrants and benches on
  // sidewalks, umbrellas and a lifeguard tower on the sand.
  for (const a of STREET_AXES) {
    for (const b of STREET_AXES) {
      if (Math.abs(a) > CFG.world.cityHalf || Math.abs(b) > CFG.world.cityHalf) continue;
      const lamp = makeProp('lamp');
      lamp.position.set(a + CFG.grid.roadHalf + 4.5, 0, b + CFG.grid.roadHalf + 4.5);
      group.add(lamp); lamps.push(lamp);
    }
  }
  for (let i = 0; i < 24; i++) {
    const hyd = makeProp('hydrant');
    const a = STREET_AXES[rng.int(0, STREET_AXES.length - 1)];
    const b = STREET_AXES[rng.int(0, STREET_AXES.length - 1)];
    hyd.position.set(a + CFG.grid.roadHalf + 3, 0, b + rng.range(-30, 30));
    group.add(hyd);
  }
  for (let i = 0; i < 12; i++) {
    const bench = makeProp('bench');
    bench.position.set(CFG.world.boardwalkX - 3, 0, -180 + i * 32 + rng.range(-4, 4));
    bench.rotation.y = Math.PI / 2;
    group.add(bench);
  }
  for (let i = 0; i < 8; i++) {
    const um = makeProp('umbrella');
    um.position.set(CFG.world.beachX + 14 + rng.range(0, 26), 0, -160 + i * 44 + rng.range(-8, 8));
    group.add(um);
  }
  const tower = makeProp('lifeguard');
  tower.position.set(CFG.world.beachX + 26, 0, 42);
  group.add(tower);
  for (let i = 0; i < 6; i++) {
    const crate = makeProp('crate');
    crate.position.set(-120 + i * 44, 0, 198);
    group.add(crate);
  }

  return {
    group, buildings, palms, streets, lamps,
    beach: { barX: CFG.world.boardwalkX + 8, barZ: -24 },
    spawn: {
      player: { x: CFG.world.boardwalkX + 2, z: -8, angle: Math.PI / 2 },
      starterCar: { x: CFG.world.boardwalkX - 2, z: 6, angle: Math.PI / 2 },
      van: { x: -154, z: 176, angle: 0 },
      chopShop: { x: -154, z: -154 },
      pier: { x: 198, z: 198 },
    },
    // Road test for driving and traffic: on a street if either coordinate is
    // near a grid axis and inside the city.
    onRoad(x, z) {
      if (Math.abs(x) > CFG.world.cityHalf || Math.abs(z) > CFG.world.cityHalf) return false;
      const near = (v) => STREET_AXES.some((a) => Math.abs(v - a) < CFG.grid.roadHalf);
      return near(x) || near(z);
    },
    nearestStreet(x, z) {
      let best = STREET_AXES[0], bd = 1e9;
      for (const a of STREET_AXES) {
        const d = Math.min(Math.abs(x - a), Math.abs(z - a));
        if (d < bd) { bd = d; best = a; }
      }
      return best;
    },
  };
}
