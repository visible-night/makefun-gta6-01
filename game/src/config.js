// Solmar City tuning, palette and key bindings. One file owns every number the
// rest of the game reads, so balancing is editing data, not hunting literals.
export const CFG = {
  // World layout, metres, y-up, origin at the city centre.
  world: { half: 300, cityHalf: 220, beachX: 224, oceanX: 264, boardwalkX: 226 },
  grid: { spacing: 44, roadHalf: 7.5, block: 29 },
  // Sunset: the sun sits low in the west so the beach glows at golden hour.
  sun: { azimuth: -0.9, elevation: 0.32, color: 0xffb066, intensity: 2.6 },
  fog: { color: 0xf2a35e, near: 120, far: 420 },
  player: {
    walkSpeed: 5.2, runSpeed: 9.5, accel: 26, turnRate: 7.5,
    enterCarRange: 4.5, punchRange: 2.4, health: 100,
  },
  car: {
    accel: 15, brake: 30, reverseAccel: 9, maxSpeed: 42, maxReverse: 11,
    turn: 1.55, grip: 8.5, wheelRadius: 0.36, drag: 0.35,
  },
  traffic: { count: 14, cruiseMin: 7, cruiseMax: 12, despawn: 260 },
  peds: { count: 26, walkMin: 0.9, walkMax: 1.7, fleeSpeed: 4.6 },
  wanted: {
    max: 5, heliAt: 4, decayPerSec: 0.05, stealHeat: 1, shootHeat: 1,
    copChaseSpeed: 15, copRamRange: 3.2,
  },
  economy: { startCash: 120, taxiFare: 45, packageReward: 25, missionPay: 300 },
  camera: { followDist: 9.5, followHeight: 4.2, footDist: 6.5, footHeight: 3.0, lerp: 6 },
  minimap: { size: 200, range: 260 },
  saveKey: 'solmar-city-save-v1',
};

export const PALETTE = {
  asphalt: 0x2b2e33, roadLine: 0xd8c95a, sidewalk: 0x8d8578,
  sand: 0xe0c188, ocean: 0x1f6f8b, oceanDeep: 0x155a75,
  buildingGlass: 0x2c4a63, concrete: 0x9a938a,
  grass: 0x4d7a3a, palmTrunk: 0x7a5a38, palmLeaf: 0x2f8f4e,
  playerCar: 0xe8632c, taxi: 0xf2c230, cruiser: 0x1c2f4a,
  hud: '#ffd75e', hudDanger: '#ff5a4e', hudOk: '#7ee787',
};

export const KEYS = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  brake: ['Space'], interact: ['KeyE'], horn: ['KeyH'],
  pause: ['KeyP', 'Escape'], radio: ['KeyR'], mute: ['KeyM'],
  start: ['Enter'], sprint: ['ShiftLeft', 'ShiftRight'],
};

// Screenshot staging slots. The shot name comes from ?shot= in the URL; the
// file column is the name under screenshots/ the shot is saved as.
export const SHOTS = [
  { name: 'cover', file: '1-title.jpg', label: 'Solmar City — Sundown Beach' },
  { name: 'drive', file: '2-drive.jpg', label: 'Downtown drive — brake lights' },
  { name: 'title', file: '3-chase.jpg', label: 'Five-star chase — heli overhead' },
  { name: 'foot', file: '4-foot.jpg', label: 'On foot at the Sundown Beach Bar' },
];
