// The screenshot scenes behind ?shot=title|drive|chase|foot. Each one plays the real
// game forward from a fresh world for a few seconds, steered by a simple autopilot,
// so the frame is what real play looks like and the same seed always gives the same frame.
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

function putPlayerInCar(world, type, x, y, angle, speed) {
  const state = world.state;
  const car = world.makeCar(type, x, y, angle, 'player');
  car.speed = speed || 0;
  car.vx = Math.cos(angle) * car.speed;
  car.vy = Math.sin(angle) * car.speed;
  state.player.inCar = car;
  state.player.x = x;
  state.player.y = y;
  state.camera.x = x;
  state.camera.y = y;
  return car;
}

// Drive down a road: hold the throttle, steer for the lane, brake for traffic ahead.
function driveScript(world, laneCoord, vertical) {
  const state = world.state;
  const car = state.player.inCar;
  if (!car) return { throttle: 0, steer: 0 };
  const off = vertical ? laneCoord - car.x : laneCoord - car.y;
  let steer = Math.max(-1, Math.min(1, off * 0.02));
  let throttle = 1;
  const lookX = car.x + Math.cos(car.angle) * 110;
  const lookY = car.y + Math.sin(car.angle) * 110;
  for (const other of state.cars) {
    if (other === car || other.wreck) continue;
    if (Math.hypot(other.x - lookX, other.y - lookY) < 60) {
      throttle = 0; // brake and wait; never swerve into the buildings
      break;
    }
  }
  return { throttle, steer };
}

function stageTitle(world) {
  world.reset(true);
  world.state.clock = 9 * 60;
  for (let i = 0; i < 10 / STEP; i += 1) world.stepAmbient(STEP);
  return { screen: SCREEN_TITLE };
}

function stageDrive(world) {
  world.reset(true);
  world.state.clock = 17 * 60 + 20; // golden hour
  world.startMission(missionById('m2'));
  putPlayerInCar(world, 'sports', 3027, 2500, -Math.PI / 2, 380);
  for (let i = 0; i < 3 / STEP; i += 1) {
    world.step(STEP, STUB_INPUT, driveScript(world, 3027, true));
  }
  return { screen: SCREEN_PLAY };
}

function stageChase(world) {
  world.reset(true);
  world.state.clock = 12 * 60;
  world.setWanted(3);
  putPlayerInCar(world, 'sports', 1650, 1627, 0, 380);
  // Two police cars on the player's tail, close enough to stay in frame.
  const p1 = world.spawnPoliceCar(1480, 1627);
  const p2 = world.spawnPoliceCar(1400, 1573);
  if (p1) { p1.speed = 480; }
  if (p2) { p2.speed = 460; }
  world.spawnCop(2000, 1550);
  for (let i = 0; i < 2.5 / STEP; i += 1) {
    world.step(STEP, STUB_INPUT, driveScript(world, 1627, false));
  }
  return { screen: SCREEN_PLAY };
}

function stageFoot(world) {
  world.reset(true);
  world.state.clock = 10 * 60 + 30;
  world.setWanted(2);
  world.startMission(missionById('m5'));
  const state = world.state;
  state.player.x = 750;
  state.player.y = 2750;
  state.player.angle = Math.PI / 2;
  state.camera.x = 750;
  state.camera.y = 2830;
  for (let i = 0; i < 2.5 / STEP; i += 1) {
    // Aim at the nearest living guard and fire.
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
      ? { mx: 0, my: 0.25, shoot: true, aimX: guard.x, aimY: guard.y }
      : { mx: 0, my: 0, shoot: false };
    world.step(STEP, STUB_INPUT, script);
  }
  return { screen: SCREEN_PLAY };
}

export function stageShot(name, world) {
  if (name === 'drive') return stageDrive(world);
  if (name === 'chase') return stageChase(world);
  if (name === 'foot') return stageFoot(world);
  return stageTitle(world);
}
