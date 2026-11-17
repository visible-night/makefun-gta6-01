// Tuning constants for Solmar City. One place for every number a designer tweaks.
export const SAVE_KEY = 'solmar-city-v4';
export const WORLD_HALF = 220; // playable city spans -220..220 on x and z
export const DAY_SECONDS = 40; // real seconds per in-game hour
export const WALK_SPEED = 6;
export const RUN_SPEED = 10.5;
export const PLAYER_HP = 100;
export const START_CASH = 200;
export const PACKAGE_REWARD = 50;
export const PACKAGE_COUNT = 20;
export const SPRAY_COST = 50;
export const SMG_COST = 500;
export const CAR_TYPES = {
  sedan: { max: 40, accel: 15, brake: 30, turn: 2.1, hp: 100, colors: [0x3a6ea5, 0xa53a3a, 0x9aa0a6, 0x2f7d4f, 0xc2a23a] },
  taxi: { max: 38, accel: 14, brake: 30, turn: 2.1, hp: 100, colors: [0xe8c832] },
  police: { max: 46, accel: 18, brake: 34, turn: 2.4, hp: 140, colors: [0x1c2733] },
  truck: { max: 30, accel: 9, brake: 22, turn: 1.5, hp: 180, colors: [0x7a7f85, 0x4a6b8a] },
};
export const WEAPONS = {
  pistol: { dmg: 34, rate: 4.5, range: 70, spread: 0.015, auto: false },
  smg: { dmg: 20, rate: 11, range: 55, spread: 0.045, auto: true },
};
export const WANTED_HEAT = { steal: 22, killPed: 30, killCop: 45, shoot: 6, ram: 8 };
export const COP_COUNTS = [0, 1, 2, 3, 4, 5]; // foot cops per star
export const POLICE_CAR_COUNTS = [0, 0, 1, 2, 3, 4]; // pursuit cars per star
export const HELI_STARS = 4;
export const PED_COUNT = 22;
export const TRAFFIC_COUNT = 12;
export const MISSION_REWARDS = [300, 400, 500, 600, 800, 2000];
