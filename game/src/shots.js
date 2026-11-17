// The screenshot scenes behind ?shot=cover|drive|title|foot. Each one plays the
// real game forward from a fresh world for a few seconds, steered by a simple
// autopilot, so the frame is what real play looks like and the same seed always
// gives the same frame. The cover is the densest frame: a chase with a mission
// objective, wanted stars, police, traffic and pedestrians in one shot.
//
// Staging rules learned the hard way: random traffic and pedestrians wander
// into the player's path and brake the autopilot (or get run over and raise
// the wanted level), so each driving scene clears the random city first and
// places only the vehicles and people the frame needs. Mission banners last
// three seconds, so a scene either runs longer than that or lets the banner
// fade in a pre-roll before the action starts.
import { STEP } from './config.js';
import { missionById } from './missions.js';
import { SCREEN_TITLE, SCREEN_PLAY } from './render.js';

const STUB_INPUT = {
  axis: () => ({ x: 0, y: 0 }),
  mouse: { x: 640, y: 360, down: false },
  handbrake: () => false,
  running: () => false,
  pressed: () => false,
};

// Empty the city of its random traffic, pedestrians and cops: the scene places
// its own cast afterwards, so nothing unscripted can spoil the frame.
function clearCity(world) {
  const state = world.state;
  state.cars.length = 0;
  state.peds.length = 0;
  state.cops.length = 0;
}

function putPlayerInCar(world, type, x, y, angle, speed, color) {
  const state = world.state;
  const car = world.makeCar(type, x, y, angle, 'player');
  car.speed = speed || 0;
  car.vx = Math.cos(angle) * car.speed;
  car.vy = Math.sin(angle) * car.speed;
  if (color) car.color = color;
  state.player.inCar = car;
  state.player.x = x;
  state.player.y = y;
  state.camera.x = x;
  state.camera.y = y;
  return car;
}

// A traffic car placed exactly where the shot needs it, driving its lane.
function placeTraffic(world, type, x, y, axis, dir, speed) {
  const car = world.makeCar(type, x, y, 0, 'traffic');
  car.ai = { axis, road: axis === 'y' ? x : y, dir, targetSpeed: speed || 230, stuck: 0, turnCd: 3 };
  car.angle = axis === 'y' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  car.speed = car.ai.targetSpeed;
  return car;
}

function placePed(world, x, y, tx, ty) {
  const ped = world.makePed(x, y, false);
  ped.tx = tx;
  ped.ty = ty;
  return ped;
}

// Drive down a road: hold the throttle up to a cruise speed, steer for the
// lane, brake only for a car actually in the way — ahead of the player, in the
// same lane, and not oncoming. (Oncoming traffic in the other lane must not
// make the autopilot brake, or the car crawls and the police catch up.)
function driveScript(world, laneCoord, vertical, cruise) {
  const state = world.state;
  const car = state.player.inCar;
  if (!car) return { throttle: 0, steer: 0 };
  const off = vertical ? laneCoord - car.x : laneCoord - car.y;
  const steer = Math.max(-1, Math.min(1, off * 0.02));
  let throttle = car.speed < cruise ? 1 : 0;
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  for (const other of state.cars) {
    if (other === car || other.wreck) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * hx + dy * hy;
    const lateral = Math.abs(-dx * hy + dy * hx);
    if (ahead <= 0 || ahead >= 150 || lateral >= 32) continue;
    // Same direction (or stopped): a real obstacle. Oncoming: let it pass.
    if (other.vx * hx + other.vy * hy > -50) {
      throttle = 0;
      break;
    }
  }
  return { throttle, steer };
}

// The cover: a chase with everything in frame at once — a mission objective,
// three wanted stars, two police cars on the tail, a foot cop, traffic ahead
// and pedestrians on the sidewalk, the player mid-flight at speed.
//
// The player cruises at 500, slower than the police top speed (650 at three
// stars), so the chase closes instead of escaping; the police join 1.2 s in,
// 420 px behind, and end the run about 200 px back. The run is 3.2 s so the
// mission banner (3 s) has faded before the shutter falls.
function stageCover(world) {
  world.reset(true);
  clearCity(world);
  world.state.clock = 12 * 60;
  world.startMission(missionById('m3'));
  world.setWanted(3);
  putPlayerInCar(world, 'sports', 1650, 1627, 0, 470, '#c94f43');
  // Cross-avenue traffic timed to be in frame but clear of the player's road
  // when the shutter falls, plus a taxi ahead in the player's lane.
  placeTraffic(world, 'sedan', 2550, 1000, 'y', 1, 220);
  placeTraffic(world, 'van', 3450, 2300, 'y', -1, 190);
  placeTraffic(world, 'taxi', 2900, 1654, 'x', 1, 240);
  // Pedestrians near where the player ends up (x ~3250).
  placePed(world, 3100, 1550, 3300, 1550);
  placePed(world, 3350, 1710, 3150, 1710);
  placePed(world, 3000, 1550, 3200, 1550);
  placePed(world, 3550, 1550, 3350, 1550);
  const state = world.state;
  for (let i = 0; i < 1.2 / STEP; i += 1) {
    world.step(STEP, STUB_INPUT, driveScript(world, 1627, false, 500));
  }
  const px = state.player.inCar.x;
  const p1 = world.spawnPoliceCar(px - 420, 1600);
  const p2 = world.spawnPoliceCar(px - 470, 1654);
  if (p1) p1.speed = 500;
  if (p2) p2.speed = 480;
  for (let i = 0; i < 2 / STEP; i += 1) {
    world.step(STEP, STUB_INPUT, driveScript(world, 1627, false, 500));
  }
  // A foot cop just ahead of the player, caught mid-pursuit.
  world.spawnCop(state.player.x + 320, 1560);
  world.step(STEP, STUB_INPUT, driveScript(world, 1627, false, 500));
  return { screen: SCREEN_PLAY };
}

// A golden-hour cruise downtown: mission objective, oncoming traffic passing
// in the far lane, pedestrians on the sidewalk, speed lines on the road.
function stageDrive(world) {
  world.reset(true);
  clearCity(world);
  world.state.clock = 17 * 60 + 20;
  world.startMission(missionById('m2'));
  // Let the mission banner fade before the drive starts.
  for (let i = 0; i < 3.2 / STEP; i += 1) world.step(STEP, STUB_INPUT, null);
  putPlayerInCar(world, 'sports', 3027, 2500, -Math.PI / 2, 380, '#3f6fb8');
  // Oncoming traffic in the far lane, timed to pass the player mid-frame.
  placeTraffic(world, 'sedan', 3000, 300, 'y', 1, 220);
  placeTraffic(world, 'taxi', 3000, 700, 'y', 1, 240);
  placeTraffic(world, 'van', 3000, 1100, 'y', 1, 200);
  // Pedestrians near where the player ends up (y ~820).
  placePed(world, 2960, 850, 2960, 1050);
  placePed(world, 3100, 1000, 3100, 800);
  placePed(world, 2960, 1150, 2960, 950);
  for (let i = 0; i < 2.4 / STEP; i += 1) {
    world.step(STEP, STUB_INPUT, driveScript(world, 3027, true, 780));
  }
  return { screen: SCREEN_PLAY };
}

function stageTitle(world) {
  world.reset(true);
  world.state.clock = 9 * 60;
  for (let i = 0; i < 10 / STEP; i += 1) world.stepAmbient(STEP);
  return { screen: SCREEN_TITLE };
}

// A warehouse shootout. The pre-roll runs with no wanted level (a wanted
// player standing still gets busted by a foot cop), then the player drops at
// the warehouse door, the wanted level goes up, and the fight runs just long
// enough for tracers and muzzle flashes — killing a guard adds no wanted, so
// the only message pill is the one from setWanted, which fades by the shot.
function stageFoot(world) {
  world.reset(true);
  world.state.clock = 10 * 60 + 30;
  world.startMission(missionById('m5'));
  for (let i = 0; i < 3.2 / STEP; i += 1) world.step(STEP, STUB_INPUT, null);
  const state = world.state;
  state.player.x = 750;
  state.player.y = 2840;
  state.player.angle = Math.PI / 2;
  state.camera.x = 750;
  state.camera.y = 2900;
  world.setWanted(2);
  for (let i = 0; i < 2.1 / STEP; i += 1) {
    let guard = null;
    let bd = Infinity;
    for (const ped of state.peds) {
      if (!ped.guard || ped.state === 'dead') continue;
      const d = Math.hypot(ped.x - state.player.x, ped.y - state.player.y);
      if (d < bd) {
        bd = d;
        guard = ped;
      }
    }
    const script = guard
      ? { mx: 0, my: 0, shoot: true, aimX: guard.x, aimY: guard.y }
      : { mx: 0, my: 0, shoot: false };
    world.step(STEP, STUB_INPUT, script);
  }
  return { screen: SCREEN_PLAY };
}

export function stageShot(name, world) {
  if (name === 'cover') return stageCover(world);
  if (name === 'drive') return stageDrive(world);
  if (name === 'foot') return stageFoot(world);
  return stageTitle(world);
}
