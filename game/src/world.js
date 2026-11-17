// Game state and simulation: player, cars, traffic, police, helicopter, combat,
// wanted level, spawning, collisions. Pure logic — no Three.js here.
import { makeRng, clamp, dist2, angDiff } from './random.js';
import { CAR_TYPES, WEAPONS, WANTED_HEAT, COP_COUNTS, POLICE_CAR_COUNTS, HELI_STARS, PED_COUNT, TRAFFIC_COUNT, WALK_SPEED, RUN_SPEED, PLAYER_HP, START_CASH, PACKAGE_REWARD, SPRAY_COST, DAY_SECONDS } from './config.js';
import { collideCircle, nearestRoadPoint, onRoad } from './city.js';
import { createPeds, createNamed, updatePeds, witnessCrime, startDialogue } from './npcs.js';
import { updateMission, updateSideJobs, startMission, missionStartPoint } from './missions.js';

let nextCarId = 1;
export function makeCar(type, x, z, angle, role, rng) {
  const t = CAR_TYPES[type];
  return {
    id: nextCarId++, type, role, x, z, angle, speed: 0, vx: 0, vz: 0,
    steer: 0, hp: t.hp, maxHp: t.hp, color: rng.pick(t.colors),
    route: [], routeIdx: 0, brakeT: 0, honkT: 0, stuckT: 0, smokeT: 0, driver: role === 'traffic',
  };
}
export function createWorld(seed, city, save) {
  const rng = makeRng(seed);
  const L = city.landmarks;
  const S = {
    seed, rng, city, time: save?.time ?? 9.0, mode: 'title',
    player: {
      x: L.spawn.x, z: L.spawn.z, angle: Math.PI / 2, vx: 0, vz: 0,
      hp: save?.hp ?? PLAYER_HP, armour: 0, cash: save?.cash ?? START_CASH,
      weapon: 'pistol', ammo: { pistol: 60, smg: save?.hasSmg ? 120 : 0 },
      hasSmg: !!save?.hasSmg, inCar: null, fireCd: 0, dead: false,
    },
    cars: [], peds: [], named: [], guards: [], cops: [], heli: null, criminal: null,
    wanted: 0, heat: 0, missionIdx: save?.missionIdx ?? 0, mission: null, sideJob: null,
    rep: save?.rep ?? 0, flags: save?.flags ?? {}, stats: { shots: 0, kills: 0, distance: 0, stolen: 0 },
    events: [], lastBark: null, hint: '', aim: { x: 0, z: 0 }, camYaw: 0,
  };
  S.peds = createPeds(city, seed, PED_COUNT);
  S.named = createNamed();
  // Starter sedan parked by the spawn, plus parked cars around town.
  S.cars.push(Object.assign(makeCar('sedan', L.spawn.x + 6, -120, Math.PI / 2, 'parked', rng), { color: 0xa53a3a }));
  for (let i = 0; i < 8; i++) {
    const x = rng.pick([-140, -100, -60, -20, 20, 60, 100, 140]);
    const z = rng.pick([-160, -120, -80, -40, 0, 40, 80, 120, 160]);
    S.cars.push(makeCar(rng.pick(['sedan', 'sedan', 'taxi', 'truck']), x + rng.range(-3, 3), z + 8, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), 'parked', rng));
  }
  // Traffic.
  for (let i = 0; i < TRAFFIC_COUNT; i++) S.cars.push(spawnTrafficCar(S));
  // Restore found packages.
  if (save?.packages) for (const id of save.packages) { const p = city.packages[id]; if (p) p.found = true; }
  S.addHeat = (n) => { S.heat = clamp(S.heat + n, 0, 100); S.wanted = S.heat <= 0 ? 0 : Math.min(5, Math.ceil(S.heat / 20)); };
  S.spawnGuards = (at, count) => {
    S.guards = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      S.guards.push({ x: at.x + Math.cos(a) * 12, z: at.z + Math.sin(a) * 12, angle: 0, hp: 50, fireCd: 1 + i * 0.3, shirt: 0x8a3a3a, skin: 0xc98a5a, name: 'Guard' });
    }
  };
  S.spawnCriminal = () => {
    const p = nearestRoadPoint(S.player.x + 40, S.player.z);
    S.criminal = makeCar('sedan', p.x, p.z, 0, 'criminal', S.rng);
    S.criminal.color = 0x222222;
    S.cars.push(S.criminal);
  };
  S.clearCriminal = () => {
    if (S.criminal) { S.cars = S.cars.filter((c) => c !== S.criminal); S.criminal = null; }
  };
  return S;
}
function spawnTrafficCar(S) {
  const n = S.rng.pick(S.city.nodes);
  const car = makeCar(S.rng.pick(['sedan', 'sedan', 'sedan', 'taxi', 'truck']), n.x, n.z, S.rng.range(0, 6.28), 'traffic', S.rng);
  pickRoute(S, car);
  return car;
}
function pickRoute(S, car) {
  const cur = nearestRoadPoint(car.x, car.z);
  const next = S.rng.pick(S.city.nodes.filter((n) => (Math.abs(n.x - cur.x) === 40 && n.z === cur.z) || (Math.abs(n.z - cur.z) === 40 && n.x === cur.x)));
  car.route = [next || S.rng.pick(S.city.nodes)];
  car.routeIdx = 0;
}
function damageCar(S, car, dmg) {
  car.hp -= dmg;
  if (car.hp <= 0 && car.hp + dmg > 0) {
    S.events.push({ type: 'explosion', x: car.x, y: 1, z: car.z });
    S.events.push({ type: 'shake', amount: 0.6 });
    if (car === S.criminal) {
      S.player.cash += 150;
      S.events.push({ type: 'cash', amount: 150, label: 'Getaway car stopped — $150' });
      S.sideJob = null; S.criminal = null;
    }
    if (S.player.inCar === car) {
      S.player.inCar = null;
      S.player.hp -= 30;
      S.player.x = car.x + 3; S.player.z = car.z;
    }
    S.cars = S.cars.filter((c) => c !== car);
    // Chain: nearby cars take damage, nearby peds die.
    for (const other of [...S.cars]) if (dist2(other.x, other.z, car.x, car.z) < 100) damageCar(S, other, 70);
    for (const p of [...S.peds]) {
      if (dist2(p.x, p.z, car.x, car.z) < 49) {
        S.peds = S.peds.filter((q) => q !== p);
        S.events.push({ type: 'kill', x: p.x, z: p.z, kind: 'ped' });
      }
    }
  }
}
function nearestCar(S, x, z, maxD) {
  let best = null, bd = maxD * maxD;
  for (const c of S.cars) {
    const d = dist2(x, z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function witnessed(S, x, z, radius) {
  for (const p of S.peds) if (dist2(p.x, p.z, x, z) < radius * radius) return true;
  for (const c of S.cops) if (dist2(c.x, c.z, x, z) < radius * radius) return true;
  return false;
}

// --- Player on foot: camera-relative movement, aim, shooting, use key ---
function updatePlayerFoot(S, input, dt) {
  const p = S.player;
  const ax = input.axis();
  const run = input.held('run');
  const speed = run ? RUN_SPEED : WALK_SPEED;
  const fx = Math.sin(S.camYaw), fz = Math.cos(S.camYaw);
  const rx = -Math.cos(S.camYaw), rz = Math.sin(S.camYaw);
  let mx = fx * ax.y + rx * ax.x, mz = fz * ax.y + rz * ax.x;
  const ml = Math.hypot(mx, mz);
  if (ml > 0.01) { mx /= ml; mz /= ml; }
  const firing = input.mouseDown;
  // Face the aim point while firing, else face the move direction.
  if (firing) p.angle = Math.atan2(S.aim.x - p.x, S.aim.z - p.z);
  else if (ml > 0.01) {
    const target = Math.atan2(mx, mz);
    p.angle += angDiff(p.angle, target) * Math.min(1, dt * 12);
  }
  const tx = mx * speed * (ml > 0.01 ? 1 : 0), tz = mz * speed * (ml > 0.01 ? 1 : 0);
  p.vx += (tx - p.vx) * Math.min(1, dt * 10);
  p.vz += (tz - p.vz) * Math.min(1, dt * 10);
  const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
  const fixed = collideCircle(S.city, nx, nz, 0.7);
  p.x = fixed.x; p.z = fixed.z;
  S.stats.distance += Math.hypot(p.vx, p.vz) * dt;
  // Shooting: hitscan toward the aim point.
  p.fireCd -= dt;
  const w = WEAPONS[p.weapon];
  const wantFire = w.auto ? input.mouseDown : input.mousePressed;
  if (wantFire && p.fireCd <= 0 && p.ammo[p.weapon] > 0) {
    p.fireCd = 1 / w.rate;
    p.ammo[p.weapon]--;
    S.stats.shots++;
    const spread = (S.rng.next() - 0.5) * w.spread * 2;
    const dx = S.aim.x - p.x, dz = S.aim.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const dirX = dx / d, dirZ = dz / d;
    const rx2 = dirX * Math.cos(spread) - dirZ * Math.sin(spread);
    const rz2 = dirX * Math.sin(spread) + dirZ * Math.cos(spread);
    shootRay(S, p.x, p.z, rx2, rz2, w, 'player');
    if (witnessed(S, p.x, p.z, 40)) S.addHeat(WANTED_HEAT.shoot);
    if (Math.random() < 0.5) witnessCrime(S, p.x, p.z, 25, 2);
  }
  // Use key: dialogue > mission/save > enter car.
  if (input.buffered('use')) {
    input.consume('use');
    const npc = S.named.find((n) => dist2(p.x, p.z, n.x, n.z) < 16);
    if (npc) { S.events.push({ type: 'dialogue', npcId: npc.id }); return; }
    const sp = missionStartPoint(S);
    if (dist2(p.x, p.z, sp.x, sp.z) < 64) {
      if (!S.mission && S.missionIdx < 6) { startMission(S); return; }
      S.events.push({ type: 'save' });
      p.hp = Math.min(PLAYER_HP, p.hp + 25);
      return;
    }
    const car = nearestCar(S, p.x, p.z, 4.5);
    if (car) enterCar(S, car);
  }
  if (input.pressed('weapon') && p.hasSmg) {
    input.consume('weapon');
    p.weapon = p.weapon === 'pistol' ? 'smg' : 'pistol';
    S.events.push({ type: 'toast', label: p.weapon === 'smg' ? 'SMG equipped' : 'Pistol equipped' });
  }
  if (input.pressed('horn')) { input.consume('horn'); S.events.push({ type: 'horn', x: p.x, z: p.z }); }
}
function enterCar(S, car) {
  const p = S.player;
  if (car.role === 'traffic' || car.role === 'parked') {
    car.role = 'player'; car.driver = false;
    S.stats.stolen++;
    if (witnessed(S, car.x, car.z, 30)) {
      S.addHeat(WANTED_HEAT.steal);
      witnessCrime(S, car.x, car.z, 25, 5);
      S.events.push({ type: 'toast', label: 'Car stolen — someone saw you!' });
    }
  } else if (car.role === 'police') {
    car.role = 'player';
    S.addHeat(15);
  }
  p.inCar = car;
  p.x = car.x; p.z = car.z; p.angle = car.angle;
  S.events.push({ type: 'car-enter', car });
}
function exitCar(S) {
  const p = S.player, car = p.inCar;
  if (!car) return;
  p.inCar = null;
  car.speed = 0; car.vx = 0; car.vz = 0;
  p.x = car.x - Math.cos(car.angle) * 2.6;
  p.z = car.z + Math.sin(car.angle) * 2.6;
  const fixed = collideCircle(S.city, p.x, p.z, 0.7);
  p.x = fixed.x; p.z = fixed.z;
  p.angle = car.angle;
  S.events.push({ type: 'car-exit', car });
}
// Hitscan ray: nearest ped/cop/guard/car within range, else the aim point.
function shootRay(S, ox, oz, dx, dz, w, shooter) {
  let best = null, bd = w.range;
  const test = (e, r) => {
    const ex = e.x - ox, ez = e.z - oz;
    const along = ex * dx + ez * dz;
    if (along < 0 || along > bd) return;
    const perp = Math.abs(ex * dz - ez * dx);
    if (perp < r + 0.4) { bd = along; best = e; }
  };
  for (const p of S.peds) test(p, 0.7);
  for (const c of S.cops) test(c, 0.7);
  for (const g of S.guards) test(g, 0.7);
  for (const c of S.cars) test(c, 2.0);
  const hx = ox + dx * bd, hz = oz + dz * bd;
  S.events.push({ type: 'gunshot', x: ox, y: 1.4, z: oz, tx: hx, ty: 1.2, tz: hz });
  if (!best) return;
  S.events.push({ type: 'hit', x: hx, y: 1.2, z: hz });
  if (best.hp !== undefined && best.type) { // a car
    damageCar(S, best, w.dmg);
    return;
  }
  best.hp = (best.hp ?? 50) - w.dmg;
  if (best.hp <= 0) {
    S.stats.kills++;
    if (S.peds.includes(best)) {
      S.peds = S.peds.filter((q) => q !== best);
      S.addHeat(WANTED_HEAT.killPed);
      witnessCrime(S, best.x, best.z, 30, 8);
      S.events.push({ type: 'kill', x: best.x, z: best.z, kind: 'ped' });
    } else if (S.cops.includes(best)) {
      S.cops = S.cops.filter((q) => q !== best);
      S.addHeat(WANTED_HEAT.killCop);
      S.events.push({ type: 'kill', x: best.x, z: best.z, kind: 'cop' });
    } else if (S.guards.includes(best)) {
      S.guards = S.guards.filter((q) => q !== best);
      if (S.mission) S.mission.kills++;
      S.events.push({ type: 'kill', x: best.x, z: best.z, kind: 'guard' });
    }
  }
}
// --- Arcade car physics: forward speed + lateral grip, handbrake drift ---
function driveCar(S, car, throttle, steerIn, brake, dt) {
  const t = CAR_TYPES[car.type];
  const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
  let fSpeed = car.vx * fx + car.vz * fz;
  let latX = car.vx - fx * fSpeed, latZ = car.vz - fz * fSpeed;
  if (throttle > 0) fSpeed += t.accel * dt;
  else if (throttle < 0) fSpeed -= (fSpeed > 0.5 ? t.brake : t.accel * 0.6) * dt;
  fSpeed -= fSpeed * 0.4 * dt; // drag + rolling resistance
  fSpeed = clamp(fSpeed, -t.max * 0.4, t.max);
  const grip = brake ? 0.97 : 0.82;
  latX *= Math.pow(grip, dt * 60); latZ *= Math.pow(grip, dt * 60);
  car.steer += (steerIn - car.steer) * Math.min(1, dt * 8);
  const spd = Math.abs(fSpeed);
  car.angle += car.steer * t.turn * clamp(spd / 12, 0, 1) * (fSpeed >= 0 ? 1 : -1) * dt;
  const nfx = Math.sin(car.angle), nfz = Math.cos(car.angle);
  car.vx = nfx * fSpeed + latX;
  car.vz = nfz * fSpeed + latZ;
  car.speed = fSpeed;
  const nx = car.x + car.vx * dt, nz = car.z + car.vz * dt;
  const before = { x: car.x, z: car.z };
  const fixed = collideCircle(S.city, nx, nz, 1.9);
  car.x = fixed.x; car.z = fixed.z;
  const hit = Math.hypot(fixed.x - nx, fixed.z - nz) > 0.001;
  if (hit) {
    const impact = Math.hypot(car.vx, car.vz);
    car.vx *= -0.3; car.vz *= -0.3;
    if (impact > 8) {
      damageCar(S, car, Math.floor(impact * 1.2));
      S.events.push({ type: 'crash', x: car.x, z: car.z, hard: impact > 18 });
      if (impact > 18) S.events.push({ type: 'shake', amount: 0.35 });
    }
  }
  S.stats.distance += spd * dt * (car === S.player.inCar ? 1 : 0);
  return { moved: Math.hypot(car.x - before.x, car.z - before.z) };
}
function updatePlayerCar(S, input, dt) {
  const p = S.player, car = p.inCar;
  const ax = input.axis();
  driveCar(S, car, ax.y, -ax.x, input.held('brake'), dt);
  p.x = car.x; p.z = car.z; p.angle = car.angle;
  // Run over peds at speed.
  if (Math.abs(car.speed) > 8) {
    for (const ped of [...S.peds]) {
      if (dist2(ped.x, ped.z, car.x, car.z) < 5.3) {
        S.peds = S.peds.filter((q) => q !== ped);
        S.stats.kills++;
        S.addHeat(WANTED_HEAT.killPed);
        witnessCrime(S, ped.x, ped.z, 30, 8);
        S.events.push({ type: 'kill', x: ped.x, z: ped.z, kind: 'ped' });
      }
    }
  }
  if (input.buffered('use')) { input.consume('use'); exitCar(S); }
  if (input.pressed('horn')) {
    input.consume('horn');
    S.events.push({ type: 'horn', x: car.x, z: car.z });
    for (const ped of S.peds) {
      if (dist2(ped.x, ped.z, car.x, car.z) < 64) { ped.fleeX = car.x; ped.fleeZ = car.z; ped.fleeT = 2; }
    }
  }
}

// --- Traffic: waypoint driving on the road graph, braking, honking ---
function obstacleAhead(S, car, ahead) {
  const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
  const ax = car.x + fx * ahead, az = car.z + fz * ahead;
  for (const o of S.cars) if (o !== car && dist2(o.x, o.z, ax, az) < 12) return true;
  for (const p of S.peds) if (dist2(p.x, p.z, ax, az) < 6) return true;
  if (dist2(S.player.x, S.player.z, ax, az) < 9) return true;
  return false;
}
function steerToward(car, tx, tz, dt, maxSpeed) {
  const dx = tx - car.x, dz = tz - car.z;
  const target = Math.atan2(dx, dz);
  const diff = angDiff(car.angle, target);
  const steer = clamp(diff * 2.2, -1, 1);
  // Creep forward on sharp turns: a stopped car cannot steer at all.
  const throttle = Math.abs(diff) > 1.2 ? 0.35 : 1;
  return { throttle, steer };
}
function updateTraffic(S, car, dt) {
  if (!car.route.length || car.routeIdx >= car.route.length) pickRoute(S, car);
  const wp = car.route[car.routeIdx];
  // Right-hand lane offset.
  const dx = wp.x - car.x, dz = wp.z - car.z;
  const d = Math.hypot(dx, dz) || 1;
  const heading = Math.atan2(dx, dz);
  // Right-hand lane: offset the target by the right vector (-cos, sin) * 2.2.
  const tx = wp.x - Math.cos(heading) * 2.2;
  const tz = wp.z + Math.sin(heading) * 2.2;
  if (d < 5) { car.routeIdx++; return; }
  if (obstacleAhead(S, car, 9)) {
    car.brakeT += dt;
    driveCar(S, car, 0, 0, true, dt);
    if (car.brakeT > 2 && car.honkT <= 0) { car.honkT = 4; S.events.push({ type: 'horn', x: car.x, z: car.z, quiet: true }); }
    return;
  }
  car.brakeT = 0; car.honkT = Math.max(0, car.honkT - dt);
  const { throttle, steer } = steerToward(car, tx, tz, dt);
  driveCar(S, car, throttle * 0.55, steer, false, dt);
  if (Math.abs(car.speed) > 16) { car.vx *= 0.98; car.vz *= 0.98; }
}
// --- Police pursuit cars: seek the player, ram, respawn when stuck ---
function updatePoliceCar(S, car, dt) {
  const p = S.player;
  const { throttle, steer } = steerToward(car, p.x, p.z, dt);
  driveCar(S, car, 1, steer, false, dt);
  if (Math.abs(car.speed) < 1 && throttle > 0) {
    car.stuckT += dt;
    if (car.stuckT > 2.5) {
      const pt = nearestRoadPoint(p.x + (S.rng.next() - 0.5) * 80, p.z + (S.rng.next() - 0.5) * 80);
      car.x = pt.x; car.z = pt.z; car.angle = Math.atan2(p.x - pt.x, p.z - pt.z);
      car.vx = 0; car.vz = 0; car.stuckT = 0;
    }
  } else car.stuckT = 0;
  // Ramming the player's car damages it.
  if (p.inCar && dist2(car.x, car.z, p.inCar.x, p.inCar.z) < 16) {
    const impact = Math.hypot(car.vx - p.inCar.vx, car.vz - p.inCar.vz);
    if (impact > 6) {
      damageCar(S, p.inCar, 6);
      S.events.push({ type: 'crash', x: p.inCar.x, z: p.inCar.z, hard: false });
    }
  }
}
function updateCriminal(S, dt) {
  const c = S.criminal;
  if (!c) return;
  if (!c.route.length || c.routeIdx >= c.route.length) {
    // Flee: pick a node away from the player.
    const away = S.city.nodes.filter((n) => dist2(n.x, n.z, S.player.x, S.player.z) > dist2(c.x, c.z, S.player.x, S.player.z));
    c.route = [S.rng.pick(away.length ? away : S.city.nodes)];
    c.routeIdx = 0;
  }
  const wp = c.route[c.routeIdx];
  if (Math.hypot(wp.x - c.x, wp.z - c.z) < 6) { c.routeIdx++; return; }
  const { throttle, steer } = steerToward(c, wp.x, wp.z, dt);
  driveCar(S, c, throttle, steer, false, dt);
}
// --- Foot cops, guards, helicopter ---
function updateCops(S, dt) {
  const p = S.player;
  for (const cop of S.cops) {
    cop.hitCd = Math.max(0, (cop.hitCd || 0) - dt);
    const dx = p.x - cop.x, dz = p.z - cop.z;
    const d = Math.hypot(dx, dz) || 1;
    cop.angle = Math.atan2(dx / d, dz / d);
    if (d > 2.2) {
      cop.x += Math.sin(cop.angle) * 7 * dt;
      cop.z += Math.cos(cop.angle) * 7 * dt;
      const fixed = collideCircle(S.city, cop.x, cop.z, 0.7);
      cop.x = fixed.x; cop.z = fixed.z;
    } else if (!p.inCar && cop.hitCd <= 0) {
      cop.hitCd = 0.9;
      hurtPlayer(S, 6);
      S.events.push({ type: 'hit', x: p.x, y: 1.2, z: p.z });
    }
  }
}
function updateGuards(S, dt) {
  const p = S.player;
  for (const g of S.guards) {
    g.fireCd -= dt;
    const d = Math.hypot(p.x - g.x, p.z - g.z);
    g.angle = Math.atan2(p.x - g.x, p.z - g.z);
    if (d < 45 && g.fireCd <= 0 && !p.inCar) {
      g.fireCd = 1.1 + S.rng.next() * 0.5;
      S.events.push({ type: 'gunshot', x: g.x, y: 1.4, z: g.z, tx: p.x, ty: 1.2, tz: p.z });
      if (S.rng.next() < 0.35) hurtPlayer(S, 8);
    }
  }
}
function updateHeli(S, dt) {
  if (S.wanted >= HELI_STARS && !S.heli) S.heli = { a: 0 };
  if (S.wanted < HELI_STARS && S.heli) S.heli = null;
  if (!S.heli) return;
  S.heli.a += dt * 0.3;
  S.heli.x = S.player.x + Math.cos(S.heli.a) * 26;
  S.heli.z = S.player.z + Math.sin(S.heli.a) * 26;
  S.heli.y = 38;
}
function hurtPlayer(S, dmg) {
  const p = S.player;
  if (p.armour > 0) { const absorbed = Math.min(p.armour, dmg); p.armour -= absorbed; dmg -= absorbed; }
  p.hp -= dmg;
  S.events.push({ type: 'hurt', hp: p.hp });
  if (p.hp <= 0 && !p.dead) {
    p.dead = true;
    S.events.push({ type: 'wasted' });
    if (S.mission) { S.mission = null; S.guards = []; }
  }
}
// --- Wanted level: spawn pressure, line-of-sight decay ---
function updateWanted(S, dt) {
  const p = S.player;
  const wantCops = COP_COUNTS[S.wanted];
  const wantCars = POLICE_CAR_COUNTS[S.wanted];
  const cops = S.cops.length, cars = S.cars.filter((c) => c.role === 'police').length;
  if (cops < wantCops) {
    const pt = nearestRoadPoint(p.x + (S.rng.next() - 0.5) * 70, p.z + (S.rng.next() - 0.5) * 70);
    S.cops.push({ x: pt.x, z: pt.z, angle: 0, hp: 50, hitCd: 0, shirt: 0x1c3a5a, skin: 0xe8b88a, name: 'Cop' });
  } else if (cops > wantCops) S.cops.splice(0, cops - wantCops);
  if (cars < wantCars) {
    const pt = nearestRoadPoint(p.x + (S.rng.next() - 0.5) * 110, p.z + (S.rng.next() - 0.5) * 110);
    const car = makeCar('police', pt.x, pt.z, 0, 'police', S.rng);
    S.cars.push(car);
  } else if (cars > wantCars) {
    const pcs = S.cars.filter((c) => c.role === 'police');
    S.cars = S.cars.filter((c) => c.role !== 'police' || pcs.indexOf(c) >= cars - wantCars);
  }
  // Decay heat when nobody can see the player.
  const seen = S.heli
    || S.cops.some((c) => dist2(c.x, c.z, p.x, p.z) < 3600)
    || S.cars.some((c) => c.role === 'police' && dist2(c.x, c.z, p.x, p.z) < 3600);
  if (!seen && S.heat > 0) {
    S.heat = Math.max(0, S.heat - 3 * dt);
    S.wanted = S.heat <= 0 ? 0 : Math.min(5, Math.ceil(S.heat / 20));
  }
}
// --- Car-to-car collision (circle push) ---
function collideCars(S) {
  const cars = S.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 14.5 && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (3.8 - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        const rel = Math.abs((a.vx - b.vx) * nx + (a.vz - b.vz) * nz);
        if (rel > 5) {
          damageCar(S, a, Math.floor(rel));
          damageCar(S, b, Math.floor(rel));
          S.events.push({ type: 'crash', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, hard: rel > 14 });
        }
        const tvx = a.vx, tvz = a.vz;
        a.vx = b.vx * 0.6; a.vz = b.vz * 0.6;
        b.vx = tvx * 0.6; b.vz = tvz * 0.6;
      }
    }
  }
}
// --- Main update ---
export function update(S, input, dt) {
  S.time += dt / DAY_SECONDS;
  // Heat events from missions.
  for (let i = S.events.length - 1; i >= 0; i--) {
    if (S.events[i].type === 'heat') { S.addHeat(S.events[i].amount); S.events.splice(i, 1); }
  }
  if (S.player.dead) return;
  if (S.player.inCar) updatePlayerCar(S, input, dt);
  else updatePlayerFoot(S, input, dt);
  for (const car of [...S.cars]) {
    if (car.role === 'traffic') updateTraffic(S, car, dt);
    else if (car.role === 'police') updatePoliceCar(S, car, dt);
    else if (car.role === 'criminal') updateCriminal(S, dt);
    else if (car !== S.player.inCar) { car.vx *= 0.9; car.vz *= 0.9; }
    // Damage smoke / fire.
    if (car.hp < 50 && car.hp > 0) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) {
        car.smokeT = car.hp < 25 ? 0.08 : 0.2;
        S.events.push({ type: 'smoke', x: car.x, y: 1.2, z: car.z, fire: car.hp < 25 });
      }
    }
  }
  collideCars(S);
  // Traffic respawn: keep the streets alive near the player.
  const traffic = S.cars.filter((c) => c.role === 'traffic');
  for (const car of traffic) {
    if (dist2(car.x, car.z, S.player.x, S.player.z) > 32400) {
      S.cars = S.cars.filter((c) => c !== car);
      S.cars.push(spawnTrafficCar(S));
    }
  }
  while (S.cars.filter((c) => c.role === 'traffic').length < TRAFFIC_COUNT) S.cars.push(spawnTrafficCar(S));
  updateCops(S, dt);
  updateGuards(S, dt);
  updateHeli(S, dt);
  updateWanted(S, dt);
  updatePeds(S, dt);
  updateMission(S, dt);
  updateSideJobs(S, dt);
  // Packages.
  for (const pkg of S.city.packages) {
    if (!pkg.found && dist2(S.player.x, S.player.z, pkg.x, pkg.z) < 6.25) {
      pkg.found = true;
      S.player.cash += PACKAGE_REWARD;
      S.events.push({ type: 'cash', amount: PACKAGE_REWARD, label: `Hidden package ${S.city.packages.filter((p) => p.found).length}/20 — $${PACKAGE_REWARD}` });
    }
  }
  // Spray & Go: repaint clears the wanted level.
  const sp = S.city.landmarks.spray;
  if (S.player.inCar && S.wanted > 0 && dist2(S.player.x, S.player.z, sp.x, sp.z) < 100
    && !S.cops.some((c) => dist2(c.x, c.z, S.player.x, S.player.z) < 625)
    && S.player.cash >= SPRAY_COST) {
    S.player.cash -= SPRAY_COST;
    S.heat = 0; S.wanted = 0;
    S.player.inCar.color = S.rng.pick(CAR_TYPES[S.player.inCar.type].colors);
    S.events.push({ type: 'spray' });
  }
}
