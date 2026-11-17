// Solmar City's rules and state: the player on foot and in cars, traffic, pedestrians,
// police and the wanted system, missions, side jobs, shops and the save. No drawing
// and no DOM here except localStorage; the renderer paints state, main.js drives it.
import {
  STEP, WORLD_W, WORLD_H, CAR_TYPES, CAR_COLORS, PED_SHIRTS, PED_PANTS, WEAPONS,
  WANTED_MAX, EVADE_SECONDS, COP_SIGHT, BUST_SECONDS, CAR_BUST_SECONDS, PLAYER,
  START_MONEY, PACKAGE_REWARD, SPRAY_BASE, TAXI_FARE_MIN, TAXI_FARE_MAX,
  VIGILANTE_REWARD, CLOCK_START_MINUTES, MINUTES_PER_SECOND, SAVE_KEY,
} from './config.js';
import { buildCity } from './city.js';
import { missionById, nextMission } from './missions.js';

export const OVERLAY_BRIEFING = 'briefing';
export const OVERLAY_BUSTED = 'busted';
export const OVERLAY_WASTED = 'wasted';
export const OVERLAY_DONE = 'done';
export const OVERLAY_FAIL = 'fail';
export const OVERLAY_COMPLETE = 'complete';

const TRAFFIC_COUNT = 22;
const PARKED_COUNT = 14;
const PED_COUNT = 42;
const COP_FOOT = [0, 2, 3, 4, 5, 6];
const COP_CARS = [0, 0, 1, 2, 3, 4];
const TAU = Math.PI * 2;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

let nextCarId = 1;

export function createWorld(rng, audio) {
  const city = buildCity(rng);
  const state = {
    city,
    time: 0,
    clock: CLOCK_START_MINUTES,
    player: null,
    cars: [],
    peds: [],
    cops: [],
    particles: [],
    tracers: [],
    floats: [],
    pickups: [],
    wanted: 0,
    evade: 0,
    bustT: 0,
    camera: { x: 300, y: 470 },
    view: { w: 1280, h: 720 },
    overlay: null,
    overlayT: 0,
    overlayData: null,
    mission: null,
    missionOffer: null,
    taxi: null,
    vigilante: null,
    prompt: null,
    message: null,
    banner: null,
    stats: { kills: 0, packages: 0, fares: 0, missions: 0, deaths: 0, busts: 0, shots: 0, playTime: 0 },
    doneMissions: [],
    storyDone: false,
    saveFlash: 0,
    ambient: false,
  };

  function freshPlayer() {
    return {
      x: 300, y: 470, angle: 0, hp: PLAYER.maxHp, armor: 0,
      money: START_MONEY, weapon: 'pistol', hasSmg: false,
      fireCd: 0, inCar: null, walkPhase: 0, moving: false, aimX: 400, aimY: 470,
    };
  }

  function addFloat(x, y, text, color) {
    state.floats.push({ x, y, text, color: color || '#ffffff', life: 1.6 });
    if (state.floats.length > 40) state.floats.shift();
  }

  function addParticles(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const a = rng.next() * TAU;
      const s = speed * (0.3 + rng.next() * 0.7);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.5 + rng.next() * 0.5), maxLife: life,
        color, size: size * (0.6 + rng.next() * 0.8),
      });
    }
    if (state.particles.length > 400) state.particles.splice(0, state.particles.length - 400);
  }

  function showMessage(text, seconds) {
    state.message = { text, t: seconds || 3 };
  }

  function showBanner(title, sub, seconds) {
    state.banner = { title, sub: sub || '', t: seconds || 3 };
  }

  function makeCar(type, x, y, angle, driver) {
    const spec = CAR_TYPES[type];
    const car = {
      id: nextCarId++,
      type, spec,
      x, y, angle, vx: 0, vy: 0, speed: 0,
      hp: spec.hp, maxHp: spec.hp,
      color: type === 'taxi' ? '#e8c832' : type === 'police' ? '#f2f4f6' : rng.pick(CAR_COLORS),
      driver: driver || null,
      ai: null, police: type === 'police', wreck: false, wreckT: 0,
      criminal: false, brake: false, sirenPhase: rng.next() * TAU,
    };
    state.cars.push(car);
    return car;
  }

  function makePed(x, y, guard) {
    const ped = {
      x, y, angle: rng.next() * TAU, hp: guard ? 60 : 30,
      state: 'walk', speed: rng.range(55, 85),
      tx: x, ty: y, shirt: rng.pick(PED_SHIRTS), pants: rng.pick(PED_PANTS),
      skin: rng.pick(['#e8b88a', '#c98d5f', '#8a5a34', '#f0c8a0']),
      fleeT: 0, deadT: 0, guard: !!guard, fireCd: rng.range(0.5, 1.5),
      walkPhase: rng.next() * TAU, retarget: 0,
    };
    state.peds.push(ped);
    return ped;
  }

  function spawnTrafficCar(farFromPlayer) {
    for (let tries = 0; tries < 12; tries += 1) {
      const spot = city.randomRoadPoint(rng);
      if (farFromPlayer && dist(spot.x, spot.y, playerPos().x, playerPos().y) < 700) continue;
      const type = rng.pick(['sedan', 'sedan', 'sedan', 'taxi', 'van', 'truck', 'sports', 'limo']);
      const car = makeCar(type, spot.x, spot.y, 0, 'traffic');
      const dir = rng.chance(0.5) ? 1 : -1;
      car.ai = {
        axis: spot.axis, road: spot.axis === 'y' ? spot.x : spot.y, dir,
        targetSpeed: rng.range(190, 270), stuck: 0, turnCd: rng.range(1, 4),
      };
      car.angle = spot.axis === 'y' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      car.speed = car.ai.targetSpeed;
      return car;
    }
    return null;
  }

  function spawnParkedCar() {
    const spot = city.randomParkedSpot(rng);
    const type = rng.pick(['sedan', 'sedan', 'taxi', 'van', 'sports', 'truck']);
    const car = makeCar(type, spot.x, spot.y, spot.angle, 'parked');
    return car;
  }

  function spawnCop(x, y) {
    const cop = { x, y, angle: 0, hp: 50, bustT: 0, walkPhase: rng.next() * TAU, leaving: false };
    state.cops.push(cop);
    return cop;
  }

  function spawnPoliceCar(x, y) {
    const car = makeCar('police', x, y, angleTo(x, y, playerPos().x, playerPos().y), 'police');
    car.ai = { axis: 'chase', targetSpeed: 0, stuck: 0, turnCd: 0 };
    return car;
  }

  function playerPos() {
    const p = state.player;
    if (p.inCar) return { x: p.inCar.x, y: p.inCar.y };
    return { x: p.x, y: p.y };
  }

  function nearestCar(x, y, maxD, skipWreck) {
    let best = null;
    let bd = maxD;
    for (const car of state.cars) {
      if (skipWreck && car.wreck) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bd) {
        bd = d;
        best = car;
      }
    }
    return best;
  }

  function setupPickups() {
    state.pickups = [
      { x: 3380, y: 1080, kind: 'health', amount: 40, respawn: 0 },
      { x: 2140, y: 2430, kind: 'health', amount: 40, respawn: 0 },
      { x: 1270, y: 2430, kind: 'armor', amount: 50, respawn: 0 },
      { x: 3000, y: 1680, kind: 'armor', amount: 50, respawn: 0 },
      { x: 4450, y: 1150, kind: 'smg', amount: 0, respawn: 0 },
      { x: 1650, y: 3400, kind: 'health', amount: 40, respawn: 0 },
      { x: 900, y: 700, kind: 'cash', amount: 100, respawn: 0 },
      { x: 3900, y: 2050, kind: 'cash', amount: 150, respawn: 0 },
    ];
  }

  function reset(newGame) {
    state.time = 0;
    state.clock = CLOCK_START_MINUTES;
    state.player = freshPlayer();
    state.cars = [];
    state.peds = [];
    state.cops = [];
    state.particles = [];
    state.tracers = [];
    state.floats = [];
    state.wanted = 0;
    state.evade = 0;
    state.bustT = 0;
    state.overlay = null;
    state.overlayData = null;
    state.mission = null;
    state.missionOffer = null;
    state.taxi = null;
    state.vigilante = null;
    state.prompt = null;
    state.message = null;
    state.banner = null;
    state.storyDone = false;
    state.saveFlash = 0;
    state.camera = { x: 300, y: 470 };
    if (newGame) {
      state.stats = { kills: 0, packages: 0, fares: 0, missions: 0, deaths: 0, busts: 0, shots: 0, playTime: 0 };
      state.doneMissions = [];
      for (const pkg of city.packages) pkg.taken = false;
    }
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar(false);
    for (let i = 0; i < PARKED_COUNT; i += 1) spawnParkedCar();
    // Two parked police cars by the precinct, for the vigilante job.
    makeCar('police', 2100, 2380, Math.PI / 2, 'parked');
    makeCar('police', 2145, 2380, Math.PI / 2, 'parked');
    // A sports car by the hotel, worth stealing.
    makeCar('sports', 4350, 640, Math.PI, 'parked');
    // A taxi waiting at the depot.
    makeCar('taxi', 750, 1540, 0, 'parked');
    for (let i = 0; i < PED_COUNT; i += 1) {
      const spot = city.randomSidewalkPoint(rng);
      const ped = makePed(spot.x, spot.y, false);
      const next = city.randomSidewalkPoint(rng);
      ped.tx = next.x;
      ped.ty = next.y;
    }
    setupPickups();
  }

  // ---- Wanted ----
  function addWanted(n) {
    if (state.wanted >= WANTED_MAX) return;
    state.wanted = Math.min(WANTED_MAX, state.wanted + n);
    state.evade = 0;
    audio.star();
    showMessage(`Wanted level ${state.wanted}`, 2);
  }

  function setWanted(n) {
    if (n > state.wanted) addWanted(n - state.wanted);
  }

  function clearWanted() {
    state.wanted = 0;
    state.evade = 0;
    for (const cop of state.cops) cop.leaving = true;
  }

  // ---- Damage ----
  function damagePlayer(dmg) {
    const p = state.player;
    if (p.hp <= 0) return;
    const absorbed = Math.min(p.armor, dmg * 0.6);
    p.armor -= absorbed;
    p.hp -= (dmg - absorbed);
    if (p.hp <= 0) {
      p.hp = 0;
      wasted();
    }
  }

  function damagePed(ped, dmg, byPlayer) {
    if (ped.state === 'dead') return;
    ped.hp -= dmg;
    addParticles(ped.x, ped.y, 4, '#a83226', 90, 0.4, 3);
    if (ped.hp <= 0) {
      ped.state = 'dead';
      ped.deadT = 0;
      addParticles(ped.x, ped.y, 10, '#a83226', 130, 0.6, 4);
      if (byPlayer) {
        state.stats.kills += 1;
        if (ped.guard) {
          if (state.mission && state.mission.def.steps[state.mission.step].type === 'kill') {
            state.mission.data.killed = (state.mission.data.killed || 0) + 1;
          }
        } else {
          addWanted(1);
        }
        if (rng.chance(0.4)) {
          state.pickups.push({ x: ped.x + rng.range(-20, 20), y: ped.y + rng.range(-20, 20), kind: 'cash', amount: rng.int(20, 60), respawn: 0, temp: true });
        }
      }
      scarePeds(ped.x, ped.y, 320);
    } else if (byPlayer) {
      ped.state = 'flee';
      ped.fleeT = 3;
      scarePeds(ped.x, ped.y, 220);
    }
  }

  function damageCar(car, dmg, byPlayer) {
    if (car.wreck) return;
    car.hp -= dmg;
    if (car.hp <= 30 && car.hp > 0 && rng.chance(0.3)) {
      addParticles(car.x, car.y - 6, 2, '#555555', 40, 0.8, 5);
    }
    if (car.hp <= 0) explodeCar(car, byPlayer);
  }

  function explodeCar(car, byPlayer) {
    car.wreck = true;
    car.wreckT = 0;
    car.hp = 0;
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    addParticles(car.x, car.y, 40, '#ff8c2e', 260, 0.9, 7);
    addParticles(car.x, car.y, 25, '#555555', 120, 1.6, 8);
    addParticles(car.x, car.y, 15, '#ffd76e', 320, 0.5, 5);
    audio.explosion();
    if (state.player.inCar === car) {
      state.player.inCar = null;
      state.player.x = car.x + 40;
      state.player.y = car.y + 30;
      damagePlayer(25);
      showMessage('Your car blew up!', 2.5);
    }
    if (car.criminal && byPlayer) {
      state.player.money += VIGILANTE_REWARD;
      addFloat(car.x, car.y - 30, `+$${VIGILANTE_REWARD}`, '#57d977');
      audio.cash();
      showMessage('Criminal stopped! +$' + VIGILANTE_REWARD, 2.5);
      state.vigilante = null;
    }
    if (car.police && byPlayer) addWanted(1);
    scarePeds(car.x, car.y, 420);
    // Chain: nearby cars catch fire.
    for (const other of state.cars) {
      if (other !== car && !other.wreck && dist(car.x, car.y, other.x, other.y) < 90) {
        damageCar(other, 60, false);
      }
    }
  }

  function scarePeds(x, y, radius) {
    for (const ped of state.peds) {
      if (ped.state === 'dead' || ped.guard) continue;
      if (dist(ped.x, ped.y, x, y) < radius) {
        ped.state = 'flee';
        ped.fleeT = rng.range(2.5, 4.5);
      }
    }
  }

  // Line of sight: true when no building stands between the two points.
  function lineOfSight(ax, ay, bx, by) {
    const d = dist(ax, ay, bx, by);
    const steps = Math.ceil(d / 24);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (city.pointInBuilding(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }

  // ---- Shooting ----
  function fireWeapon() {
    const p = state.player;
    const weapon = WEAPONS[p.weapon];
    if (p.fireCd > 0 || p.inCar) return;
    p.fireCd = weapon.rate;
    state.stats.shots += 1;
    const baseAngle = angleTo(p.x, p.y, p.aimX, p.aimY);
    const a = baseAngle + (rng.next() - 0.5) * 2 * weapon.spread;
    const ox = p.x + Math.cos(a) * 18;
    const oy = p.y + Math.sin(a) * 18;
    let endX = ox + Math.cos(a) * weapon.range;
    let endY = oy + Math.sin(a) * weapon.range;
    let bestD = weapon.range;
    let hitPed = null;
    let hitCop = null;
    let hitCar = null;
    // Nearest thing the ray meets: a building, a ped, a cop or a car.
    for (let d = 16; d < weapon.range; d += 16) {
      const x = ox + Math.cos(a) * d;
      const y = oy + Math.sin(a) * d;
      if (city.pointInBuilding(x, y)) {
        bestD = d;
        break;
      }
    }
    for (const ped of state.peds) {
      if (ped.state === 'dead') continue;
      const dx = ped.x - ox;
      const dy = ped.y - oy;
      const along = dx * Math.cos(a) + dy * Math.sin(a);
      if (along < 0 || along > bestD) continue;
      const perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
      if (perp < 15) {
        bestD = along;
        hitPed = ped;
        hitCop = null;
        hitCar = null;
      }
    }
    for (const cop of state.cops) {
      const dx = cop.x - ox;
      const dy = cop.y - oy;
      const along = dx * Math.cos(a) + dy * Math.sin(a);
      if (along < 0 || along > bestD) continue;
      const perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
      if (perp < 15) {
        bestD = along;
        hitCop = cop;
        hitPed = null;
        hitCar = null;
      }
    }
    for (const car of state.cars) {
      if (car.wreck) continue;
      const dx = car.x - ox;
      const dy = car.y - oy;
      const along = dx * Math.cos(a) + dy * Math.sin(a);
      if (along < 0 || along > bestD) continue;
      const lx = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const ly = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
      if (Math.abs(lx) < car.spec.w / 2 + 4 && Math.abs(ly) < car.spec.h / 2 + 4) {
        bestD = along;
        hitCar = car;
        hitPed = null;
        hitCop = null;
      }
    }
    endX = ox + Math.cos(a) * bestD;
    endY = oy + Math.sin(a) * bestD;
    state.tracers.push({ x0: ox, y0: oy, x1: endX, y1: endY, life: 0.07, color: weapon.tracer });
    addParticles(ox, oy, 2, '#ffd76e', 120, 0.1, 3);
    audio.shot();
    if (hitPed) {
      damagePed(hitPed, weapon.dmg, true);
      audio.hit();
    } else if (hitCop) {
      hitCop.hp -= weapon.dmg;
      audio.hit();
      if (hitCop.hp <= 0) {
        state.cops.splice(state.cops.indexOf(hitCop), 1);
        addParticles(hitCop.x, hitCop.y, 10, '#a83226', 130, 0.6, 4);
        state.stats.kills += 1;
        addWanted(1);
      }
    } else if (hitCar) {
      damageCar(hitCar, weapon.dmg, true);
      addParticles(endX, endY, 4, '#ffd76e', 140, 0.25, 3);
      audio.hit();
      if (hitCar.police) addWanted(1);
    } else {
      addParticles(endX, endY, 3, '#cccccc', 100, 0.2, 2);
    }
    scarePeds(p.x, p.y, 260);
  }

  // ---- Cars: entering, leaving, driving ----
  function tryEnterCar() {
    const p = state.player;
    if (p.inCar) {
      exitCar();
      return;
    }
    const car = nearestCar(p.x, p.y, 95, true);
    if (!car) return;
    if (car.driver === 'police') {
      showMessage('That police car is occupied', 2);
      return;
    }
    if (car.driver === 'traffic') {
      // Carjacking: the driver bails, the law notices.
      addWanted(1);
      showMessage('Carjacked! The cops noticed.', 2.5);
      const spot = city.randomSidewalkPoint(rng);
      const driver = makePed(car.x + 30, car.y + 20, false);
      driver.state = 'flee';
      driver.fleeT = 4;
      driver.tx = spot.x;
      driver.ty = spot.y;
    }
    car.driver = 'player';
    car.ai = null;
    p.inCar = car;
    car.speed = 0;
    audio.engine(0, true);
    if (car.type === 'taxi') {
      showMessage('Taxi job: fares will appear — pick them up!', 3.5);
      startTaxiJob();
    } else if (car.type === 'police') {
      showMessage('Vigilante: stop the marked criminal car!', 3.5);
      startVigilante();
    } else {
      showMessage(car.spec.name, 1.2);
    }
  }

  function exitCar() {
    const p = state.player;
    const car = p.inCar;
    if (!car) return;
    p.inCar = null;
    car.driver = null;
    car.speed *= 0.2;
    // Step out on the car's left side.
    const side = car.angle + Math.PI / 2;
    const [nx, ny] = city.resolveCircle(car.x + Math.cos(side) * 34, car.y + Math.sin(side) * 34, PLAYER.radius);
    p.x = nx;
    p.y = ny;
    p.angle = car.angle;
    audio.engine(0, false);
    if (state.taxi && state.taxi.active) {
      state.taxi = null;
      showMessage('Fare cancelled', 2);
    }
    if (state.vigilante) {
      state.vigilante.paused = true;
      showMessage('Vigilante paused — get back in a police car', 2.5);
    }
  }

  function updatePlayerCar(dt, input, script) {
    const p = state.player;
    const car = p.inCar;
    const spec = car.spec;
    let throttle = 0;
    let steer = 0;
    if (script) {
      throttle = script.throttle || 0;
      steer = script.steer || 0;
    } else {
      const ax = input.axis();
      throttle = -ax.y; // up = forward
      steer = ax.x;
    }
    const fwdX = Math.cos(car.angle);
    const fwdY = Math.sin(car.angle);
    let speed = car.vx * fwdX + car.vy * fwdY;
    let lat = -car.vx * fwdY + car.vy * fwdX;
    if (throttle > 0) speed += spec.accel * throttle * dt;
    else if (throttle < 0) {
      if (speed > 20) speed -= spec.brake * dt; // braking
      else speed = Math.max(-spec.reverse, speed + spec.accel * 0.6 * throttle * dt);
    }
    speed -= speed * 0.25 * dt;
    speed = clamp(speed, -spec.reverse, spec.max);
    const handbrake = script ? !!script.handbrake : input.handbrake();
    const steerAuthority = clamp(Math.abs(speed) / 130, 0, 1) * (speed < 0 ? -1 : 1);
    car.angle += steer * spec.turn * steerAuthority * dt * (handbrake ? 1.35 : 1);
    const grip = handbrake ? 2.2 : spec.grip;
    lat *= Math.exp(-grip * dt);
    if (handbrake) speed -= speed * 0.8 * dt;
    car.vx = Math.cos(car.angle) * speed + -Math.sin(car.angle) * lat;
    car.vy = Math.sin(car.angle) * speed + Math.cos(car.angle) * lat;
    car.speed = speed;
    car.brake = throttle < 0 || handbrake;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    state.stats.distance += Math.abs(speed) * dt;
    // Buildings: bounce off with damage.
    const hit = carHitsBuilding(car);
    if (hit) {
      const impact = Math.abs(speed) + Math.abs(lat);
      car.x -= car.vx * dt * 2;
      car.y -= car.vy * dt * 2;
      car.vx *= -0.25;
      car.vy *= -0.25;
      car.speed *= -0.25;
      if (impact > 120) {
        damageCar(car, impact * 0.06, false);
        addParticles(car.x + fwdX * 20, car.y + fwdY * 20, 8, '#ffd76e', 180, 0.4, 3);
        audio.crash();
        if (impact > 380) damagePlayer(impact * 0.02);
      }
    }
    if (car.x > 4680 - 20) { car.x = 4680 - 20; car.vx = Math.min(0, car.vx); }
    car.x = clamp(car.x, 24, WORLD_W - 24);
    car.y = clamp(car.y, 24, WORLD_H - 24);
    audio.engine(clamp(Math.abs(speed) / spec.max, 0, 1), true);
    if (car.hp < 35) {
      addParticles(car.x, car.y, 1, '#333333', 30, 1.2, 6);
      if (rng.chance(0.1)) addParticles(car.x, car.y, 1, '#ff8c2e', 60, 0.4, 5);
    }
  }

  // A car's corners against the buildings; returns the building hit, or null.
  function carHitsBuilding(car) {
    const hw = car.spec.w / 2;
    const hh = car.spec.h / 2;
    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    const corners = [[hw, hh], [hw, -hh], [-hw, hh], [-hw, -hh], [0, 0]];
    for (const [lx, ly] of corners) {
      const x = car.x + lx * c - ly * s;
      const y = car.y + lx * s + ly * c;
      const b = city.pointInBuilding(x, y);
      if (b) return b;
    }
    return null;
  }

  function updatePlayerFoot(dt, input, script) {
    const p = state.player;
    let mx = 0;
    let my = 0;
    let shoot = false;
    if (script) {
      mx = script.mx || 0;
      my = script.my || 0;
      shoot = !!script.shoot;
      if (script.aimX !== undefined) {
        p.aimX = script.aimX;
        p.aimY = script.aimY;
      }
    } else {
      const ax = input.axis();
      mx = ax.x;
      my = ax.y;
      shoot = input.mouse.down;
      p.aimX = state.camera.x + (input.mouse.x - state.view.w / 2);
      p.aimY = state.camera.y + (input.mouse.y - state.view.h / 2);
    }
    const len = Math.hypot(mx, my);
    const running = script ? !!script.run : input.running();
    const speed = running ? PLAYER.run : PLAYER.walk;
    if (len > 0) {
      mx /= len;
      my /= len;
      p.x += mx * speed * dt;
      p.y += my * speed * dt;
      p.moving = true;
      p.walkPhase += dt * (running ? 13 : 9);
      if (!shoot && dist(p.aimX, p.aimY, p.x, p.y) < 60) p.angle = Math.atan2(my, mx);
    } else {
      p.moving = false;
    }
    if (shoot || dist(p.aimX, p.aimY, p.x, p.y) >= 60) {
      p.angle = angleTo(p.x, p.y, p.aimX, p.aimY);
    }
    [p.x, p.y] = city.resolveCircle(p.x, p.y, PLAYER.radius);
    if (p.fireCd > 0) p.fireCd -= dt;
    if (shoot) fireWeapon();
    audio.engine(0, false);
  }

  // ---- Traffic ----
  function updateTrafficCar(car, dt) {
    const ai = car.ai;
    if (!ai || car.wreck) return;
    if (ai.axis === 'chase') {
      updatePoliceCar(car, dt);
      return;
    }
    // Car ahead in the same lane? Slow down.
    let target = ai.targetSpeed;
    const lookX = car.x + Math.cos(car.angle) * 60;
    const lookY = car.y + Math.sin(car.angle) * 60;
    for (const other of state.cars) {
      if (other === car || other.wreck) continue;
      const d = dist(lookX, lookY, other.x, other.y);
      if (d < 55) {
        target = 0;
        break;
      }
    }
    // A pedestrian in the way? Brake.
    for (const ped of state.peds) {
      if (ped.state !== 'dead' && dist(lookX, lookY, ped.x, ped.y) < 34) {
        target = 0;
        break;
      }
    }
    if (car.criminal) target = Math.max(target, 330);
    car.speed += clamp(target - car.speed, -700 * dt, 320 * dt);
    if (Math.abs(car.speed) < 5 && target > 0) ai.stuck += dt;
    else ai.stuck = 0;
    if (ai.stuck > 4) {
      // Stuck: send it somewhere else.
      const spot = city.randomRoadPoint(rng);
      car.x = spot.x;
      car.y = spot.y;
      ai.axis = spot.axis;
      ai.road = spot.axis === 'y' ? spot.x : spot.y;
      ai.dir = rng.chance(0.5) ? 1 : -1;
      ai.stuck = 0;
    }
    // Turning at an intersection.
    ai.turnCd -= dt;
    const cross = ai.axis === 'y'
      ? city.streets.find((s) => Math.abs(car.y - s) < 46)
      : city.avenues.find((a) => Math.abs(car.x - a) < 46);
    if (cross !== undefined && ai.turnCd <= 0 && rng.chance(0.5)) {
      ai.turnCd = rng.range(2, 6);
      const newDir = rng.chance(0.5) ? 1 : -1;
      if (ai.axis === 'y') {
        ai.axis = 'x';
        ai.road = cross;
        ai.dir = newDir;
        car.y = cross + newDir * 27;
        car.angle = newDir > 0 ? 0 : Math.PI;
      } else {
        ai.axis = 'y';
        ai.road = cross;
        ai.dir = newDir;
        car.x = cross - newDir * 27;
        car.angle = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    // Stay in the lane; drift back to it.
    const laneOff = ai.axis === 'y' ? -ai.dir * 27 : ai.dir * 27;
    if (ai.axis === 'y') {
      car.x += (ai.road + laneOff - car.x) * Math.min(1, 3 * dt);
      car.y += ai.dir * car.speed * dt;
      car.angle = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.y += (ai.road + laneOff - car.y) * Math.min(1, 3 * dt);
      car.x += ai.dir * car.speed * dt;
      car.angle = ai.dir > 0 ? 0 : Math.PI;
    }
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    // Off the map: recycle.
    if (car.x < -60 || car.x > WORLD_W + 60 || car.y < -60 || car.y > WORLD_H + 60) {
      const spot = city.randomRoadPoint(rng);
      car.x = spot.x;
      car.y = spot.y;
      ai.axis = spot.axis;
      ai.road = spot.axis === 'y' ? spot.x : spot.y;
      ai.dir = rng.chance(0.5) ? 1 : -1;
    }
    // Criminals flee from the player.
    if (car.criminal && state.player.inCar) {
      const pp = playerPos();
      const d = dist(car.x, car.y, pp.x, pp.y);
      if (d < 300) {
        const away = angleTo(pp.x, pp.y, car.x, car.y);
        const want = Math.abs(wrapAngle(away - car.angle)) < Math.PI / 2 ? ai.dir : -ai.dir;
        ai.dir = want;
      }
    }
  }

  function updatePoliceCar(car, dt) {
    const pp = playerPos();
    const target = state.player.inCar ? pp : pp;
    const want = angleTo(car.x, car.y, target.x, target.y);
    const diff = wrapAngle(want - car.angle);
    const maxSpeed = 560 + state.wanted * 30;
    car.speed += clamp(maxSpeed - car.speed, -800 * dt, 500 * dt);
    car.angle += clamp(diff, -2.6 * dt, 2.6 * dt);
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.sirenPhase += dt * 9;
    // Nudge out of buildings: police cut corners, but not through walls.
    const hit = carHitsBuilding(car);
    if (hit) {
      car.x -= car.vx * dt * 2;
      car.y -= car.vy * dt * 2;
      car.angle += 0.6;
      car.speed *= 0.4;
      damageCar(car, 5, false);
    }
    car.x = clamp(car.x, 24, WORLD_W - 24);
    car.y = clamp(car.y, 24, WORLD_H - 24);
    // Player on foot nearby: a cop gets out.
    if (!state.player.inCar && dist(car.x, car.y, pp.x, pp.y) < 220 && state.cops.length < COP_FOOT[state.wanted] + 2) {
      const cop = spawnCop(car.x + 30, car.y + 20);
      cop.hp = 50;
      car.driver = 'parked';
      car.ai = null;
      car.speed = 0;
      car.vx = 0;
      car.vy = 0;
    }
  }

  // ---- Pedestrians ----
  function updatePed(ped, dt) {
    if (ped.state === 'dead') {
      ped.deadT += dt;
      return;
    }
    if (ped.guard) {
      updateGuard(ped, dt);
      return;
    }
    if (ped.state === 'wait') return; // a taxi fare, standing at the kerb
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const pp = playerPos();
      const away = angleTo(pp.x, pp.y, ped.x, ped.y) + (rng.next() - 0.5) * 0.6;
      ped.angle = away;
      ped.x += Math.cos(away) * 230 * dt;
      ped.y += Math.sin(away) * 230 * dt;
      ped.walkPhase += dt * 13;
      [ped.x, ped.y] = city.resolveCircle(ped.x, ped.y, 11);
      if (ped.fleeT <= 0) {
        ped.state = 'walk';
        const next = city.randomSidewalkPoint(rng);
        ped.tx = next.x;
        ped.ty = next.y;
      }
      return;
    }
    // Walk toward the target; pick a new one on arrival.
    ped.retarget -= dt;
    const d = dist(ped.x, ped.y, ped.tx, ped.ty);
    if (d < 30 || ped.retarget <= 0) {
      const next = city.randomSidewalkPoint(rng);
      ped.tx = next.x;
      ped.ty = next.y;
      ped.retarget = rng.range(6, 14);
    }
    const a = angleTo(ped.x, ped.y, ped.tx, ped.ty);
    ped.angle = a;
    ped.x += Math.cos(a) * ped.speed * dt;
    ped.y += Math.sin(a) * ped.speed * dt;
    ped.walkPhase += dt * 8;
    [ped.x, ped.y] = city.resolveCircle(ped.x, ped.y, 11);
  }

  function updateGuard(ped, dt) {
    const pp = playerPos();
    const d = dist(ped.x, ped.y, pp.x, pp.y);
    ped.fireCd -= dt;
    if (d < 520 && lineOfSight(ped.x, ped.y, pp.x, pp.y)) {
      ped.angle = angleTo(ped.x, ped.y, pp.x, pp.y);
      if (d > 260) {
        ped.x += Math.cos(ped.angle) * 120 * dt;
        ped.y += Math.sin(ped.angle) * 120 * dt;
        ped.walkPhase += dt * 9;
        [ped.x, ped.y] = city.resolveCircle(ped.x, ped.y, 11);
      }
      if (ped.fireCd <= 0) {
        ped.fireCd = rng.range(0.7, 1.3);
        const hit = rng.next() < clamp(0.45 - d / 1400, 0.12, 0.45);
        const tx = hit ? pp.x : pp.x + rng.range(-70, 70);
        const ty = hit ? pp.y : pp.y + rng.range(-70, 70);
        state.tracers.push({ x0: ped.x, y0: ped.y, x1: tx, y1: ty, life: 0.07, color: '#ff9a5c' });
        audio.shot();
        if (hit) {
          damagePlayer(rng.int(7, 12));
          addParticles(pp.x, pp.y, 3, '#a83226', 90, 0.3, 3);
        }
      }
    } else {
      // Idle patrol around the warehouse.
      ped.retarget -= dt;
      if (ped.retarget <= 0 || dist(ped.x, ped.y, ped.tx, ped.ty) < 20) {
        const home = city.place('warehouse');
        ped.tx = home.x + rng.range(-160, 160);
        ped.ty = home.y + rng.range(-120, 120);
        ped.retarget = rng.range(3, 7);
      }
      const a = angleTo(ped.x, ped.y, ped.tx, ped.ty);
      ped.angle = a;
      ped.x += Math.cos(a) * 70 * dt;
      ped.y += Math.sin(a) * 70 * dt;
      ped.walkPhase += dt * 7;
      [ped.x, ped.y] = city.resolveCircle(ped.x, ped.y, 11);
    }
  }

  // ---- Police on foot ----
  function updateCop(cop, dt) {
    const pp = playerPos();
    if (cop.leaving) {
      // Walk away and despawn.
      const away = angleTo(pp.x, pp.y, cop.x, cop.y);
      cop.angle = away;
      cop.x += Math.cos(away) * 160 * dt;
      cop.y += Math.sin(away) * 160 * dt;
      cop.walkPhase += dt * 10;
      [cop.x, cop.y] = city.resolveCircle(cop.x, cop.y, 11);
      return;
    }
    const d = dist(cop.x, cop.y, pp.x, pp.y);
    const a = angleTo(cop.x, cop.y, pp.x, pp.y);
    cop.angle = a;
    const speed = 245 + state.wanted * 8;
    if (d > 24) {
      cop.x += Math.cos(a) * speed * dt;
      cop.y += Math.sin(a) * speed * dt;
      cop.walkPhase += dt * 12;
    }
    [cop.x, cop.y] = city.resolveCircle(cop.x, cop.y, 11);
    const playerCar = state.player.inCar;
    const carSpeed = playerCar ? Math.abs(playerCar.speed) : 0;
    if (!playerCar && d < 30) {
      cop.bustT += dt;
      if (cop.bustT > BUST_SECONDS) busted();
    } else if (playerCar && carSpeed < 25 && d < 70) {
      cop.bustT += dt;
      if (cop.bustT > CAR_BUST_SECONDS) busted();
    } else {
      cop.bustT = Math.max(0, cop.bustT - dt * 2);
    }
  }

  function updateWanted(dt) {
    const pp = playerPos();
    // Keep the heat at the wanted level's strength.
    const wantFoot = COP_FOOT[state.wanted];
    const wantCars = COP_CARS[state.wanted];
    const footNow = state.cops.filter((c) => !c.leaving).length;
    const carsNow = state.cars.filter((c) => c.driver === 'police' && !c.wreck).length;
    if (state.wanted > 0) {
      if (footNow < wantFoot) {
        const spot = city.randomSidewalkPoint(rng);
        if (dist(spot.x, spot.y, pp.x, pp.y) > 420 && dist(spot.x, spot.y, pp.x, pp.y) < 900) {
          spawnCop(spot.x, spot.y);
        } else {
          const a = rng.next() * TAU;
          const [x, y] = city.resolveCircle(pp.x + Math.cos(a) * 600, pp.y + Math.sin(a) * 600, 11);
          spawnCop(x, y);
        }
      }
      if (carsNow < wantCars) {
        const spot = city.randomRoadPoint(rng);
        if (dist(spot.x, spot.y, pp.x, pp.y) > 450) spawnPoliceCar(spot.x, spot.y);
      }
    }
    // Evading: no cop sees you, and the heat cools off one star at a time.
    if (state.wanted > 0) {
      let seen = false;
      for (const cop of state.cops) {
        if (!cop.leaving && dist(cop.x, cop.y, pp.x, pp.y) < COP_SIGHT) {
          seen = true;
          break;
        }
      }
      if (!seen) {
        for (const car of state.cars) {
          if (car.driver === 'police' && !car.wreck && dist(car.x, car.y, pp.x, pp.y) < COP_SIGHT) {
            seen = true;
            break;
          }
        }
      }
      if (!seen) {
        state.evade += dt;
        if (state.evade >= EVADE_SECONDS) {
          state.wanted -= 1;
          state.evade = 0;
          if (state.wanted === 0) {
            clearWanted();
            showMessage('You lost them!', 2.5);
          } else {
            showMessage(`Wanted level ${state.wanted}`, 2);
          }
        }
      } else {
        state.evade = 0;
      }
    }
    // Cops that left, far away, go home.
    state.cops = state.cops.filter((cop) => !cop.leaving || dist(cop.x, cop.y, pp.x, pp.y) < 1200);
    audio.siren(state.wanted > 0 && state.cars.some((c) => c.driver === 'police' && !c.wreck));
  }

  // ---- Car collisions, ped hits ----
  function updateCollisions(dt) {
    const cars = state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (a.wreck) continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (b.wreck) continue;
        const d = dist(a.x, a.y, b.x, b.y);
        const min = (a.spec.w + b.spec.w) / 4 + 8;
        if (d < min && d > 0.01) {
          const nx = (b.x - a.x) / d;
          const ny = (b.y - a.y) / d;
          const push = (min - d) / 2;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          const rel = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
          if (rel > 90) {
            const dmg = rel * 0.05;
            damageCar(a, dmg, false);
            damageCar(b, dmg, false);
            addParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffd76e', 150, 0.3, 3);
            if (rel > 200) audio.crash();
            if (a.driver === 'player' && b.police) addWanted(1);
            if (b.driver === 'player' && a.police) addWanted(1);
          }
          const swap = 0.4;
          const avx = a.vx;
          const avy = a.vy;
          a.vx = a.vx * (1 - swap) + b.vx * swap;
          a.vy = a.vy * (1 - swap) + b.vy * swap;
          b.vx = b.vx * (1 - swap) + avx * swap;
          b.vy = b.vy * (1 - swap) + avy * swap;
          a.speed = a.vx * Math.cos(a.angle) + a.vy * Math.sin(a.angle);
          b.speed = b.vx * Math.cos(b.angle) + b.vy * Math.sin(b.angle);
        }
      }
    }
    // Cars vs pedestrians.
    for (const ped of state.peds) {
      if (ped.state === 'dead') continue;
      for (const car of cars) {
        if (car.wreck) continue;
        const speed = Math.hypot(car.vx, car.vy);
        if (speed < 110) continue;
        if (dist(ped.x, ped.y, car.x, car.y) < 26) {
          damagePed(ped, 100, car.driver === 'player');
          break;
        }
      }
    }
    // Cars vs the player on foot.
    const p = state.player;
    if (!p.inCar && p.hp > 0) {
      for (const car of cars) {
        if (car.wreck) continue;
        const speed = Math.hypot(car.vx, car.vy);
        if (speed < 100) continue;
        if (dist(p.x, p.y, car.x, car.y) < 26) {
          damagePlayer(speed * 0.05);
          const a = angleTo(car.x, car.y, p.x, p.y);
          p.x += Math.cos(a) * 30;
          p.y += Math.sin(a) * 30;
          [p.x, p.y] = city.resolveCircle(p.x, p.y, PLAYER.radius);
          audio.crash();
          break;
        }
      }
    }
  }

  // ---- Missions ----
  function stepTarget(step) {
    if (step.place) return city.place(step.place);
    if (step.at) return step.at;
    return null;
  }

  function currentObjective() {
    if (!state.mission) return null;
    const def = state.mission.def;
    const step = def.steps[state.mission.step];
    if (!step) return null;
    let text = step.text;
    if (step.type === 'kill') text += ` (${state.mission.data.killed || 0}/${step.count})`;
    if (step.type === 'fares') text += ` (${state.mission.data.fares || 0}/${step.count})`;
    if (step.time) text += ` — ${Math.ceil(state.mission.timer)}s`;
    const target = stepTarget(step);
    return { title: def.title, text, target: target ? { x: target.x, y: target.y } : null };
  }

  function enterStep() {
    const m = state.mission;
    const step = m.def.steps[m.step];
    m.data = {};
    m.timer = step.time || 0;
    m.dwell = 0;
    if (step.type === 'kill') {
      const home = city.place(step.place);
      for (let i = 0; i < step.count; i += 1) {
        const guard = makePed(home.x + rng.range(-170, 170), home.y + rng.range(-130, 130), true);
        guard.tx = home.x;
        guard.ty = home.y;
      }
      showMessage('Take out the guards!', 2.5);
    } else if (step.type === 'fares') {
      showMessage('Get in a taxi — fares will appear', 3);
    }
    audio.missionStart();
  }

  function startMission(def) {
    state.mission = { def, step: 0, data: {}, timer: 0, dwell: 0 };
    state.missionOffer = null;
    state.overlay = null;
    showBanner(def.title, `Mission started — ${def.giver}`, 3);
    enterStep();
  }

  function completeStep() {
    const m = state.mission;
    const step = m.def.steps[m.step];
    if (step.heat) setWanted(step.heat);
    audio.pickup();
    m.step += 1;
    if (m.step >= m.def.steps.length) {
      completeMission();
    } else {
      enterStep();
    }
  }

  function completeMission() {
    const m = state.mission;
    state.player.money += m.def.reward;
    state.stats.missions += 1;
    state.doneMissions.push(m.def.id);
    state.mission = null;
    audio.missionDone();
    save();
    if (!nextMission(state.doneMissions)) {
      state.storyDone = true;
      state.overlay = OVERLAY_COMPLETE;
      state.overlayData = { reward: m.def.reward, title: m.def.title };
    } else {
      state.overlay = OVERLAY_DONE;
      state.overlayData = { reward: m.def.reward, title: m.def.title };
    }
    state.overlayT = 0;
  }

  function failMission(reason) {
    if (!state.mission) return;
    const title = state.mission.title || state.mission.def.title;
    // The guards stand down.
    for (const ped of state.peds) {
      if (ped.guard && ped.state !== 'dead') {
        ped.guard = false;
        ped.state = 'flee';
        ped.fleeT = 3;
      }
    }
    state.mission = null;
    audio.missionFail();
    state.overlay = OVERLAY_FAIL;
    state.overlayData = { reason, title };
    state.overlayT = 0;
  }

  function updateMission(dt) {
    // Offer the next mission at its start marker.
    if (!state.mission && !state.overlay) {
      const next = nextMission(state.doneMissions);
      if (next) {
        const start = city.place(next.start.place);
        const pp = playerPos();
        state.missionOffer = dist(pp.x, pp.y, start.x, start.y) < 150 ? next : null;
      } else {
        state.missionOffer = null;
      }
    }
    if (!state.mission) return;
    const m = state.mission;
    const step = m.def.steps[m.step];
    const pp = playerPos();
    if (step.time) {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission('Out of time');
        return;
      }
    }
    if (step.type === 'goto') {
      const target = stepTarget(step);
      const d = dist(pp.x, pp.y, target.x, target.y);
      if (step.needCar && !state.player.inCar) return;
      if (d < step.r) {
        if (step.dwell) {
          m.dwell += dt;
          if (m.dwell >= step.dwell) completeStep();
        } else {
          completeStep();
        }
      } else {
        m.dwell = 0;
      }
    } else if (step.type === 'kill') {
      if ((m.data.killed || 0) >= step.count) completeStep();
    } else if (step.type === 'fares') {
      if ((m.data.fares || 0) >= step.count) completeStep();
    } else if (step.type === 'lose') {
      if (state.wanted === 0) completeStep();
    }
  }

  // ---- Taxi job ----
  function startTaxiJob() {
    if (state.taxi) return;
    state.taxi = { active: true, stage: 'pickup', x: 0, y: 0, reward: 0, deadline: 0, ped: null };
    newFare();
  }

  function newFare() {
    const t = state.taxi;
    const from = city.randomSidewalkPoint(rng);
    const dest = city.nearestIntersection(rng.range(300, WORLD_W - 500), rng.range(300, WORLD_H - 300));
    t.stage = 'pickup';
    t.x = from.x;
    t.y = from.y;
    t.destX = dest.x;
    t.destY = dest.y;
    t.reward = rng.int(TAXI_FARE_MIN, TAXI_FARE_MAX);
    t.deadline = 0;
    const ped = makePed(from.x, from.y, false);
    ped.state = 'wait';
    ped.tx = from.x;
    ped.ty = from.y;
    t.ped = ped;
    showMessage('New fare — pick up the passenger', 2.5);
  }

  function updateTaxi(dt) {
    const t = state.taxi;
    if (!t || !t.active) return;
    const pp = playerPos();
    if (t.stage === 'pickup') {
      if (dist(pp.x, pp.y, t.x, t.y) < 70) {
        t.stage = 'dropoff';
        t.x = t.destX;
        t.y = t.destY;
        const d = dist(pp.x, pp.y, t.destX, t.destY);
        t.deadline = clamp(d / 320, 25, 90);
        if (t.ped) {
          t.ped.state = 'dead';
          t.ped.deadT = 99;
          const idx = state.peds.indexOf(t.ped);
          if (idx !== -1) state.peds.splice(idx, 1);
          t.ped = null;
        }
        audio.pickup();
        showMessage('Passenger aboard — drive to the marker', 2.5);
      }
    } else {
      t.deadline -= dt;
      if (t.deadline <= 0) {
        showMessage('Fare failed — too slow', 2.5);
        state.taxi = null;
        return;
      }
      if (dist(pp.x, pp.y, t.x, t.y) < 80) {
        const bonus = Math.ceil(t.deadline / 10) * 5;
        const pay = t.reward + bonus;
        state.player.money += pay;
        state.stats.fares += 1;
        addFloat(pp.x, pp.y - 40, `+$${pay}`, '#57d977');
        audio.cash();
        if (state.mission && state.mission.def.steps[state.mission.step].type === 'fares') {
          state.mission.data.fares = (state.mission.data.fares || 0) + 1;
        }
        if (state.mission && state.mission.def.steps[state.mission.step].type === 'fares'
          && (state.mission.data.fares || 0) < state.mission.def.steps[state.mission.step].count) {
          newFare();
        } else if (!state.mission) {
          newFare();
        } else {
          state.taxi = null;
        }
      }
    }
  }

  // ---- Vigilante job ----
  function startVigilante() {
    if (state.vigilante && state.vigilante.target && !state.vigilante.target.wreck) {
      state.vigilante.paused = false;
      return;
    }
    const spot = city.randomRoadPoint(rng);
    const car = makeCar(rng.pick(['sedan', 'sports', 'van']), spot.x, spot.y, 0, 'traffic');
    car.criminal = true;
    car.color = '#8a2e2e';
    const dir = rng.chance(0.5) ? 1 : -1;
    car.ai = { axis: spot.axis, road: spot.axis === 'y' ? spot.x : spot.y, dir, targetSpeed: 330, stuck: 0, turnCd: 1 };
    car.angle = spot.axis === 'y' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    car.speed = 300;
    state.vigilante = { target: car, paused: false };
    showMessage('Criminal car marked in red — stop it!', 3);
  }

  function updateVigilante(dt) {
    const v = state.vigilante;
    if (!v || v.paused) return;
    if (!v.target || v.target.wreck) {
      state.vigilante = null;
      if (state.player.inCar && state.player.inCar.type === 'police') startVigilante();
    }
  }

  // ---- Shops and prompts ----
  function updatePrompt() {
    const p = state.player;
    const pp = playerPos();
    state.prompt = null;
    if (state.missionOffer) {
      state.prompt = { text: `Start mission: ${state.missionOffer.title}`, action: 'mission' };
      return;
    }
    if (p.inCar) {
      const spray = city.place('spray');
      if (dist(pp.x, pp.y, spray.x, spray.y) < 120) {
        const cost = Math.max(50, SPRAY_BASE * state.wanted) + (p.inCar.hp < p.inCar.maxHp ? 50 : 0);
        if (state.wanted > 0 || p.inCar.hp < p.inCar.maxHp) {
          state.prompt = { text: `Respray & repair — $${cost}`, action: 'spray', cost };
        }
      }
      return;
    }
    const hospital = city.place('hospital');
    if (dist(pp.x, pp.y, hospital.x, hospital.y) < 120 && p.hp < PLAYER.maxHp) {
      state.prompt = { text: 'Get treated — $100', action: 'hospital', cost: 100 };
      return;
    }
    const gun = city.place('gunshop');
    if (dist(pp.x, pp.y, gun.x, gun.y) < 120) {
      if (!p.hasSmg) state.prompt = { text: 'Buy SMG — $400', action: 'smg', cost: 400 };
      else if (p.armor < PLAYER.maxArmor) state.prompt = { text: 'Buy armour — $150', action: 'armor', cost: 150 };
      return;
    }
    const home = city.place('safehouse');
    if (dist(pp.x, pp.y, home.x, home.y) < 120) {
      state.prompt = { text: 'Save game', action: 'save' };
    }
  }

  function doPromptAction() {
    const pr = state.prompt;
    if (!pr) return;
    const p = state.player;
    if (pr.action === 'mission') {
      state.overlay = OVERLAY_BRIEFING;
      state.overlayData = { mission: state.missionOffer };
      state.overlayT = 0;
      audio.click();
      return;
    }
    if (pr.action === 'save') {
      save();
      state.saveFlash = 2;
      audio.pickup();
      showMessage('Game saved', 2);
      return;
    }
    if (pr.cost && p.money < pr.cost) {
      showMessage('Not enough cash', 2);
      return;
    }
    if (pr.action === 'spray') {
      p.money -= pr.cost;
      clearWanted();
      p.inCar.hp = p.inCar.maxHp;
      p.inCar.color = rng.pick(CAR_COLORS);
      audio.cash();
      showMessage('Fresh paint — heat cleared', 2.5);
    } else if (pr.action === 'hospital') {
      p.money -= pr.cost;
      p.hp = PLAYER.maxHp;
      audio.pickup();
      showMessage('Patched up', 2);
    } else if (pr.action === 'smg') {
      p.money -= pr.cost;
      p.hasSmg = true;
      p.weapon = 'smg';
      audio.pickup();
      showMessage('SMG bought — press Q to switch weapons', 3);
    } else if (pr.action === 'armor') {
      p.money -= pr.cost;
      p.armor = PLAYER.maxArmor;
      audio.pickup();
      showMessage('Armour fitted', 2);
    }
  }

  // ---- Busted / wasted ----
  function busted() {
    if (state.overlay) return;
    const p = state.player;
    const fine = Math.max(50, Math.floor(p.money * 0.1));
    p.money -= fine;
    state.stats.busts += 1;
    if (state.mission) {
      const title = state.mission.def.title;
      state.mission = null;
      state.overlayData = { fine, failedMission: title };
    } else {
      state.overlayData = { fine };
    }
    state.overlay = OVERLAY_BUSTED;
    state.overlayT = 0;
    audio.busted();
    audio.siren(false);
    audio.engine(0, false);
  }

  function wasted() {
    if (state.overlay) return;
    const p = state.player;
    const bill = Math.max(50, Math.floor(p.money * 0.1));
    p.money -= bill;
    state.stats.deaths += 1;
    if (state.mission) {
      const title = state.mission.def.title;
      state.mission = null;
      state.overlayData = { bill, failedMission: title };
    } else {
      state.overlayData = { bill };
    }
    state.overlay = OVERLAY_WASTED;
    state.overlayT = 0;
    audio.wasted();
    audio.siren(false);
    audio.engine(0, false);
  }

  function respawn() {
    const p = state.player;
    const place = state.overlay === OVERLAY_BUSTED ? city.place('police') : city.place('hospital');
    if (p.inCar) {
      p.inCar.driver = null;
      p.inCar = null;
    }
    p.x = place.x;
    p.y = place.y + 40;
    p.hp = PLAYER.maxHp;
    p.armor = 0;
    clearWanted();
    state.overlay = null;
    state.overlayData = null;
    state.camera.x = p.x;
    state.camera.y = p.y;
    state.taxi = null;
    state.vigilante = null;
    save();
  }

  // ---- Pickups and packages ----
  function updatePickups(dt) {
    const p = state.player;
    for (const pk of state.pickups) {
      if (pk.respawn > 0) {
        pk.respawn -= dt;
        continue;
      }
      if (p.inCar) continue;
      if (dist(p.x, p.y, pk.x, pk.y) < 26) {
        if (pk.kind === 'health') {
          if (p.hp >= PLAYER.maxHp) continue;
          p.hp = Math.min(PLAYER.maxHp, p.hp + pk.amount);
          addFloat(p.x, p.y - 30, `+${pk.amount} HP`, '#57d977');
        } else if (pk.kind === 'armor') {
          if (p.armor >= PLAYER.maxArmor) continue;
          p.armor = Math.min(PLAYER.maxArmor, p.armor + pk.amount);
          addFloat(p.x, p.y - 30, `+${pk.amount} armour`, '#6ea8ff');
        } else if (pk.kind === 'cash') {
          p.money += pk.amount;
          addFloat(p.x, p.y - 30, `+$${pk.amount}`, '#57d977');
        } else if (pk.kind === 'smg') {
          p.hasSmg = true;
          p.weapon = 'smg';
          addFloat(p.x, p.y - 30, 'SMG!', '#ffd76e');
        }
        audio.pickup();
        if (pk.temp) pk.respawn = -1;
        else pk.respawn = 45;
      }
    }
    state.pickups = state.pickups.filter((pk) => pk.respawn >= 0);
    // Hidden packages.
    if (!p.inCar) {
      for (const pkg of city.packages) {
        if (pkg.taken) continue;
        if (dist(p.x, p.y, pkg.x, pkg.y) < 28) {
          pkg.taken = true;
          p.money += PACKAGE_REWARD;
          state.stats.packages += 1;
          addFloat(p.x, p.y - 30, `Hidden package! +$${PACKAGE_REWARD}`, '#ff9ad9');
          audio.cash();
          showMessage(`Hidden package ${state.stats.packages}/20`, 2.5);
          save();
        }
      }
    }
  }

  // ---- Save / load ----
  function save() {
    try {
      const data = {
        money: state.player.money,
        hp: state.player.hp,
        armor: state.player.armor,
        weapon: state.player.weapon,
        hasSmg: state.player.hasSmg,
        doneMissions: state.doneMissions,
        packages: city.packages.map((pkg) => (pkg.taken ? 1 : 0)),
        stats: state.stats,
        clock: state.clock,
        storyDone: state.storyDone,
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Storage can be off: the save then lasts this visit only.
    }
  }

  function hasSave() {
    try {
      return !!window.localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      const p = state.player;
      p.money = data.money ?? START_MONEY;
      p.hp = data.hp ?? PLAYER.maxHp;
      p.armor = data.armor ?? 0;
      p.weapon = data.weapon || 'pistol';
      p.hasSmg = !!data.hasSmg;
      state.doneMissions = data.doneMissions || [];
      state.stats = { ...state.stats, ...(data.stats || {}) };
      state.clock = data.clock ?? CLOCK_START_MINUTES;
      state.storyDone = !!data.storyDone;
      if (Array.isArray(data.packages)) {
        data.packages.forEach((taken, i) => {
          if (city.packages[i]) city.packages[i].taken = !!taken;
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  // ---- Ambient updates (title backdrop) ----
  function stepAmbient(dt) {
    state.time += dt;
    state.clock = (state.clock + MINUTES_PER_SECOND * dt) % (24 * 60);
    for (const car of state.cars) {
      if (car.driver === 'traffic') updateTrafficCar(car, dt);
    }
    for (const ped of state.peds) updatePed(ped, dt);
    updateParticles(dt);
    // Slow pan across downtown.
    const t = state.time * 0.02;
    state.camera.x = 2400 + Math.cos(t) * 900;
    state.camera.y = 1800 + Math.sin(t * 0.7) * 600;
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 1 - 2 * dt;
      pt.vy *= 1 - 2 * dt;
    }
    for (let i = state.tracers.length - 1; i >= 0; i -= 1) {
      state.tracers[i].life -= dt;
      if (state.tracers[i].life <= 0) state.tracers.splice(i, 1);
    }
    for (let i = state.floats.length - 1; i >= 0; i -= 1) {
      const f = state.floats[i];
      f.life -= dt;
      f.y -= 26 * dt;
      if (f.life <= 0) state.floats.splice(i, 1);
    }
    if (state.message) {
      state.message.t -= dt;
      if (state.message.t <= 0) state.message = null;
    }
    if (state.banner) {
      state.banner.t -= dt;
      if (state.banner.t <= 0) state.banner = null;
    }
    if (state.saveFlash > 0) state.saveFlash -= dt;
  }

  function updateCamera(dt) {
    const pp = playerPos();
    let tx = pp.x;
    let ty = pp.y;
    if (state.player.inCar) {
      const car = state.player.inCar;
      tx += car.vx * 0.22;
      ty += car.vy * 0.22;
    }
    const k = 1 - Math.exp(-4.5 * dt);
    state.camera.x += (tx - state.camera.x) * k;
    state.camera.y += (ty - state.camera.y) * k;
  }

  // One fixed step of the live game. `script` (screenshot autopilot) replaces input.
  function step(dt, input, script) {
    if (state.overlay === OVERLAY_BRIEFING) return;
    if (state.overlay === OVERLAY_BUSTED || state.overlay === OVERLAY_WASTED
      || state.overlay === OVERLAY_FAIL || state.overlay === OVERLAY_DONE
      || state.overlay === OVERLAY_COMPLETE) {
      state.overlayT += dt;
      updateParticles(dt);
      return;
    }
    state.time += dt;
    state.stats.playTime += dt;
    state.clock = (state.clock + MINUTES_PER_SECOND * dt) % (24 * 60);
    if (state.player.inCar) updatePlayerCar(dt, input, script);
    else updatePlayerFoot(dt, input, script);
    for (const car of state.cars) {
      if (car.driver === 'traffic' || car.driver === 'police') updateTrafficCar(car, dt);
      if (car.wreck) {
        car.wreckT += dt;
        if (rng.chance(0.2)) addParticles(car.x, car.y, 1, '#333333', 25, 1.4, 7);
      }
    }
    state.cars = state.cars.filter((car) => !car.wreck || car.wreckT < 30);
    // Keep the streets busy.
    const trafficNow = state.cars.filter((c) => c.driver === 'traffic').length;
    if (trafficNow < TRAFFIC_COUNT && rng.chance(0.02)) spawnTrafficCar(true);
    for (const ped of state.peds) updatePed(ped, dt);
    state.peds = state.peds.filter((ped) => ped.state !== 'dead' || ped.deadT < 25);
    // Keep the sidewalks busy.
    const alivePeds = state.peds.filter((ped) => ped.state !== 'dead').length;
    if (alivePeds < PED_COUNT && rng.chance(0.02)) {
      const spot = city.randomSidewalkPoint(rng);
      if (dist(spot.x, spot.y, playerPos().x, playerPos().y) > 500) makePed(spot.x, spot.y, false);
    }
    for (const cop of state.cops) updateCop(cop, dt);
    updateWanted(dt);
    updateCollisions(dt);
    updateMission(dt);
    updateTaxi(dt);
    updateVigilante(dt);
    updatePickups(dt);
    updatePrompt();
    updateParticles(dt);
    updateCamera(dt);
    // A parked car the player left keeps a little roll.
    for (const car of state.cars) {
      if (car.driver === null && !car.wreck) {
        car.x += car.vx * dt;
        car.y += car.vy * dt;
        car.vx *= 1 - 3 * dt;
        car.vy *= 1 - 3 * dt;
      }
    }
  }

  // One-shot actions, called once per frame by main (never per fixed step).
  function handleActions(actions, input) {
    const ENTER = 4;
    const HORN = 16;
    if (actions & HORN && state.player.inCar) audio.horn();
    if (actions & ENTER) {
      if (state.prompt) doPromptAction();
      else if (!state.overlay) tryEnterCar();
    }
    if (input && input.pressed('KeyQ') && state.player.hasSmg && !state.player.inCar) {
      state.player.weapon = state.player.weapon === 'pistol' ? 'smg' : 'pistol';
      showMessage(WEAPONS[state.player.weapon].name, 1.2);
      audio.click();
    }
  }

  // Advance an overlay with the confirm key. Returns true when it closed one.
  function advanceOverlay() {
    if (state.overlay === OVERLAY_BRIEFING) {
      const mission = state.overlayData.mission;
      startMission(mission);
      return true;
    }
    if (state.overlay === OVERLAY_BUSTED || state.overlay === OVERLAY_WASTED) {
      respawn();
      return true;
    }
    if (state.overlay === OVERLAY_DONE || state.overlay === OVERLAY_FAIL || state.overlay === OVERLAY_COMPLETE) {
      state.overlay = null;
      state.overlayData = null;
      return true;
    }
    return false;
  }

  function declineBriefing() {
    if (state.overlay === OVERLAY_BRIEFING) {
      state.overlay = null;
      state.overlayData = null;
      return true;
    }
    return false;
  }

  function hour() {
    return Math.floor(state.clock / 60);
  }

  function isNight() {
    const h = hour();
    return h < 6 || h >= 20;
  }

  function isDusk() {
    const h = hour();
    return (h >= 17 && h < 20) || (h >= 6 && h < 8);
  }

  reset(true);
  return {
    state, city, reset, step, stepAmbient, handleActions, advanceOverlay, declineBriefing,
    save, load, hasSave, startMission, currentObjective, playerPos,
    addWanted, setWanted, clearWanted, spawnPoliceCar, spawnCop, makePed, makeCar,
    spawnTrafficCar, showMessage, showBanner, hour, isNight, isDusk, explodeCar,
  };
}
