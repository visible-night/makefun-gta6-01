// The sky over Solmar: what the light looks like at each hour of the game
// clock, and how the HUD clock reads. The renderer asks for the light once
// per frame and tints the world with it; the streetlamps switch on as the
// light fades. Light is a keyframed day: each keyframe names an hour, a tint
// color and a strength, and the hours between them blend smoothly.
const KEYFRAMES = [
  { hour: 0, color: [16, 24, 58], alpha: 0.36, lamps: 1 },
  { hour: 5, color: [16, 24, 58], alpha: 0.36, lamps: 1 },
  { hour: 6, color: [255, 170, 90], alpha: 0.14, lamps: 0.6 },
  { hour: 8, color: [255, 220, 160], alpha: 0, lamps: 0 },
  { hour: 17, color: [255, 220, 160], alpha: 0, lamps: 0 },
  { hour: 18.5, color: [255, 140, 60], alpha: 0.16, lamps: 0.7 },
  { hour: 20, color: [16, 24, 58], alpha: 0.3, lamps: 1 },
  { hour: 24, color: [16, 24, 58], alpha: 0.36, lamps: 1 },
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

// The light at a clock reading in minutes since midnight. Returns the tint
// as a fill string, whether it is night or dusk, and how strongly the
// streetlamps glow (0 in daylight, 1 in full dark).
export function lighting(clockMinutes) {
  const hour = ((clockMinutes / 60) % 24 + 24) % 24;
  let prev = KEYFRAMES[0];
  let next = KEYFRAMES[KEYFRAMES.length - 1];
  for (let i = 0; i < KEYFRAMES.length - 1; i += 1) {
    if (hour >= KEYFRAMES[i].hour && hour <= KEYFRAMES[i + 1].hour) {
      prev = KEYFRAMES[i];
      next = KEYFRAMES[i + 1];
      break;
    }
  }
  const span = next.hour - prev.hour || 1;
  const t = Math.max(0, Math.min(1, (hour - prev.hour) / span));
  const color = mixColor(prev.color, next.color, t);
  const alpha = lerp(prev.alpha, next.alpha, t);
  const lamps = lerp(prev.lamps, next.lamps, t);
  const night = hour < 6 || hour >= 20;
  const dusk = (hour >= 17 && hour < 20) || (hour >= 6 && hour < 8);
  return {
    overlay: `rgba(${color[0]},${color[1]},${color[2]},${alpha.toFixed(3)})`,
    alpha,
    night,
    dusk,
    lampGlow: lamps,
  };
}

// The HUD clock: "09:00", "17:20", "23:45".
export function formatClock(clockMinutes) {
  const total = Math.floor(((clockMinutes % (24 * 60)) + 24 * 60) % (24 * 60));
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Play time as "12:34" from seconds.
export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
