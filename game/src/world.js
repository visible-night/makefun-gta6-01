// Solmar City's simulation: the hero on foot and behind the wheel, traffic,
// walkers, the police and the heat they bring, story missions, side jobs,
// shops and the save file. Nothing here draws or touches the DOM apart from
// localStorage; the renderer paints this state and main.js runs the loop.
// Every jolt, freeze and particle burst goes through the juice module, which
// the renderer reads back each frame.
import {
  STEP, WORLD_W, WORLD_H, CAR_TYPES, CAR_COLORS, PED_SHIRTS, PED_PANTS, WEAPONS,
  WANTED_MAX, EVADE_SECONDS, COP_SIGHT, BUST_SECONDS, CAR_BUST_SECONDS, PLAYER,
  START_MONEY, PACKAGE_REWARD, SPRAY_BASE, TAXI_FARE_MIN, TAXI_FARE_MAX,
  VIGILANTE_REWARD, NEAR_MISS_REWARD, NEAR_MISS_COOLDOWN,
  CLOCK_START_MINUTES, MINUTES_PER_SECOND, SAVE_KEY, JUICE, SPAWN, STARTER_CAR,
} from './config.js';
import { buildCity } from './city.js';
import { missionById, nextMission } from './missions.js';
import { createJuice } from './juice.js';

export const OVERLAY_BRIEFING = 'briefing';
export const OVERLAY_BUSTED = 'busted';
export const OVERLAY_WASTED = 'wasted';
export const OVERLAY_DONE = 'done';
export const OVERLAY_FAIL = 'fail';
export const OVERLAY_COMPLETE = 'complete';

// How busy the streets and sidewalks stay, and how the heat scales.
const TRAFFIC_COUNT = 22;
const PARKED_COUNT = 14;
const PED_COUNT = 42;
const COP_FOOT = [0, 2, 3, 4, 5, 6];
const COP_CARS = [0, 0, 1, 2, 3, 4];
const TAU = Math.PI * 2;
const ENTER_BUFFER = 0.15;

function gap(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function aimAt(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function normAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

let nextCarId = 1;

export function createWorld(rand, audio, reduceMotion) {
  const city = buildCity(rand);
  const juice = createJuice(rand, !!reduceMotion);
  const sim = {
    city,
    juice,
    time: 0,
    clock: CLOCK_START_MINUTES,
    player: null,
    cars: [],
    peds: [],
    cops: [],
    tracers: [],
    floats: [],
    pickups: [],
    wanted: 0,
    evade: 0,
    bustT: 0,
    starPulseT: -10,
    nearMissCd: 0,
    enterBufferedUntil: 0,
    hint: null,
    camera: { x: SPAWN.x, y: SPAWN.y },
    zoom: 1,
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
    stats: { kills: 0, packages: 0, fares: 0, missions: 0, deaths: 0, busts: 0, shots: 0, playTime: 0, distance: 0 },
    doneMissions: [],
    storyDone: false,
    saveFlash: 0,
  };
  // The renderer reads the particle pool straight off the sim.
  sim.particles = juice.particles;

  function freshPlayer() {
    return {
      x: SPAWN.x, y: SPAWN.y, angle: SPAWN.angle, hp: PLAYER.maxHp, armor: 0,
      money: START_MONEY, weapon: 'pistol', hasSmg: false,
      fireCd: 0, inCar: null, walkPhase: 0, moving: false, aimX: SPAWN.x + 100, aimY: SPAWN.y,
    };
  }

  function floatText(x, y, text, color) {
    sim.floats.push({ x, y, text, color: color || '#ffffff', life: 1.6 });
    if (sim.floats.length > 40) sim.floats.shift();
  }

  function emit(x, y, count, color, speed, life, size, opts) {
    juice.burst(x, y, count, color, speed, life, size, opts);
  }

  function showMessage(text, seconds) {
    sim.message = { text, t: seconds || 3 };
  }

  function showBanner(title, sub, seconds) {
    sim.banner = { title, sub: sub || '', t: seconds || 3 };
  }

  function makeCar(type, x, y, angle, driver) {
    const spec = CAR_TYPES[type];
    const car = {
      id: nextCarId++,
      type, spec,
      x, y, angle, vx: 0, vy: 0, speed: 0,
      hp: spec.hp, maxHp: spec.hp,
      color: type === 'taxi' ? '#e8c832' : type === 'police' ? '#f2f4f6' : rand.pick(CAR_COLORS),
      driver: driver || null,
      ai: null, police: type === 'police', wreck: false, wreckT: 0,
      criminal: false, brake: false, reversing: false, lean: 0, skidAcc: 0,
      sirenPhase: rand.next() * TAU,
    };
    sim.cars.push(car);
    return car;
  }

  function makePed(x, y, guard) {
    const ped = {
      x, y, angle: rand.next() * TAU, hp: guard ? 60 : 30,
      state: 'walk', speed: rand.range(55, 85),
      tx: x, ty: y, shirt: rand.pick(PED_SHIRTS), pants: rand.pick(PED_PANTS),
      skin: rand.pick(['#e8b88a', '#c98d5f', '#8a5a34', '#f0c8a0']),
      fleeT: 0, deadT: 0, guard: !!guard, fireCd: rand.range(0.5, 1.5),
      walkPhase: rand.next() * TAU, retarget: 0,
    };
    sim.peds.push(ped);
    return ped;
  }

  function playerPos() {
    const hero = sim.player;
    if (hero.inCar) return { x: hero.inCar.x, y: hero.inCar.y };
    return { x: hero.x, y: hero.y };
  }

  function nearestCar(x, y, maxD, skipWreck) {
    let best = null;
    let bd = maxD;
    for (const car of sim.cars) {
      if (skipWreck && car.wreck) continue;
      const d = gap(x, y, car.x, car.y);
      if (d < bd) {
        bd = d;
        best = car;
      }
    }
    return best;
  }

  function spawnTrafficCar(farFromPlayer) {
    for (let tries = 0; tries < 12; tries += 1) {
      const spot = city.randomRoadPoint(rand);
      if (farFromPlayer && gap(spot.x, spot.y, playerPos().x, playerPos().y) < 700) continue;
      const type = rand.pick(['sedan', 'sedan', 'sedan', 'taxi', 'van', 'truck', 'sports', 'limo']);
      const car = makeCar(type, spot.x, spot.y, 0, 'traffic');
      const dir = rand.chance(0.5) ? 1 : -1;
      car.ai = {
        axis: spot.axis, road: spot.axis === 'y' ? spot.x : spot.y, dir,
        targetSpeed: rand.range(190, 270), stuck: 0, turnCd: rand.range(1, 4),
      };
      car.angle = spot.axis === 'y' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      car.speed = car.ai.targetSpeed;
      return car;
    }
    return null;
  }

  function spawnParkedCar() {
    const spot = city.randomParkedSpot(rand);
    const type = rand.pick(['sedan', 'sedan', 'taxi', 'van', 'sports', 'truck']);
    return makeCar(type, spot.x, spot.y, spot.angle, 'parked');
  }

  function spawnCop(x, y) {
    const cop = { x, y, angle: 0, hp: 50, bustT: 0, walkPhase: rand.next() * TAU, leaving: false };
    sim.cops.push(cop);
    return cop;
  }

  function spawnPoliceCar(x, y) {
    const car = makeCar('police', x, y, aimAt(x, y, playerPos().x, playerPos().y), 'police');
    car.ai = { axis: 'chase', targetSpeed: 0, stuck: 0, turnCd: 0 };
    return car;
  }

  function setupPickups() {
    sim.pickups = [
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
    sim.time = 0;
    sim.clock = CLOCK_START_MINUTES;
    sim.player = freshPlayer();
    sim.cars = [];
    sim.peds = [];
    sim.cops = [];
    sim.tracers = [];
    sim.floats = [];
    sim.wanted = 0;
    sim.evade = 0;
    sim.bustT = 0;
    sim.starPulseT = -10;
    sim.nearMissCd = 0;
    sim.enterBufferedUntil = 0;
    sim.hint = null;
    sim.overlay = null;
    sim.overlayData = null;
    sim.mission = null;
    sim.missionOffer = null;
    sim.taxi = null;
    sim.vigilante = null;
    sim.prompt = null;
    sim.message = null;
    sim.banner = null;
    sim.storyDone = false;
    sim.saveFlash = 0;
    sim.zoom = 1;
    sim.camera = { x: SPAWN.x, y: SPAWN.y };
    juice.trauma = 0;
    juice.freezeT = 0;
    juice.skids.length = 0;
    juice.rings.length = 0;
    juice.flashes.length = 0;
    for (const p of juice.particles) p.life = 0;
    if (newGame) {
      sim.stats = { kills: 0, packages: 0, fares: 0, missions: 0, deaths: 0, busts: 0, shots: 0, playTime: 0, distance: 0 };
      sim.doneMissions = [];
      for (const pkg of city.packages) pkg.taken = false;
    }
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar(false);
    for (let i = 0; i < PARKED_COUNT; i += 1) spawnParkedCar();
    // The opening is a drive, not a walk: the first car is always right there.
    makeCar(STARTER_CAR.type, STARTER_CAR.x, STARTER_CAR.y, STARTER_CAR.angle, 'parked');
    // Two parked cruisers by the precinct, for the vigilante job.
    makeCar('police', 2100, 2380, Math.PI / 2, 'parked');
    makeCar('police', 2145, 2380, Math.PI / 2, 'parked');
    // A sports car by the hotel, worth stealing.
    makeCar('sports', 4350, 640, Math.PI, 'parked');
    // A taxi waiting at the depot.
    makeCar('taxi', 750, 1540, 0, 'parked');
    for (let i = 0; i < PED_COUNT; i += 1) {
      const spot = city.randomSidewalkPoint(rand);
      const ped = makePed(spot.x, spot.y, false);
      const next = city.randomSidewalkPoint(rand);
      ped.tx = next.x;
      ped.ty = next.y;
    }
    setupPickups();
  }

  // ---- Wanted ----
  function addWanted(n) {
    if (sim.wanted >= WANTED_MAX) return;
    sim.wanted = Math.min(WANTED_MAX, sim.wanted + n);
    sim.evade = 0;
    sim.starPulseT = sim.time;
    juice.redPulse(0.35);
    audio.star();
    showMessage(`Wanted level ${sim.wanted}`, 2);
  }

  function setWanted(n) {
    if (n > sim.wanted) addWanted(n - sim.wanted);
  }

  function clearWanted() {
    sim.wanted = 0;
    sim.evade = 0;
    for (const cop of sim.cops) cop.leaving = true;
  }

  // ---- Damage ----
  function hurtHero(dmg) {
    const hero = sim.player;
    if (hero.hp <= 0) return;
    const absorbed = Math.min(hero.armor, dmg * 0.6);
    hero.armor -= absorbed;
    hero.hp -= (dmg - absorbed);
    juice.addTrauma(0.22);
    juice.redPulse(0.3);
    if (hero.hp <= 0) {
      hero.hp = 0;
      wasted();
    }
  }

  function spookPeds(x, y, radius) {
    for (const ped of sim.peds) {
      if (ped.state === 'dead' || ped.guard) continue;
      if (gap(ped.x, ped.y, x, y) < radius) {
        ped.state = 'flee';
        ped.fleeT = rand.range(2.5, 4.5);
      }
    }
  }

  function hurtPed(ped, dmg, byPlayer) {
    if (ped.state === 'dead') return;
    ped.hp -= dmg;
    emit(ped.x, ped.y, 4, '#a83226', 90, 0.4, 3);
    if (ped.hp <= 0) {
      ped.state = 'dead';
      ped.deadT = 0;
      emit(ped.x, ped.y, 10, '#a83226', 130, 0.6, 4);
      if (byPlayer) {
        sim.stats.kills += 1;
        juice.freeze(JUICE.freezeKill);
        juice.addTrauma(0.08);
        if (ped.guard) {
          if (sim.mission && sim.mission.def.steps[sim.mission.step].type === 'kill') {
            sim.mission.data.killed = (sim.mission.data.killed || 0) + 1;
          }
        } else {
          addWanted(1);
        }
        if (rand.chance(0.4)) {
          sim.pickups.push({
            x: ped.x + rand.range(-20, 20), y: ped.y + rand.range(-20, 20),
            kind: 'cash', amount: rand.int(20, 60), respawn: 0, temp: true,
          });
        }
      }
      spookPeds(ped.x, ped.y, 320);
    } else if (byPlayer) {
      ped.state = 'flee';
      ped.fleeT = 3;
      spookPeds(ped.x, ped.y, 220);
    }
  }

  function hurtCar(car, dmg, byPlayer) {
    if (car.wreck) return;
    car.hp -= dmg;
    if (car.hp <= 30 && car.hp > 0 && rand.chance(0.3)) {
      emit(car.x, car.y - 6, 2, '#555555', 40, 0.8, 5);
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
    emit(car.x, car.y, 42, ['#ff8c2e', '#ffd76e', '#ff5a2e'], 280, 0.9, 7);
    emit(car.x, car.y, 26, '#555555', 120, 1.6, 8);
    emit(car.x, car.y, 16, '#ffd76e', 340, 0.5, 5);
    juice.ring(car.x, car.y, 190, '#ffd76e');
    juice.ring(car.x, car.y, 120, '#ff8c2e');
    juice.flash(0.14, '#fff2c9');
    juice.addTrauma(0.7);
    juice.freeze(JUICE.freezeExplode);
    juice.zoomPunch = 0.07;
    audio.explosion();
    if (sim.player.inCar === car) {
      sim.player.inCar = null;
      sim.player.x = car.x + 40;
      sim.player.y = car.y + 30;
      hurtHero(25);
      showMessage('Your car blew up!', 2.5);
    }
    if (car.criminal && byPlayer) {
      sim.player.money += VIGILANTE_REWARD;
      floatText(car.x, car.y - 30, `+$${VIGILANTE_REWARD}`, '#57d977');
      audio.cash();
      showMessage('Criminal stopped! +$' + VIGILANTE_REWARD, 2.5);
      sim.vigilante = null;
    }
    if (car.police && byPlayer) addWanted(1);
    spookPeds(car.x, car.y, 420);
    // Chain: nearby cars catch fire.
    for (const other of sim.cars) {
      if (other !== car && !other.wreck && gap(car.x, car.y, other.x, other.y) < 90) {
        hurtCar(other, 60, false);
      }
    }
  }

  // True when no building stands between the two points.
  function canSee(ax, ay, bx, by) {
    const d = gap(ax, ay, bx, by);
    const steps = Math.ceil(d / 24);
    for (let i = 1; i < steps; i += 1) {
      const frac = i / steps;
      if (city.pointInBuilding(ax + (bx - ax) * frac, ay + (by - ay) * frac)) return false;
    }
    return true;
  }

  // ---- Shooting ----
  function fireWeapon() {
    const hero = sim.player;
    const weapon = WEAPONS[hero.weapon];
    if (hero.fireCd > 0 || hero.inCar) return;
    hero.fireCd = weapon.rate;
    sim.stats.shots += 1;
    const centerAim = aimAt(hero.x, hero.y, hero.aimX, hero.aimY);
    const a = centerAim + (rand.next() - 0.5) * 2 * weapon.spread;
    const sx = hero.x + Math.cos(a) * 18;
    const sy = hero.y + Math.sin(a) * 18;
    let reach = weapon.range;
    let hitPed = null;
    let hitCop = null;
    let hitCar = null;
    // The nearest thing the ray meets: a building, a ped, a cop or a car.
    for (let d = 16; d < weapon.range; d += 16) {
      const x = sx + Math.cos(a) * d;
      const y = sy + Math.sin(a) * d;
      if (city.pointInBuilding(x, y)) {
        reach = d;
        break;
      }
    }
    for (const ped of sim.peds) {
      if (ped.state === 'dead') continue;
      const dx = ped.x - sx;
      const dy = ped.y - sy;
      const along = dx * Math.cos(a) + dy * Math.sin(a);
      if (along < 0 || along > reach) continue;
      const perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
      if (perp < 15) {
        reach = along;
        hitPed = ped;
        hitCop = null;
        hitCar = null;
      }
    }
    for (const cop of sim.cops) {
      const dx = cop.x - sx;
      const dy = cop.y - sy;
      const along = dx * Math.cos(a) + dy * Math.sin(a);
      if (along < 0 || along > reach) continue;
      const perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
      if (perp < 15) {
        reach = along;
        hitCop = cop;
        hitPed = null;
        hitCar = null;
      }
    }
    for (const car of sim.cars) {
      if (car.wreck) continue;
      const dx = car.x - sx;
      const dy = car.y - sy;
      const along = dx * Math.cos(a) + dy * Math.sin(a);
      if (along < 0 || along > reach) continue;
      const lx = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const ly = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
      if (Math.abs(lx) < car.spec.w / 2 + 4 && Math.abs(ly) < car.spec.h / 2 + 4) {
        reach = along;
        hitCar = car;
        hitPed = null;
        hitCop = null;
      }
    }
    const tipX = sx + Math.cos(a) * reach;
    const tipY = sy + Math.sin(a) * reach;
    sim.tracers.push({ x0: sx, y0: sy, x1: tipX, y1: tipY, life: 0.07, color: weapon.tracer });
    emit(sx, sy, 2, '#ffd76e', 120, 0.1, 3);
    juice.muzzle(sx, sy, a);
    juice.addTrauma(0.03);
    audio.shot();
    if (hitPed) {
      hurtPed(hitPed, weapon.dmg, true);
      audio.hit();
    } else if (hitCop) {
      hitCop.hp -= weapon.dmg;
      audio.hit();
      if (hitCop.hp <= 0) {
        sim.cops.splice(sim.cops.indexOf(hitCop), 1);
        emit(hitCop.x, hitCop.y, 10, '#a83226', 130, 0.6, 4);
        sim.stats.kills += 1;
        juice.freeze(JUICE.freezeKill);
        addWanted(1);
      }
    } else if (hitCar) {
      hurtCar(hitCar, weapon.dmg, true);
      emit(tipX, tipY, 4, '#ffd76e', 140, 0.25, 3);
      audio.hit();
      if (hitCar.police) addWanted(1);
    } else {
      emit(tipX, tipY, 3, '#cccccc', 100, 0.2, 2);
    }
    spookPeds(hero.x, hero.y, 260);
  }

  // ---- Cars: entering, leaving, driving ----
  function tryEnterCar() {
    const hero = sim.player;
    if (hero.inCar) {
      exitCar();
      return;
    }
    const car = nearestCar(hero.x, hero.y, 95, true);
    if (!car) return;
    if (car.driver === 'police') {
      showMessage('That police car is occupied', 2);
      return;
    }
    if (car.driver === 'traffic') {
      // Carjacking: the driver bails, the law notices.
      addWanted(1);
      showMessage('Carjacked! The cops noticed.', 2.5);
      const spot = city.randomSidewalkPoint(rand);
      const driver = makePed(car.x + 30, car.y + 20, false);
      driver.state = 'flee';
      driver.fleeT = 4;
      driver.tx = spot.x;
      driver.ty = spot.y;
    }
    car.driver = 'player';
    car.ai = null;
    hero.inCar = car;
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    juice.addTrauma(0.06);
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
    const hero = sim.player;
    const car = hero.inCar;
    if (!car) return;
    hero.inCar = null;
    car.driver = null;
    car.speed *= 0.2;
    // Step out on the car's left side.
    const side = car.angle + Math.PI / 2;
    const [nx, ny] = city.resolveCircle(car.x + Math.cos(side) * 34, car.y + Math.sin(side) * 34, PLAYER.radius);
    hero.x = nx;
    hero.y = ny;
    hero.angle = car.angle;
    audio.engine(0, false);
    audio.skid(0);
    if (sim.taxi && sim.taxi.active) {
      sim.taxi = null;
      showMessage('Fare cancelled', 2);
    }
    if (sim.vigilante) {
      sim.vigilante.paused = true;
      showMessage('Vigilante paused — get back in a police car', 2.5);
    }
  }

  function updatePlayerCar(dt, input, script) {
    const hero = sim.player;
    const car = hero.inCar;
    const spec = car.spec;
    let throttle = 0;
    let steer = 0;
    let handbrake = false;
    if (script) {
      throttle = script.throttle || 0;
      steer = script.steer || 0;
      handbrake = !!script.handbrake;
    } else {
      const stick = input.axis();
      throttle = -stick.y;
      steer = stick.x;
      handbrake = input.handbrake();
    }
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    let speed = car.vx * fx + car.vy * fy;
    let side = -car.vx * fy + car.vy * fx;
    if (throttle > 0) speed += spec.accel * throttle * dt;
    else if (throttle < 0) {
      if (speed > 20) speed -= spec.brake * dt;
      else speed = Math.max(-spec.reverse, speed + spec.accel * 0.6 * throttle * dt);
    }
    speed -= speed * 0.25 * dt;
    speed = clamp(speed, -spec.reverse, spec.max);
    const turnBite = clamp(Math.abs(speed) / 130, 0, 1) * (speed < 0 ? -1 : 1);
    car.angle += steer * spec.turn * turnBite * dt * (handbrake ? 1.35 : 1);
    const grip = handbrake ? 2.2 : spec.grip;
    side *= Math.exp(-grip * dt);
    if (handbrake) speed -= speed * 0.8 * dt;
    car.vx = Math.cos(car.angle) * speed + -Math.sin(car.angle) * side;
    car.vy = Math.sin(car.angle) * speed + Math.cos(car.angle) * side;
    car.speed = speed;
    car.brake = throttle < 0 || handbrake;
    car.reversing = speed < -5;
    // The body leans into the slide; the renderer draws it.
    car.lean += (clamp(-side / 260, -1, 1) * 0.07 - car.lean) * Math.min(1, 10 * dt);
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    sim.stats.distance += Math.abs(speed) * dt;
    // Drifting: skid marks, smoke and a screech while the tail is out.
    const slip = Math.abs(side);
    const drifting = slip > JUICE.skidMinSlip && Math.abs(speed) > 150;
    if (drifting) {
      car.skidAcc += dt;
      if (car.skidAcc > 0.03) {
        car.skidAcc = 0;
        const bx = car.x - fx * (spec.w / 2 - 6);
        const by = car.y - fy * (spec.w / 2 - 6);
        const px = -fy;
        const py = fx;
        juice.skidMark(bx + px * (spec.h / 2 - 3), by + py * (spec.h / 2 - 3), car.angle);
        juice.skidMark(bx - px * (spec.h / 2 - 3), by - py * (spec.h / 2 - 3), car.angle);
      }
      if (rand.chance(0.4)) emit(car.x, car.y, 1, '#bbbbbb', 30, 0.7, 5);
      audio.skid(clamp(slip / 420, 0, 1));
    } else {
      audio.skid(0);
    }
    // Buildings: bounce off with damage, shake and a freeze on a hard hit.
    const wall = hitsBuilding(car);
    if (wall) {
      const impact = Math.abs(speed) + Math.abs(side);
      car.x -= car.vx * dt * 2;
      car.y -= car.vy * dt * 2;
      car.vx *= -0.25;
      car.vy *= -0.25;
      car.speed *= -0.25;
      if (impact > 120) {
        hurtCar(car, impact * 0.06, false);
        emit(car.x + fx * 20, car.y + fy * 20, 8, '#ffd76e', 180, 0.4, 3);
        audio.crash();
        juice.addTrauma(clamp(0.15 + impact / 1400, 0.15, 0.55));
        if (impact > 380) {
          juice.freeze(JUICE.freezeCrash);
          hurtHero(impact * 0.02);
        }
      }
    }
    car.x = clamp(car.x, 24, WORLD_W - 24);
    car.y = clamp(car.y, 24, WORLD_H - 24);
    audio.engine(clamp(Math.abs(speed) / spec.max, 0, 1), true);
    if (car.hp < 35) {
      emit(car.x, car.y, 1, '#333333', 30, 1.2, 6);
      if (car.hp < 20 && rand.chance(0.25)) emit(car.x, car.y, 1, '#ff8c2e', 60, 0.4, 5);
    }
  }

  // A car's corners against the buildings; returns the building hit, or null.
  function hitsBuilding(car) {
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
    const hero = sim.player;
    let mx = 0;
    let my = 0;
    let shoot = false;
    if (script) {
      mx = script.mx || 0;
      my = script.my || 0;
      shoot = !!script.shoot;
      if (script.aimX !== undefined) {
        hero.aimX = script.aimX;
        hero.aimY = script.aimY;
      }
    } else {
      const stick = input.axis();
      mx = stick.x;
      my = stick.y;
      shoot = input.mouse.down;
      hero.aimX = sim.camera.x + (input.mouse.x - sim.view.w / 2);
      hero.aimY = sim.camera.y + (input.mouse.y - sim.view.h / 2);
    }
    const len = Math.hypot(mx, my);
    const running = script ? !!script.run : input.running();
    const speed = running ? PLAYER.run : PLAYER.walk;
    if (len > 0) {
      mx /= len;
      my /= len;
      hero.x += mx * speed * dt;
      hero.y += my * speed * dt;
      hero.moving = true;
      hero.walkPhase += dt * (running ? 13 : 9);
      if (!shoot && gap(hero.aimX, hero.aimY, hero.x, hero.y) < 60) hero.angle = Math.atan2(my, mx);
    } else {
      hero.moving = false;
    }
    if (shoot || gap(hero.aimX, hero.aimY, hero.x, hero.y) >= 60) {
      hero.angle = aimAt(hero.x, hero.y, hero.aimX, hero.aimY);
    }
    [hero.x, hero.y] = city.resolveCircle(hero.x, hero.y, PLAYER.radius);
    if (hero.fireCd > 0) hero.fireCd -= dt;
    if (shoot) fireWeapon();
    audio.engine(0, false);
    audio.skid(0);
  }

  // ---- Traffic ----
  function updateTrafficCar(car, dt) {
    const ai = car.ai;
    if (!ai || car.wreck) return;
    if (ai.axis === 'chase') {
      updatePoliceCar(car, dt);
      return;
    }
    // A car ahead in the same lane, or a pedestrian in the way: slow down.
    let target = ai.targetSpeed;
    const lookX = car.x + Math.cos(car.angle) * 60;
    const lookY = car.y + Math.sin(car.angle) * 60;
    for (const other of sim.cars) {
      if (other === car || other.wreck) continue;
      if (gap(lookX, lookY, other.x, other.y) < 55) {
        target = 0;
        break;
      }
    }
    if (target > 0) {
      for (const ped of sim.peds) {
        if (ped.state !== 'dead' && gap(lookX, lookY, ped.x, ped.y) < 34) {
          target = 0;
          break;
        }
      }
    }
    if (car.criminal) target = Math.max(target, 330);
    car.speed += clamp(target - car.speed, -700 * dt, 320 * dt);
    if (Math.abs(car.speed) < 5 && target > 0) ai.stuck += dt;
    else ai.stuck = 0;
    if (ai.stuck > 4) {
      // Stuck: send it somewhere else.
      const spot = city.randomRoadPoint(rand);
      car.x = spot.x;
      car.y = spot.y;
      ai.axis = spot.axis;
      ai.road = spot.axis === 'y' ? spot.x : spot.y;
      ai.dir = rand.chance(0.5) ? 1 : -1;
      ai.stuck = 0;
    }
    // Turning at an intersection.
    ai.turnCd -= dt;
    const cross = ai.axis === 'y'
      ? city.streets.find((s) => Math.abs(car.y - s) < 46)
      : city.avenues.find((a) => Math.abs(car.x - a) < 46);
    if (cross !== undefined && ai.turnCd <= 0 && rand.chance(0.5)) {
      ai.turnCd = rand.range(2, 6);
      const newDir = rand.chance(0.5) ? 1 : -1;
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
      const spot = city.randomRoadPoint(rand);
      car.x = spot.x;
      car.y = spot.y;
      ai.axis = spot.axis;
      ai.road = spot.axis === 'y' ? spot.x : spot.y;
      ai.dir = rand.chance(0.5) ? 1 : -1;
    }
    // Criminals flee from the player.
    if (car.criminal && sim.player.inCar) {
      const here = playerPos();
      if (gap(car.x, car.y, here.x, here.y) < 300) {
        const away = aimAt(here.x, here.y, car.x, car.y);
        ai.dir = Math.abs(normAngle(away - car.angle)) < Math.PI / 2 ? ai.dir : -ai.dir;
      }
    }
  }

  function updatePoliceCar(car, dt) {
    const here = playerPos();
    const want = aimAt(car.x, car.y, here.x, here.y);
    const diff = normAngle(want - car.angle);
    const maxSpeed = 560 + sim.wanted * 30;
    car.speed += clamp(maxSpeed - car.speed, -800 * dt, 500 * dt);
    car.angle += clamp(diff, -2.6 * dt, 2.6 * dt);
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.sirenPhase += dt * 9;
    // Nudge out of buildings: police cut corners, but not through walls.
    const wall = hitsBuilding(car);
    if (wall) {
      car.x -= car.vx * dt * 2;
      car.y -= car.vy * dt * 2;
      car.angle += 0.6;
      car.speed *= 0.4;
      hurtCar(car, 5, false);
    }
    car.x = clamp(car.x, 24, WORLD_W - 24);
    car.y = clamp(car.y, 24, WORLD_H - 24);
    // Player on foot nearby: a cop gets out.
    if (!sim.player.inCar && gap(car.x, car.y, here.x, here.y) < 220 && sim.cops.length < COP_FOOT[sim.wanted] + 2) {
      spawnCop(car.x + 30, car.y + 20);
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
    if (ped.state === 'wait') return;
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const here = playerPos();
      const away = aimAt(here.x, here.y, ped.x, ped.y) + (rand.next() - 0.5) * 0.6;
      ped.angle = away;
      ped.x += Math.cos(away) * 230 * dt;
      ped.y += Math.sin(away) * 230 * dt;
      ped.walkPhase += dt * 13;
      [ped.x, ped.y] = city.resolveCircle(ped.x, ped.y, 11);
      if (ped.fleeT <= 0) {
        ped.state = 'walk';
        const next = city.randomSidewalkPoint(rand);
        ped.tx = next.x;
        ped.ty = next.y;
      }
      return;
    }
    // Walk toward the target; pick a new one on arrival.
    ped.retarget -= dt;
    const d = gap(ped.x, ped.y, ped.tx, ped.ty);
    if (d < 30 || ped.retarget <= 0) {
      const next = city.randomSidewalkPoint(rand);
      ped.tx = next.x;
      ped.ty = next.y;
      ped.retarget = rand.range(6, 14);
    }
    const a = aimAt(ped.x, ped.y, ped.tx, ped.ty);
    ped.angle = a;
    ped.x += Math.cos(a) * ped.speed * dt;
    ped.y += Math.sin(a) * ped.speed * dt;
    ped.walkPhase += dt * 8;
    [ped.x, ped.y] = city.resolveCircle(ped.x, ped.y, 11);
  }

  function updateGuard(ped, dt) {
    const here = playerPos();
    const d = gap(ped.x, ped.y, here.x, here.y);
    ped.fireCd -= dt;
    if (d < 520 && canSee(ped.x, ped.y, here.x, here.y)) {
      ped.angle = aimAt(ped.x, ped.y, here.x, here.y);
      if (d > 260) {
        ped.x += Math.cos(ped.angle) * 120 * dt;
        ped.y += Math.sin(ped.angle) * 120 * dt;
        ped.walkPhase += dt * 9;
        [ped.x, ped.y] = city.resolveCircle(ped.x, ped.y, 11);
      }
      if (ped.fireCd <= 0) {
        ped.fireCd = rand.range(0.7, 1.3);
        const hit = rand.next() < clamp(0.45 - d / 1400, 0.12, 0.45);
        const tx = hit ? here.x : here.x + rand.range(-70, 70);
        const ty = hit ? here.y : here.y + rand.range(-70, 70);
        sim.tracers.push({ x0: ped.x, y0: ped.y, x1: tx, y1: ty, life: 0.07, color: '#ff9a5c' });
        juice.muzzle(ped.x + Math.cos(ped.angle) * 18, ped.y + Math.sin(ped.angle) * 18, ped.angle);
        audio.shot();
        if (hit) {
          hurtHero(rand.int(7, 12));
          emit(here.x, here.y, 3, '#a83226', 90, 0.3, 3);
        }
      }
    } else {
      // Idle patrol around the warehouse.
      ped.retarget -= dt;
      if (ped.retarget <= 0 || gap(ped.x, ped.y, ped.tx, ped.ty) < 20) {
        const home = city.place('warehouse');
        ped.tx = home.x + rand.range(-160, 160);
        ped.ty = home.y + rand.range(-120, 120);
        ped.retarget = rand.range(3, 7);
      }
      const a = aimAt(ped.x, ped.y, ped.tx, ped.ty);
      ped.angle = a;
      ped.x += Math.cos(a) * 70 * dt;
      ped.y += Math.sin(a) * 70 * dt;
      ped.walkPhase += dt * 7;
      [ped.x, ped.y] = city.resolveCircle(ped.x, ped.y, 11);
    }
  }

  // ---- Police on foot ----
  function updateCop(cop, dt) {
    const here = playerPos();
    if (cop.leaving) {
      const away = aimAt(here.x, here.y, cop.x, cop.y);
      cop.angle = away;
      cop.x += Math.cos(away) * 160 * dt;
      cop.y += Math.sin(away) * 160 * dt;
      cop.walkPhase += dt * 10;
      [cop.x, cop.y] = city.resolveCircle(cop.x, cop.y, 11);
      return;
    }
    const d = gap(cop.x, cop.y, here.x, here.y);
    const a = aimAt(cop.x, cop.y, here.x, here.y);
    cop.angle = a;
    const speed = 245 + sim.wanted * 8;
    if (d > 24) {
      cop.x += Math.cos(a) * speed * dt;
      cop.y += Math.sin(a) * speed * dt;
      cop.walkPhase += dt * 12;
    }
    [cop.x, cop.y] = city.resolveCircle(cop.x, cop.y, 11);
    const playerCar = sim.player.inCar;
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
    const here = playerPos();
    // Keep the heat at the wanted level's strength.
    const wantFoot = COP_FOOT[sim.wanted];
    const wantCars = COP_CARS[sim.wanted];
    const footNow = sim.cops.filter((c) => !c.leaving).length;
    const carsNow = sim.cars.filter((c) => c.driver === 'police' && !c.wreck).length;
    if (sim.wanted > 0) {
      if (footNow < wantFoot) {
        const spot = city.randomSidewalkPoint(rand);
        if (gap(spot.x, spot.y, here.x, here.y) > 420 && gap(spot.x, spot.y, here.x, here.y) < 900) {
          spawnCop(spot.x, spot.y);
        } else {
          const a = rand.next() * TAU;
          const [x, y] = city.resolveCircle(here.x + Math.cos(a) * 600, here.y + Math.sin(a) * 600, 11);
          spawnCop(x, y);
        }
      }
      if (carsNow < wantCars) {
        const spot = city.randomRoadPoint(rand);
        if (gap(spot.x, spot.y, here.x, here.y) > 450) spawnPoliceCar(spot.x, spot.y);
      }
    }
    // Evading: no cop sees you, and the heat cools off one star at a time.
    if (sim.wanted > 0) {
      let seen = false;
      for (const cop of sim.cops) {
        if (!cop.leaving && gap(cop.x, cop.y, here.x, here.y) < COP_SIGHT) {
          seen = true;
          break;
        }
      }
      if (!seen) {
        for (const car of sim.cars) {
          if (car.driver === 'police' && !car.wreck && gap(car.x, car.y, here.x, here.y) < COP_SIGHT) {
            seen = true;
            break;
          }
        }
      }
      if (!seen) {
        sim.evade += dt;
        if (sim.evade >= EVADE_SECONDS) {
          sim.wanted -= 1;
          sim.evade = 0;
          if (sim.wanted === 0) {
            clearWanted();
            showMessage('You lost them!', 2.5);
          } else {
            showMessage(`Wanted level ${sim.wanted}`, 2);
          }
        }
      } else {
        sim.evade = 0;
      }
    }
    // Cops that left, far away, go home.
    sim.cops = sim.cops.filter((cop) => !cop.leaving || gap(cop.x, cop.y, here.x, here.y) < 1200);
    audio.siren(sim.wanted > 0 && sim.cars.some((c) => c.driver === 'police' && !c.wreck));
  }

  // ---- Car collisions, ped hits, near misses ----
  function updateCollisions(dt) {
    const cars = sim.cars;
    const playerCar = sim.player.inCar;
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (a.wreck) continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (b.wreck) continue;
        const d = gap(a.x, a.y, b.x, b.y);
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
            hurtCar(a, dmg, false);
            hurtCar(b, dmg, false);
            emit((a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffd76e', 150, 0.3, 3);
            if (rel > 200) {
              audio.crash();
              if (a.driver === 'player' || b.driver === 'player') {
                juice.addTrauma(clamp(0.1 + rel / 1600, 0.1, 0.4));
                if (rel > 350) juice.freeze(JUICE.freezeCrash);
              }
            }
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
    // Near miss: threading past traffic at speed pays a little and feels great.
    if (playerCar && !playerCar.wreck && sim.nearMissCd <= 0) {
      const ps = Math.hypot(playerCar.vx, playerCar.vy);
      if (ps > 300) {
        for (const other of cars) {
          if (other === playerCar || other.wreck || other.driver !== 'traffic') continue;
          const d = gap(playerCar.x, playerCar.y, other.x, other.y);
          if (d > 52 && d < 78) {
            const rel = Math.hypot(playerCar.vx - other.vx, playerCar.vy - other.vy);
            if (rel > 260) {
              sim.player.money += NEAR_MISS_REWARD;
              sim.nearMissCd = NEAR_MISS_COOLDOWN;
              floatText(playerCar.x, playerCar.y - 34, `Near miss +$${NEAR_MISS_REWARD}`, '#9fe8ff');
              audio.whoosh();
              juice.addTrauma(0.05);
              break;
            }
          }
        }
      }
    }
    // Cars vs pedestrians.
    for (const ped of sim.peds) {
      if (ped.state === 'dead') continue;
      for (const car of cars) {
        if (car.wreck) continue;
        const speed = Math.hypot(car.vx, car.vy);
        if (speed < 110) continue;
        if (gap(ped.x, ped.y, car.x, car.y) < 26) {
          hurtPed(ped, 100, car.driver === 'player');
          if (car.driver === 'player') juice.addTrauma(0.12);
          break;
        }
      }
    }
    // Cars vs the player on foot.
    const hero = sim.player;
    if (!hero.inCar && hero.hp > 0) {
      for (const car of cars) {
        if (car.wreck) continue;
        const speed = Math.hypot(car.vx, car.vy);
        if (speed < 100) continue;
        if (gap(hero.x, hero.y, car.x, car.y) < 26) {
          hurtHero(speed * 0.05);
          const a = aimAt(car.x, car.y, hero.x, hero.y);
          hero.x += Math.cos(a) * 30;
          hero.y += Math.sin(a) * 30;
          [hero.x, hero.y] = city.resolveCircle(hero.x, hero.y, PLAYER.radius);
          audio.crash();
          break;
        }
      }
    }
  }

  // ---- Missions ----
  function targetOf(step) {
    if (step.place) return city.place(step.place);
    if (step.at) return step.at;
    return null;
  }

  function currentObjective() {
    if (!sim.mission) return null;
    const def = sim.mission.def;
    const step = def.steps[sim.mission.step];
    if (!step) return null;
    let text = step.text;
    if (step.type === 'kill') text += ` (${sim.mission.data.killed || 0}/${step.count})`;
    if (step.type === 'fares') text += ` (${sim.mission.data.fares || 0}/${step.count})`;
    if (step.time) text += ` — ${Math.ceil(sim.mission.timer)}s`;
    const target = targetOf(step);
    return { title: def.title, text, target: target ? { x: target.x, y: target.y } : null };
  }

  function enterStep() {
    const job = sim.mission;
    const step = job.def.steps[job.step];
    job.data = {};
    job.timer = step.time || 0;
    job.dwell = 0;
    if (step.type === 'kill') {
      const home = city.place(step.place);
      for (let i = 0; i < step.count; i += 1) {
        const guard = makePed(home.x + rand.range(-170, 170), home.y + rand.range(-130, 130), true);
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
    sim.mission = { def, step: 0, data: {}, timer: 0, dwell: 0 };
    sim.missionOffer = null;
    sim.overlay = null;
    showBanner(def.title, `Mission started — ${def.giver}`, 3);
    enterStep();
  }

  function completeStep() {
    const job = sim.mission;
    const step = job.def.steps[job.step];
    if (step.heat) setWanted(step.heat);
    audio.pickup();
    job.step += 1;
    if (job.step >= job.def.steps.length) {
      completeMission();
    } else {
      enterStep();
    }
  }

  function completeMission() {
    const job = sim.mission;
    sim.player.money += job.def.reward;
    sim.stats.missions += 1;
    sim.doneMissions.push(job.def.id);
    sim.mission = null;
    audio.missionDone();
    save();
    if (!nextMission(sim.doneMissions)) {
      sim.storyDone = true;
      sim.overlay = OVERLAY_COMPLETE;
      sim.overlayData = { reward: job.def.reward, title: job.def.title };
    } else {
      sim.overlay = OVERLAY_DONE;
      sim.overlayData = { reward: job.def.reward, title: job.def.title };
    }
    sim.overlayT = 0;
  }

  function failMission(reason) {
    if (!sim.mission) return;
    const title = sim.mission.def.title;
    // The guards stand down.
    for (const ped of sim.peds) {
      if (ped.guard && ped.state !== 'dead') {
        ped.guard = false;
        ped.state = 'flee';
        ped.fleeT = 3;
      }
    }
    sim.mission = null;
    audio.missionFail();
    sim.overlay = OVERLAY_FAIL;
    sim.overlayData = { reason, title };
    sim.overlayT = 0;
  }

  function updateMission(dt) {
    // Offer the next mission at its start marker.
    if (!sim.mission && !sim.overlay) {
      const next = nextMission(sim.doneMissions);
      if (next) {
        const start = city.place(next.start.place);
        const here = playerPos();
        sim.missionOffer = gap(here.x, here.y, start.x, start.y) < 150 ? next : null;
      } else {
        sim.missionOffer = null;
      }
    }
    if (!sim.mission) return;
    const job = sim.mission;
    const step = job.def.steps[job.step];
    const here = playerPos();
    if (step.time) {
      job.timer -= dt;
      if (job.timer <= 0) {
        failMission('Out of time');
        return;
      }
    }
    if (step.type === 'goto') {
      const target = targetOf(step);
      const d = gap(here.x, here.y, target.x, target.y);
      if (step.needCar && !sim.player.inCar) return;
      if (d < step.r) {
        if (step.dwell) {
          job.dwell += dt;
          if (job.dwell >= step.dwell) completeStep();
        } else {
          completeStep();
        }
      } else {
        job.dwell = 0;
      }
    } else if (step.type === 'kill') {
      if ((job.data.killed || 0) >= step.count) completeStep();
    } else if (step.type === 'fares') {
      if ((job.data.fares || 0) >= step.count) completeStep();
    } else if (step.type === 'lose') {
      if (sim.wanted === 0) completeStep();
    }
  }

  // ---- Taxi job ----
  function startTaxiJob() {
    if (sim.taxi) return;
    sim.taxi = { active: true, stage: 'pickup', x: 0, y: 0, reward: 0, deadline: 0, ped: null };
    newFare();
  }

  function newFare() {
    const cab = sim.taxi;
    const from = city.randomSidewalkPoint(rand);
    const dest = city.nearestIntersection(rand.range(300, WORLD_W - 500), rand.range(300, WORLD_H - 300));
    cab.stage = 'pickup';
    cab.x = from.x;
    cab.y = from.y;
    cab.destX = dest.x;
    cab.destY = dest.y;
    cab.reward = rand.int(TAXI_FARE_MIN, TAXI_FARE_MAX);
    cab.deadline = 0;
    const ped = makePed(from.x, from.y, false);
    ped.state = 'wait';
    ped.tx = from.x;
    ped.ty = from.y;
    cab.ped = ped;
    showMessage('New fare — pick up the passenger', 2.5);
  }

  function updateTaxi(dt) {
    const cab = sim.taxi;
    if (!cab || !cab.active) return;
    const here = playerPos();
    if (cab.stage === 'pickup') {
      if (gap(here.x, here.y, cab.x, cab.y) < 70) {
        cab.stage = 'dropoff';
        cab.x = cab.destX;
        cab.y = cab.destY;
        const d = gap(here.x, here.y, cab.destX, cab.destY);
        cab.deadline = clamp(d / 320, 25, 90);
        if (cab.ped) {
          const idx = sim.peds.indexOf(cab.ped);
          if (idx !== -1) sim.peds.splice(idx, 1);
          cab.ped = null;
        }
        audio.pickup();
        showMessage('Passenger aboard — drive to the marker', 2.5);
      }
    } else {
      cab.deadline -= dt;
      if (cab.deadline <= 0) {
        showMessage('Fare failed — too slow', 2.5);
        sim.taxi = null;
        return;
      }
      if (gap(here.x, here.y, cab.x, cab.y) < 80) {
        const bonus = Math.ceil(cab.deadline / 10) * 5;
        const pay = cab.reward + bonus;
        sim.player.money += pay;
        sim.stats.fares += 1;
        floatText(here.x, here.y - 40, `+$${pay}`, '#57d977');
        audio.cash();
        if (sim.mission && sim.mission.def.steps[sim.mission.step].type === 'fares') {
          sim.mission.data.fares = (sim.mission.data.fares || 0) + 1;
        }
        if (sim.mission && sim.mission.def.steps[sim.mission.step].type === 'fares'
          && (sim.mission.data.fares || 0) < sim.mission.def.steps[sim.mission.step].count) {
          newFare();
        } else if (!sim.mission) {
          newFare();
        } else {
          sim.taxi = null;
        }
      }
    }
  }

  // ---- Vigilante job ----
  function startVigilante() {
    if (sim.vigilante && sim.vigilante.target && !sim.vigilante.target.wreck) {
      sim.vigilante.paused = false;
      return;
    }
    const spot = city.randomRoadPoint(rand);
    const car = makeCar(rand.pick(['sedan', 'sports', 'van']), spot.x, spot.y, 0, 'traffic');
    car.criminal = true;
    car.color = '#8a2e2e';
    const dir = rand.chance(0.5) ? 1 : -1;
    car.ai = { axis: spot.axis, road: spot.axis === 'y' ? spot.x : spot.y, dir, targetSpeed: 330, stuck: 0, turnCd: 1 };
    car.angle = spot.axis === 'y' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    car.speed = 300;
    sim.vigilante = { target: car, paused: false };
    showMessage('Criminal car marked in red — stop it!', 3);
  }

  function updateVigilante(dt) {
    const vig = sim.vigilante;
    if (!vig || vig.paused) return;
    if (!vig.target || vig.target.wreck) {
      sim.vigilante = null;
      if (sim.player.inCar && sim.player.inCar.type === 'police') startVigilante();
    }
  }

  // ---- Shops and prompts ----
  function updatePrompt() {
    const hero = sim.player;
    const here = playerPos();
    sim.prompt = null;
    if (sim.missionOffer) {
      sim.prompt = { text: `Start mission: ${sim.missionOffer.title}`, action: 'mission' };
      return;
    }
    if (hero.inCar) {
      const spray = city.place('spray');
      if (gap(here.x, here.y, spray.x, spray.y) < 120) {
        const cost = Math.max(50, SPRAY_BASE * sim.wanted) + (hero.inCar.hp < hero.inCar.maxHp ? 50 : 0);
        if (sim.wanted > 0 || hero.inCar.hp < hero.inCar.maxHp) {
          sim.prompt = { text: `Respray & repair — $${cost}`, action: 'spray', cost };
        }
      }
      return;
    }
    const hospital = city.place('hospital');
    if (gap(here.x, here.y, hospital.x, hospital.y) < 120 && hero.hp < PLAYER.maxHp) {
      sim.prompt = { text: 'Get treated — $100', action: 'hospital', cost: 100 };
      return;
    }
    const gun = city.place('gunshop');
    if (gap(here.x, here.y, gun.x, gun.y) < 120) {
      if (!hero.hasSmg) sim.prompt = { text: 'Buy SMG — $400', action: 'smg', cost: 400 };
      else if (hero.armor < PLAYER.maxArmor) sim.prompt = { text: 'Buy armour — $150', action: 'armor', cost: 150 };
      return;
    }
    const home = city.place('safehouse');
    if (gap(here.x, here.y, home.x, home.y) < 120) {
      sim.prompt = { text: 'Save game', action: 'save' };
    }
  }

  // The opening coach: one line at a time until the hero is driving to the
  // first objective. After that the HUD's objective panel carries it.
  function updateHint() {
    sim.hint = null;
    if (sim.time > 120 || sim.storyDone) return;
    // The mission offer already shows its own "Press E" prompt pill, so the
    // hint only speaks for the first mission's car and drive stages.
    const job = sim.mission;
    if (!job || job.def.id !== 'm1' || job.step !== 0) return;
    if (!sim.player.inCar) sim.hint = 'Walk to the car and press E to steal it';
    else sim.hint = 'Drive to the yellow marker';
  }

  function doPromptAction() {
    const ask = sim.prompt;
    if (!ask) return;
    const hero = sim.player;
    if (ask.action === 'mission') {
      sim.overlay = OVERLAY_BRIEFING;
      sim.overlayData = { mission: sim.missionOffer };
      sim.overlayT = 0;
      audio.click();
      return;
    }
    if (ask.action === 'save') {
      save();
      sim.saveFlash = 2;
      audio.pickup();
      showMessage('Game saved', 2);
      return;
    }
    if (ask.cost && hero.money < ask.cost) {
      showMessage('Not enough cash', 2);
      return;
    }
    if (ask.action === 'spray') {
      hero.money -= ask.cost;
      clearWanted();
      hero.inCar.hp = hero.inCar.maxHp;
      hero.inCar.color = rand.pick(CAR_COLORS);
      audio.cash();
      showMessage('Fresh paint — heat cleared', 2.5);
    } else if (ask.action === 'hospital') {
      hero.money -= ask.cost;
      hero.hp = PLAYER.maxHp;
      audio.pickup();
      showMessage('Patched up', 2);
    } else if (ask.action === 'smg') {
      hero.money -= ask.cost;
      hero.hasSmg = true;
      hero.weapon = 'smg';
      audio.pickup();
      showMessage('SMG bought — press Q to switch weapons', 3);
    } else if (ask.action === 'armor') {
      hero.money -= ask.cost;
      hero.armor = PLAYER.maxArmor;
      audio.pickup();
      showMessage('Armour fitted', 2);
    }
  }

  // ---- Busted / wasted ----
  function busted() {
    if (sim.overlay) return;
    const hero = sim.player;
    const fine = Math.max(50, Math.floor(hero.money * 0.1));
    hero.money -= fine;
    sim.stats.busts += 1;
    if (sim.mission) {
      sim.overlayData = { fine, failedMission: sim.mission.def.title };
      sim.mission = null;
    } else {
      sim.overlayData = { fine };
    }
    sim.overlay = OVERLAY_BUSTED;
    sim.overlayT = 0;
    audio.busted();
    audio.siren(false);
    audio.engine(0, false);
    audio.skid(0);
  }

  function wasted() {
    if (sim.overlay) return;
    const hero = sim.player;
    const bill = Math.max(50, Math.floor(hero.money * 0.1));
    hero.money -= bill;
    sim.stats.deaths += 1;
    if (sim.mission) {
      sim.overlayData = { bill, failedMission: sim.mission.def.title };
      sim.mission = null;
    } else {
      sim.overlayData = { bill };
    }
    sim.overlay = OVERLAY_WASTED;
    sim.overlayT = 0;
    audio.wasted();
    audio.siren(false);
    audio.engine(0, false);
    audio.skid(0);
  }

  function respawn() {
    const hero = sim.player;
    const place = sim.overlay === OVERLAY_BUSTED ? city.place('police') : city.place('hospital');
    if (hero.inCar) {
      hero.inCar.driver = null;
      hero.inCar = null;
    }
    hero.x = place.x;
    hero.y = place.y + 40;
    hero.hp = PLAYER.maxHp;
    hero.armor = 0;
    clearWanted();
    sim.overlay = null;
    sim.overlayData = null;
    sim.camera.x = hero.x;
    sim.camera.y = hero.y;
    sim.taxi = null;
    sim.vigilante = null;
    save();
  }

  // ---- Pickups and packages ----
  function updatePickups(dt) {
    const hero = sim.player;
    for (const pk of sim.pickups) {
      if (pk.respawn > 0) {
        pk.respawn -= dt;
        continue;
      }
      if (hero.inCar) continue;
      if (gap(hero.x, hero.y, pk.x, pk.y) < 26) {
        if (pk.kind === 'health') {
          if (hero.hp >= PLAYER.maxHp) continue;
          hero.hp = Math.min(PLAYER.maxHp, hero.hp + pk.amount);
          floatText(hero.x, hero.y - 30, `+${pk.amount} HP`, '#57d977');
        } else if (pk.kind === 'armor') {
          if (hero.armor >= PLAYER.maxArmor) continue;
          hero.armor = Math.min(PLAYER.maxArmor, hero.armor + pk.amount);
          floatText(hero.x, hero.y - 30, `+${pk.amount} armour`, '#6ea8ff');
        } else if (pk.kind === 'cash') {
          hero.money += pk.amount;
          floatText(hero.x, hero.y - 30, `+$${pk.amount}`, '#57d977');
        } else if (pk.kind === 'smg') {
          hero.hasSmg = true;
          hero.weapon = 'smg';
          floatText(hero.x, hero.y - 30, 'SMG!', '#ffd76e');
        }
        audio.pickup();
        if (pk.temp) pk.respawn = -1;
        else pk.respawn = 45;
      }
    }
    sim.pickups = sim.pickups.filter((pk) => pk.respawn >= 0);
    // Hidden packages.
    if (!hero.inCar) {
      for (const pkg of city.packages) {
        if (pkg.taken) continue;
        if (gap(hero.x, hero.y, pkg.x, pkg.y) < 28) {
          pkg.taken = true;
          hero.money += PACKAGE_REWARD;
          sim.stats.packages += 1;
          floatText(hero.x, hero.y - 30, `Hidden package! +$${PACKAGE_REWARD}`, '#ff9ad9');
          audio.cash();
          showMessage(`Hidden package ${sim.stats.packages}/20`, 2.5);
          save();
        }
      }
    }
  }

  // ---- Save / load ----
  function save() {
    try {
      const data = {
        version: 2,
        money: sim.player.money,
        hp: sim.player.hp,
        armor: sim.player.armor,
        weapon: sim.player.weapon,
        hasSmg: sim.player.hasSmg,
        doneMissions: sim.doneMissions,
        packages: city.packages.map((pkg) => (pkg.taken ? 1 : 0)),
        stats: sim.stats,
        clock: sim.clock,
        storyDone: sim.storyDone,
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
      const hero = sim.player;
      hero.money = data.money ?? START_MONEY;
      hero.hp = data.hp ?? PLAYER.maxHp;
      hero.armor = data.armor ?? 0;
      hero.weapon = data.weapon || 'pistol';
      hero.hasSmg = !!data.hasSmg;
      sim.doneMissions = data.doneMissions || [];
      sim.stats = { ...sim.stats, ...(data.stats || {}) };
      sim.clock = data.clock ?? CLOCK_START_MINUTES;
      sim.storyDone = !!data.storyDone;
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
    sim.time += dt;
    sim.clock = (sim.clock + MINUTES_PER_SECOND * dt) % (24 * 60);
    for (const car of sim.cars) {
      if (car.driver === 'traffic') updateTrafficCar(car, dt);
    }
    for (const ped of sim.peds) updatePed(ped, dt);
    juice.update(dt);
    updateEphemera(dt);
    // Slow pan across downtown.
    const t = sim.time * 0.02;
    sim.camera.x = 2400 + Math.cos(t) * 900;
    sim.camera.y = 1800 + Math.sin(t * 0.7) * 600;
  }

  // Tracers, floating texts, messages and banners all fade on their own clocks.
  function updateEphemera(dt) {
    for (let i = sim.tracers.length - 1; i >= 0; i -= 1) {
      sim.tracers[i].life -= dt;
      if (sim.tracers[i].life <= 0) sim.tracers.splice(i, 1);
    }
    for (let i = sim.floats.length - 1; i >= 0; i -= 1) {
      const f = sim.floats[i];
      f.life -= dt;
      f.y -= 26 * dt;
      if (f.life <= 0) sim.floats.splice(i, 1);
    }
    if (sim.message) {
      sim.message.t -= dt;
      if (sim.message.t <= 0) sim.message = null;
    }
    if (sim.banner) {
      sim.banner.t -= dt;
      if (sim.banner.t <= 0) sim.banner = null;
    }
    if (sim.saveFlash > 0) sim.saveFlash -= dt;
    if (sim.nearMissCd > 0) sim.nearMissCd -= dt;
  }

  function updateCamera(dt) {
    const here = playerPos();
    let tx = here.x;
    let ty = here.y;
    let zoomTarget = 1;
    if (sim.player.inCar) {
      const car = sim.player.inCar;
      tx += car.vx * 0.22;
      ty += car.vy * 0.22;
      const speed01 = clamp((Math.abs(car.speed) - 260) / 420, 0, 1);
      zoomTarget = 1 - (1 - JUICE.zoomMin) * speed01;
    }
    const k = 1 - Math.exp(-4.5 * dt);
    sim.camera.x += (tx - sim.camera.x) * k;
    sim.camera.y += (ty - sim.camera.y) * k;
    sim.zoom += (zoomTarget - sim.zoom) * Math.min(1, 2.2 * dt);
  }

  // One fixed step of the live game. `script` (screenshot autopilot) replaces input.
  function step(dt, input, script) {
    if (sim.overlay === OVERLAY_BRIEFING) return;
    if (sim.overlay === OVERLAY_BUSTED || sim.overlay === OVERLAY_WASTED
      || sim.overlay === OVERLAY_FAIL || sim.overlay === OVERLAY_DONE
      || sim.overlay === OVERLAY_COMPLETE) {
      sim.overlayT += dt;
      juice.update(dt);
      updateEphemera(dt);
      return;
    }
    // Hit-stop: the world holds still while the juice keeps decaying.
    if (juice.frozen) {
      juice.update(dt);
      updateEphemera(dt);
      return;
    }
    sim.time += dt;
    sim.stats.playTime += dt;
    sim.clock = (sim.clock + MINUTES_PER_SECOND * dt) % (24 * 60);
    if (sim.player.inCar) updatePlayerCar(dt, input, script);
    else updatePlayerFoot(dt, input, script);
    for (const car of sim.cars) {
      if (car.driver === 'traffic' || car.driver === 'police') updateTrafficCar(car, dt);
      if (car.wreck) {
        car.wreckT += dt;
        if (rand.chance(0.2)) emit(car.x, car.y, 1, '#333333', 25, 1.4, 7);
        if (car.wreckT < 3 && rand.chance(0.12)) emit(car.x, car.y, 1, '#ff8c2e', 50, 0.5, 6);
      }
    }
    sim.cars = sim.cars.filter((car) => !car.wreck || car.wreckT < 30);
    // Keep the streets busy.
    const trafficNow = sim.cars.filter((c) => c.driver === 'traffic').length;
    if (trafficNow < TRAFFIC_COUNT && rand.chance(0.02)) spawnTrafficCar(true);
    for (const ped of sim.peds) updatePed(ped, dt);
    sim.peds = sim.peds.filter((ped) => ped.state !== 'dead' || ped.deadT < 25);
    // Keep the sidewalks busy.
    const alivePeds = sim.peds.filter((ped) => ped.state !== 'dead').length;
    if (alivePeds < PED_COUNT && rand.chance(0.02)) {
      const spot = city.randomSidewalkPoint(rand);
      if (gap(spot.x, spot.y, playerPos().x, playerPos().y) > 500) makePed(spot.x, spot.y, false);
    }
    for (const cop of sim.cops) updateCop(cop, dt);
    updateWanted(dt);
    updateCollisions(dt);
    updateMission(dt);
    updateTaxi(dt);
    updateVigilante(dt);
    updatePickups(dt);
    updatePrompt();
    updateHint();
    // A buffered E press lands the moment a car or a prompt is in reach.
    if (sim.time < sim.enterBufferedUntil && !sim.overlay) {
      if (sim.prompt) {
        sim.enterBufferedUntil = 0;
        doPromptAction();
      } else if (!sim.player.inCar && nearestCar(sim.player.x, sim.player.y, 95, true)) {
        sim.enterBufferedUntil = 0;
        tryEnterCar();
      }
    }
    juice.update(dt);
    updateEphemera(dt);
    updateCamera(dt);
    // A parked car the player left keeps a little roll.
    for (const car of sim.cars) {
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
    if (actions & HORN && sim.player.inCar) audio.horn();
    if (actions & ENTER) {
      if (sim.prompt) doPromptAction();
      else if (sim.player.inCar) tryEnterCar();
      else if (nearestCar(sim.player.x, sim.player.y, 95, true)) tryEnterCar();
      else sim.enterBufferedUntil = sim.time + ENTER_BUFFER;
    }
    if (input && input.pressed('KeyQ') && sim.player.hasSmg && !sim.player.inCar) {
      sim.player.weapon = sim.player.weapon === 'pistol' ? 'smg' : 'pistol';
      showMessage(WEAPONS[sim.player.weapon].name, 1.2);
      audio.click();
    }
  }

  // Advance an overlay with the confirm key. Returns true when it closed one.
  function advanceOverlay() {
    if (sim.overlay === OVERLAY_BRIEFING) {
      const mission = sim.overlayData.mission;
      startMission(mission);
      return true;
    }
    if (sim.overlay === OVERLAY_BUSTED || sim.overlay === OVERLAY_WASTED) {
      respawn();
      return true;
    }
    if (sim.overlay === OVERLAY_DONE || sim.overlay === OVERLAY_FAIL || sim.overlay === OVERLAY_COMPLETE) {
      sim.overlay = null;
      sim.overlayData = null;
      return true;
    }
    return false;
  }

  function declineBriefing() {
    if (sim.overlay === OVERLAY_BRIEFING) {
      sim.overlay = null;
      sim.overlayData = null;
      return true;
    }
    return false;
  }

  function hour() {
    return Math.floor(sim.clock / 60);
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
    state: sim, city, juice, reset, step, stepAmbient, handleActions, advanceOverlay, declineBriefing,
    save, load, hasSave, startMission, currentObjective, playerPos,
    addWanted, setWanted, clearWanted, spawnPoliceCar, spawnCop, makePed, makeCar,
    spawnTrafficCar, showMessage, showBanner, hour, isNight, isDusk, explodeCar,
  };
}
