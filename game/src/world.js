// The simulation for Solmar City: the player on foot and in cars, traffic,
// police pursuit, the helicopter, the wanted level and collisions. Cars are
// arcade — throttle, steering that scales with speed, brake lights that
// flare while braking and wheels that spin with road speed. State is plain
// data; meshes are copied from it each frame.
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeCar, makeHelicopter } from './models.js';

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(scene, city, rng, hooks) {
  const state = {
    mode: 'title', // title | play | paused | dead
    time: 18.5, // golden hour, 18:30
    wanted: 0, heat: 0, lastCrimeAt: -100,
    cash: CFG.economy.startCash,
    health: CFG.player.health,
    stats: { shots: 0, carsStolen: 0, fares: 0, packages: 0, crashes: 0 },
    // Screenshot staging overrides: brake flares the brake lights and
    // throttle keeps the wheels spinning while the camera is fixed.
    staging: { brake: false, throttle: false },
    player: {
      x: city.spawn.player.x, z: city.spawn.player.z, angle: city.spawn.player.angle,
      onFoot: true, inCar: null, speed: 0, moving: false,
    },
    cars: [], police: [], heli: null,
    message: '', messageAt: 0,
  };

  function addCar(kind, x, z, angle, color, traffic = false) {
    const built = makeCar(kind, color);
    built.group.position.set(x, 0, z);
    built.group.rotation.y = angle;
    scene.add(built.group);
    const car = {
      ...built, kind, x, z, angle, speed: 0, braking: false,
      traffic, cruise: rng.range(CFG.traffic.cruiseMin, CFG.traffic.cruiseMax),
      axis: rng.chance(0.5) ? 'x' : 'z', dir: rng.chance(0.5) ? 1 : -1,
      steer: 0, parked: false,
    };
    state.cars.push(car);
    return car;
  }

  // The player's starter sedan, parked by the boardwalk.
  const starter = addCar('sedan', city.spawn.starterCar.x, city.spawn.starterCar.z, city.spawn.starterCar.angle);
  starter.parked = true;
  // The stolen van for Rosa's first job, waiting by the marina.
  const van = addCar('van', city.spawn.van.x, city.spawn.van.z, city.spawn.van.angle);
  van.parked = true;
  // Parked flavour: a sports coupe and a taxi near the bar.
  const sports = addCar('sports', city.spawn.starterCar.x + 6, city.spawn.starterCar.z + 14, Math.PI);
  sports.parked = true;
  const taxiCar = addCar('taxi', city.spawn.starterCar.x - 8, city.spawn.starterCar.z + 20, 0);
  taxiCar.parked = true;
  // Moving traffic on the grid.
  for (let i = 0; i < CFG.traffic.count; i++) {
    const axis = rng.pick([-198, -154, -110, -66, -22, 22, 66, 110, 154, 198]);
    const along = rng.range(-200, 200);
    const kind = rng.pick(['sedan', 'sedan', 'taxi', 'truck', 'sedan']);
    const c = addCar(kind,
      kind === 'truck' ? axis : (rng.chance(0.5) ? axis : along),
      kind === 'truck' ? along : (rng.chance(0.5) ? along : axis),
      0, undefined, true);
    c.angle = c.axis === 'x' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
    c.speed = c.cruise;
  }

  const heliBuilt = makeHelicopter();
  heliBuilt.group.visible = false;
  scene.add(heliBuilt.group);
  state.heli = { ...heliBuilt, active: false, orbit: 0, alt: 26 };

  function crime(amount, x, z) {
    state.wanted = clamp(state.wanted + amount, 0, CFG.wanted.max);
    state.heat = 1;
    state.lastCrimeAt = state.time;
    hooks.onCrime?.(state.wanted, x, z);
  }

  function enterCar(car) {
    if (state.player.inCar) return;
    state.player.inCar = car;
    state.player.onFoot = false;
    car.parked = false;
    car.traffic = false;
    state.player.speed = 0;
    if (car !== starter && car !== sports && car !== taxiCar) {
      // Stealing a stranger's car draws heat; the starter fleet is yours.
      crime(CFG.wanted.stealHeat, car.x, car.z);
      state.stats.carsStolen++;
      hooks.toast('Car stolen — the cops noticed.');
    } else {
      hooks.toast(kindLabel(car.kind) + ' — yours. Drive.');
    }
    hooks.onEnterCar?.(car);
  }
  function kindLabel(kind) {
    return { sedan: 'Sedan', taxi: 'Taxi', cruiser: 'Cruiser', sports: 'Sports coupe', van: 'Delivery van', truck: 'Truck' }[kind] || 'Car';
  }

  function exitCar() {
    const car = state.player.inCar;
    if (!car) return;
    car.speed = 0;
    car.parked = true;
    state.player.inCar = null;
    state.player.onFoot = true;
    state.player.x = car.x + Math.sin(car.angle + Math.PI / 2) * 2.5;
    state.player.z = car.z + Math.cos(car.angle + Math.PI / 2) * 2.5;
    state.player.angle = car.angle;
  }

  function nearestCar(maxDist) {
    let best = null, bd = maxDist;
    for (const c of state.cars) {
      if (c === state.player.inCar) continue;
      const d = Math.hypot(c.x - state.player.x, c.z - state.player.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function collideBuildings(x, z, radius) {
    for (const b of city.buildings) {
      const hw = b.w / 2 + radius, hd = b.d / 2 + radius;
      if (Math.abs(x - b.x) < hw && Math.abs(z - b.z) < hd) {
        const px = hw - Math.abs(x - b.x), pz = hd - Math.abs(z - b.z);
        if (px < pz) x = b.x + Math.sign(x - b.x || 1) * hw;
        else z = b.z + Math.sign(z - b.z || 1) * hd;
        return { x, z, hit: true };
      }
    }
    return { x, z, hit: false };
  }

  function updatePlayer(dt, a) {
    const p = state.player;
    const wasInCar = !!p.inCar;
    if (p.inCar) {
      const car = p.inCar;
      const throttle = a.up || state.staging.throttle;
      const wantBrake = a.brake || (a.down && car.speed > 1);
      if (throttle) car.speed += CFG.car.accel * dt;
      else if (a.down) car.speed -= (car.speed > 0.5 ? CFG.car.brake : CFG.car.reverseAccel) * dt;
      else car.speed -= Math.sign(car.speed) * CFG.car.drag * 6 * dt;
      if (wantBrake) car.speed -= Math.sign(car.speed) * CFG.car.brake * dt;
      car.speed = clamp(car.speed, -CFG.car.maxReverse, CFG.car.maxSpeed);
      if (Math.abs(car.speed) < 0.15 && !throttle && !a.down) car.speed = 0;
      const steer = (a.left ? 1 : 0) - (a.right ? 1 : 0);
      const steerAuthority = clamp(Math.abs(car.speed) / 8, 0, 1) * Math.sign(car.speed || 1);
      car.angle += steer * CFG.car.turn * steerAuthority * dt;
      car.steerVisual = steer * 0.38 * steerAuthority;
      car.braking = wantBrake || state.staging.brake || (a.down && car.speed > 0.5);
      const nx = car.x + Math.sin(car.angle) * car.speed * dt;
      const nz = car.z + Math.cos(car.angle) * car.speed * dt;
      const hit = collideBuildings(nx, nz, 1.4);
      if (hit.hit) {
        if (Math.abs(car.speed) > 8) {
          hooks.onCrash?.(car.x, car.z);
          state.stats.crashes++;
          hooks.addTrauma?.(0.35);
        }
        car.speed *= -0.25;
      } else { car.x = nx; car.z = nz; }
      car.x = clamp(car.x, -CFG.world.half, CFG.world.oceanX - 8);
      car.z = clamp(car.z, -CFG.world.half, CFG.world.half);
      p.x = car.x; p.z = car.z; p.angle = car.angle; p.speed = car.speed;
      p.moving = Math.abs(car.speed) > 0.5;
      if (a.hornPressed) hooks.horn?.();
    } else {
      const speed = a.sprint ? CFG.player.runSpeed : CFG.player.walkSpeed;
      const turn = (a.left ? 1 : 0) - (a.right ? 1 : 0);
      p.angle += turn * CFG.player.turnRate * dt;
      let mx = 0, mz = 0;
      if (a.up) { mx += Math.sin(p.angle); mz += Math.cos(p.angle); }
      if (a.down) { mx -= Math.sin(p.angle); mz -= Math.cos(p.angle); }
      const len = Math.hypot(mx, mz);
      p.moving = len > 0;
      if (len > 0) {
        const nx = p.x + (mx / len) * speed * dt;
        const nz = p.z + (mz / len) * speed * dt;
        const hit = collideBuildings(nx, nz, 0.6);
        p.x = hit.x; p.z = hit.z;
        p.x = clamp(p.x, -CFG.world.half, CFG.world.oceanX - 4);
        p.z = clamp(p.z, -CFG.world.half, CFG.world.half);
      }
      p.speed = p.moving ? speed : 0;
      if (a.interactPressed) {
        const car = nearestCar(CFG.player.enterCarRange);
        if (car) enterCar(car);
        else hooks.onInteractEmpty?.(p.x, p.z);
      }
      if (a.shootHeld || a.shootPressed) shoot();
    }
    // Exit only on a press that began while already driving: entering and
    // exiting on the same E press would cancel the entry outright.
    if (wasInCar && a.interactPressed) exitCar();
  }

  let shootCooldown = 0;
  function shoot() {
    if (shootCooldown > 0) return;
    shootCooldown = 0.28;
    state.stats.shots++;
    hooks.onShot?.(state.player.x, state.player.z, state.player.angle);
    crime(CFG.wanted.shootHeat, state.player.x, state.player.z);
    hooks.addTrauma?.(0.18);
  }

  function updateTraffic(dt) {
    for (const c of state.cars) {
      if (!c.traffic) continue;
      // Drive along the current axis; at an intersection (both coordinates
      // near a street value, 22 + 44k) sometimes turn onto the cross street.
      const speed = c.cruise;
      const along = c.axis === 'x' ? c.x : c.z;
      const inter = Math.round((along - 22) / CFG.grid.spacing) * CFG.grid.spacing + 22;
      if (Math.abs(along - inter) < speed * dt + 1.5 && Math.random() < 0.3) {
        if (c.axis === 'x') { c.x = inter; c.axis = 'z'; }
        else { c.z = inter; c.axis = 'x'; }
        c.dir = Math.random() < 0.5 ? 1 : -1;
      }
      c.speed = speed;
      c.x += (c.axis === 'x' ? c.dir : 0) * speed * dt;
      c.z += (c.axis === 'z' ? c.dir : 0) * speed * dt;
      const want = c.axis === 'x' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      c.angle += angDiff(want, c.angle) * Math.min(1, dt * 6);
      // Wrap around the city edge instead of driving into the ocean.
      if (c.x > CFG.world.cityHalf) { c.x = -CFG.world.cityHalf; }
      if (c.x < -CFG.world.cityHalf) { c.x = CFG.world.cityHalf; }
      if (c.z > CFG.world.cityHalf) { c.z = -CFG.world.cityHalf; }
      if (c.z < -CFG.world.cityHalf) { c.z = CFG.world.cityHalf; }
      c.braking = false;
    }
  }
  function rngChance() { return Math.random() < 0.012; }
  function updatePolice(dt) {
    // Wanted spawns cruisers; they chase, ram, and give up when the heat dies.
    const wantCount = state.wanted >= 1 ? Math.min(state.wanted, 3) : 0;
    while (state.police.length < wantCount) {
      const a = Math.random() * Math.PI * 2;
      const c = addCar('cruiser',
        state.player.x + Math.sin(a) * 40, state.player.z + Math.cos(a) * 40,
        a, undefined, false);
      state.police.push(c);
    }
    while (state.police.length > wantCount) {
      const c = state.police.pop();
      scene.remove(c.group);
      const i = state.cars.indexOf(c);
      if (i >= 0) state.cars.splice(i, 1);
    }
    for (const c of state.police) {
      const dx = state.player.x - c.x, dz = state.player.z - c.z;
      const d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      c.angle += clamp(angDiff(want, c.angle), -2.2 * dt, 2.2 * dt);
      const target = d > 6 ? CFG.wanted.copChaseSpeed : CFG.wanted.copChaseSpeed * 0.6;
      c.speed += clamp(target - c.speed, -20 * dt, 12 * dt);
      const nx = c.x + Math.sin(c.angle) * c.speed * dt;
      const nz = c.z + Math.cos(c.angle) * c.speed * dt;
      const hit = collideBuildings(nx, nz, 1.4);
      if (!hit.hit) { c.x = nx; c.z = nz; }
      else { c.speed *= 0.4; c.angle += 0.6 * dt; }
      c.braking = d < 8;
      if (d < CFG.wanted.copRamRange && state.player.inCar) {
        hooks.onCrash?.(c.x, c.z);
        hooks.addTrauma?.(0.4);
        state.player.inCar.speed *= 0.6;
        c.speed *= 0.5;
      }
      if (d < 2.5 && !state.player.inCar && state.wanted > 0) {
        // Busted on foot.
        state.mode = 'dead';
        hooks.onBusted?.();
      }
    }
  }

  function updateHeli(dt) {
    const h = state.heli;
    const shouldFly = state.wanted >= CFG.wanted.heliAt && state.mode === 'play';
    h.active = shouldFly;
    h.group.visible = shouldFly;
    if (!shouldFly) return;
    h.orbit += dt * 0.25;
    const r = 26;
    h.group.position.set(
      state.player.x + Math.cos(h.orbit) * r,
      h.alt + Math.sin(h.orbit * 2) * 1.5,
      state.player.z + Math.sin(h.orbit) * r);
    h.group.rotation.y = Math.atan2(state.player.x - h.group.position.x, state.player.z - h.group.position.z);
    h.rotor.rotation.y += dt * 22;
    h.tailRotor.rotation.x += dt * 30;
    // Searchlight cone always points at the player.
    h.cone.lookAt(state.player.x, 0, state.player.z);
  }

  function updateWanted(dt) {
    // Heat fades when the player stays clean and no cop is close.
    const copNear = state.police.some((c) => Math.hypot(c.x - state.player.x, c.z - state.player.z) < 30);
    if (!copNear && state.wanted > 0) {
      state.heat = Math.max(0, state.heat - dt * CFG.wanted.decayPerSec * 4);
      if (state.heat <= 0) state.wanted = Math.max(0, state.wanted - 1), state.heat = 1;
    }
  }

  // Copy simulation state onto meshes: positions, headings, wheel spin and
  // brake-light flare. Wheels spin by road speed over their radius.
  function syncMeshes(dt) {
    for (const c of state.cars) {
      c.group.position.set(c.x, 0, c.z);
      c.group.rotation.y = c.angle;
      const spin = (c.speed * dt) / CFG.car.wheelRadius;
      for (const w of c.wheels) {
        w.wheel.rotation.x += spin;
        if (w.steer) w.pivot.rotation.y = c.steerVisual || 0;
      }
      c.brakeMat.emissiveIntensity = c.braking ? 3.4 : 0.55;
      const flare = c.braking ? 0.5 : 0;
      c.brakeGlow.children.forEach((f) => { f.material.opacity = flare; });
    }
  }

  return {
    state,
    starter, van, sports, taxiCar,
    addCar, enterCar, exitCar, nearestCar, crime,
    playerNear(x, z, r) {
      return Math.hypot(state.player.x - x, state.player.z - z) < r;
    },
    update(dt, actions) {
      shootCooldown = Math.max(0, shootCooldown - dt);
      if (state.mode === 'play') {
        updatePlayer(dt, actions);
        updateTraffic(dt);
        updatePolice(dt);
        updateHeli(dt);
        updateWanted(dt);
        state.time = (state.time + dt / 240) % 24; // a full day in 4 game-minutes
      }
      syncMeshes(dt);
    },
  };
}
