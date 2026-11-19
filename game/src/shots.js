// Screenshot staging for Solmar City. Each shot teleports the player, sets
// the wanted level and the traffic, and parks the camera so the frame shows
// what the shot is about: the beach and its palms, the brake lights, the
// helicopter in the five-star chase, or Rosa's bar on foot. The world keeps
// running after staging (wheels spin, the rotor turns, pedestrians walk) and
// main.js raises window.__shotReady once the scene has settled.
import { CFG } from './config.js';

function placeCar(state, car, x, z, angle, speed) {
  car.x = x; car.z = z; car.angle = angle; car.speed = speed;
  car.parked = false; car.traffic = false;
  car.group.position.set(x, 0, z);
  car.group.rotation.y = angle;
  state.player.x = x; state.player.z = z; state.player.angle = angle;
  state.player.speed = speed;
}

export function stageShot(name, ctx) {
  const { state, world, render, city } = ctx;
  state.mode = 'play';
  state.staging = { brake: false, throttle: false };
  state.wanted = 0;
  state.heat = 0;
  const sedan = world.starter;
  const sports = world.sports;
  const bx = CFG.world.boardwalkX;

  if (name === 'cover') {
    // Sundown Beach at golden hour: the sports coupe on the sand by the
    // boardwalk, palms left and right, ocean behind, Vic on foot beside it.
    placeCar(state, sports, bx + 16, 12, Math.PI * 0.85, 0);
    sports.parked = true;
    world.exitCar();
    state.player.x = bx + 12; state.player.z = 16;
    state.player.angle = Math.PI * 0.9;
    state.player.onFoot = true;
    render.setFixed(
      [bx - 4, 3.2, -14],
      [bx + 22, 2.5, 18]);
    render.toast('');
  } else if (name === 'drive') {
    // Downtown drive, mid-brake: the sedan slows on 22nd Street with its
    // brake lights flaring, a taxi ahead, towers on both sides. The camera
    // stays in its normal chase position so the car fills the frame; the
    // car coasts (no throttle) so it stays in view while the wheels spin.
    placeCar(state, sedan, 22, 60, Math.PI, 8);
    world.enterCar(sedan);
    state.staging.brake = true;
    state.staging.throttle = false;
    const taxi = world.taxiCar;
    taxi.x = 22; taxi.z = 34; taxi.angle = Math.PI; taxi.speed = 5;
    taxi.traffic = false; taxi.parked = false;
    render.setFixed(null, null);
  } else if (name === 'title') {
    // Five-star chase: Vic flees north with two cruisers on his tail and
    // the police helicopter hovering ahead-left, searchlight down.
    placeCar(state, sedan, -22, 40, Math.PI, 16);
    world.enterCar(sedan);
    state.wanted = 5;
    state.heat = 1;
    state.heli.orbit = -Math.PI / 2 - 0.5; // ahead-left of the player
    render.setFixed(
      [-22, 7, 64],
      [-26, 8, 0]);
  } else if (name === 'foot') {
    // On foot at the Sundown Beach Bar: Rosa at the door, boardwalk
    // strollers behind, palms and ocean in frame.
    world.exitCar();
    state.player.x = city.beach.barX - 2;
    state.player.z = city.beach.barZ + 16;
    state.player.angle = Math.PI;
    state.player.onFoot = true;
    state.player.inCar = null;
    render.setFixed(
      [city.beach.barX + 2, 3.4, city.beach.barZ + 26],
      [city.beach.barX + 4, 2, city.beach.barZ - 6]);
  } else {
    render.setFixed(null, null);
  }
  return name;
}

// The shot names the ?shot= parameter accepts, in screenshots/ order.
export const SHOT_NAMES = ['cover', 'drive', 'title', 'foot'];
