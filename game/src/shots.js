// Deterministic screenshot staging (?shot=cover|drive|title|foot&seed=1).
// Each scene shows several systems at once: HUD, minimap, wanted, mission, city.
import { makeCar } from './world.js';
import { startMission } from './missions.js';

function putPlayerInCar(S, x, z, angle, type = 'sedan', color = 0xa53a3a) {
  const car = makeCar(type, x, z, angle, 'player', S.rng);
  car.color = color;
  S.cars.push(car);
  S.player.inCar = car;
  S.player.x = x; S.player.z = z; S.player.angle = angle;
  return car;
}
function addPolice(S, x, z, angle) {
  const car = makeCar('police', x, z, angle, 'police', S.rng);
  S.cars.push(car);
  return car;
}
export function stageShot(S, render, shot) {
  S.mode = 'play';
  S.hint = '';
  if (shot === 'cover') {
    // Mid-action police chase: 3 stars, mission objective, HUD + minimap visible.
    // Camera sits in FRONT of the player car (orbit PI) so the pursuing
    // cruisers are in frame behind it instead of hidden behind the camera.
    S.time = 16.8;
    S.missionIdx = 0;
    startMission(S);
    const car = putPlayerInCar(S, 0, 40, Math.PI, 'sedan', 0xa53a3a);
    car.speed = 38; car.vx = Math.sin(Math.PI) * 38; car.vz = Math.cos(Math.PI) * 38;
    addPolice(S, -4, 50, Math.PI);
    addPolice(S, 5, 56, Math.PI);
    addPolice(S, 0, 64, Math.PI);
    S.addHeat(55);
    S.player.cash = 1240;
    render.setOrbit(Math.PI, 0.05);
    render.setZoom(0.85);
  } else if (shot === 'drive') {
    // Golden-hour cruise through downtown, no heat. Traffic is cleared so
    // the staged car coasts cleanly down the avenue instead of ramming a
    // crossing car and stopping on the sidewalk (first two takes).
    S.time = 17.6;
    S.missionIdx = 1;
    startMission(S);
    S.cars = S.cars.filter(c => c.role !== 'traffic');
    // Roads sit on multiples of 40; z=-20 is a block row, so the first three
    // takes drove straight into a tower and stopped at 3 km/h.
    const car = putPlayerInCar(S, -60, -40, Math.PI / 2, 'sedan', 0x3a6ea5);
    car.speed = 40; car.vx = Math.sin(Math.PI / 2) * 40; car.vz = Math.cos(Math.PI / 2) * 40;
    S.player.cash = 860;
    render.setZoom(0.75);
  } else if (shot === 'title') {
    // Title screen over the 3D city, morning light.
    S.time = 9.5;
    S.mode = 'title';
    S.player.x = S.city.landmarks.spawn.x;
    S.player.z = S.city.landmarks.spawn.z;
    S.player.angle = Math.PI / 2;
  } else if (shot === 'foot') {
    // On-foot shootout at the warehouse: guards, 1 star, weapon out.
    S.time = 14.2;
    S.missionIdx = 4;
    startMission(S);
    S.mission.stepIdx = 1;
    S.mission.guardsSpawned = false;
    // On the avenue facing the warehouse: clear sightline, no parked car
    // between the camera and the player, guards visible ahead. Offset 4 east
    // so the camera sits off the traffic lane (a passing taxi photobombed
    // the first take from dead centre).
    S.player.x = -116; S.player.z = 82;
    S.player.angle = -0.22;
    S.player.weapon = 'smg'; S.player.hasSmg = true; S.player.ammo.smg = 120;
    S.spawnGuards(S.city.landmarks.warehouse, 6);
    S.addHeat(15);
    S.aim = { x: -120, z: 95 };
    S.player.cash = 2100;
  }
}
