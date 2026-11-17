// Solmar City — tuning, layout and palette. All numbers live here so the rest of the
// game reads like rules, not magic constants.
export const STEP = 1 / 60;
export const WORLD_W = 4800;
export const WORLD_H = 3600;

// Road grid: avenues run north-south, streets east-west.
export const ROAD_W = 110;
export const AVE0 = 300;
export const AVE_GAP = 450;
export const AVE_N = 10;
export const ST0 = 250;
export const ST_GAP = 450;
export const ST_N = 8;

export const SAVE_KEY = 'solmar-city-save-v1';

// The sun-soaked palette: warm asphalt, sand, palm green, glass blue.
export const COLORS = {
  grass: '#8fae62',
  grassDry: '#a8b878',
  park: '#6da24f',
  sidewalk: '#b7ad9c',
  sidewalkEdge: '#9d937f',
  road: '#45414a',
  roadEdge: '#35323a',
  laneDash: '#e8d268',
  sand: '#e9d8a4',
  water: '#2e7cb4',
  waterDeep: '#25679b',
  waterLine: '#7fc4e8',
  harbor: '#8d8578',
  buildingRoof: ['#c96f4a', '#d9a05b', '#b8574f', '#7a9e7e', '#5b7fa6', '#8a6ea8', '#c9b458', '#9c7a5b'],
  downtownGlass: ['#4f7fa8', '#5b8fb0', '#3f6d94', '#6a9bb8'],
  house: ['#e0b184', '#d99a7c', '#c9d6a0', '#a8c4d4', '#e8d0a0', '#d4a0a0'],
  tree: '#3f7a34',
  treeDark: '#2f6128',
  container: ['#b8543f', '#3f7ab8', '#4f9e57', '#d9a441', '#7a5fb0'],
};

export const CAR_TYPES = {
  sedan: { w: 46, h: 23, accel: 430, max: 520, reverse: 170, brake: 760, turn: 2.7, grip: 7.5, hp: 100, name: 'Sedan' },
  taxi: { w: 46, h: 23, accel: 430, max: 520, reverse: 170, brake: 760, turn: 2.7, grip: 7.5, hp: 100, name: 'Taxi' },
  sports: { w: 47, h: 22, accel: 640, max: 780, reverse: 190, brake: 820, turn: 3.1, grip: 9.0, hp: 80, name: 'Sports' },
  truck: { w: 58, h: 26, accel: 300, max: 380, reverse: 140, brake: 600, turn: 2.0, grip: 6.5, hp: 170, name: 'Truck' },
  van: { w: 53, h: 25, accel: 340, max: 430, reverse: 150, brake: 640, turn: 2.2, grip: 7.0, hp: 130, name: 'Van' },
  police: { w: 47, h: 23, accel: 580, max: 720, reverse: 180, brake: 840, turn: 3.0, grip: 9.0, hp: 120, name: 'Police' },
  limo: { w: 60, h: 23, accel: 380, max: 480, reverse: 150, brake: 700, turn: 2.3, grip: 7.5, hp: 120, name: 'Limo' },
};

export const CAR_COLORS = [
  '#c94f43', '#3f6fb8', '#e8e4da', '#2e2e33', '#d9a441', '#4f9e57',
  '#7a5fb0', '#b8b0a0', '#5b8a8a', '#d97b9e', '#8a5a2e', '#6e8a3f',
];

export const PED_SHIRTS = ['#d9574f', '#4f7ad9', '#e8d268', '#57a86b', '#a8579e', '#e8e4da', '#57b8a8', '#d98a4f'];
export const PED_PANTS = ['#2e3a4f', '#4f4f4f', '#6b4f2e', '#3f5a3f', '#5a3f4f', '#24303a'];

export const WEAPONS = {
  pistol: { name: 'Pistol', rate: 0.26, dmg: 34, range: 540, spread: 0.025, tracer: '#ffd76e' },
  smg: { name: 'SMG', rate: 0.09, dmg: 17, range: 470, spread: 0.07, tracer: '#ffe9a8' },
};

export const WANTED_MAX = 5;
export const EVADE_SECONDS = 6; // unseen this long and one star drops
export const COP_SIGHT = 620; // a cop this close sees you
export const BUST_SECONDS = 0.9; // a cop on you this long busts you (on foot)
export const CAR_BUST_SECONDS = 2.2; // stopped, cop car beside you this long

export const PLAYER = {
  walk: 175,
  run: 265,
  radius: 13,
  maxHp: 100,
  maxArmor: 100,
};

export const START_MONEY = 200;
export const PACKAGE_REWARD = 500;
export const PACKAGE_COUNT = 20;
export const SPRAY_BASE = 120; // per star
export const TAXI_FARE_MIN = 30;
export const TAXI_FARE_MAX = 90;
export const VIGILANTE_REWARD = 150;

// Game clock: one game hour every 40 real seconds; the day starts at 09:00.
export const CLOCK_START_MINUTES = 9 * 60;
export const MINUTES_PER_SECOND = 1.5;
