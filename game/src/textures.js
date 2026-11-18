// Procedural canvas textures: every surface in Solmar City is painted by code.
// One 256px tile covers ~8 world units; buildings repeat it, roads tile it.
import * as THREE from 'three';
import { makeRng } from './random.js';

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry); t.anisotropy = 4;
  return t;
}
function speckle(g, rng, n, a = 0.08) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rng.chance(0.5) ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.7})`;
    g.fillRect(rng.range(0, 256), rng.range(0, 256), 2, 2);
  }
}
function windows(g, rng, cols, rows, win, lit, litChance = 0.3) {
  const ww = 256 / cols, wh = 256 / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * ww + ww * 0.22, y = r * wh + wh * 0.22, w = ww * 0.56, h = wh * 0.56;
    g.fillStyle = rng.chance(litChance) ? lit : win;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke();
  }
}
// Mid-floor facades. variant: 0 brick, 1 concrete, 2 stucco, 3 glass tower.
function facade(variant, rng) {
  const [c, g] = cv(256, 256);
  const P = [
    { base: '#7d5c48', win: '#232c38', lit: '#ffd28a', cols: 5, rows: 9, litC: 0.28 },
    { base: '#8b8e91', win: '#2e3a46', lit: '#ffe0a0', cols: 6, rows: 10, litC: 0.32 },
    { base: '#c9b28b', win: '#2c3842', lit: '#ffcf7a', cols: 5, rows: 8, litC: 0.3 },
    { base: '#39587a', win: '#a8c8e2', lit: '#fff3c4', cols: 7, rows: 12, litC: 0.42 },
  ][variant % 4];
  g.fillStyle = P.base; g.fillRect(0, 0, 256, 256);
  if (variant === 0) { // brick courses
    g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 1;
    for (let y = 0; y < 256; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    for (let y = 4; y < 256; y += 16) for (let x = (y % 32 ? 8 : 0); x < 256; x += 16) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke();
    }
  }
  if (variant === 3) { // glass tower: horizontal light bands
    g.fillStyle = 'rgba(255,255,255,0.10)';
    for (let y = 20; y < 256; y += 42) g.fillRect(0, y, 256, 5);
  }
  speckle(g, rng, 700);
  windows(g, rng, P.cols, P.rows, P.win, P.lit, P.litC);
  // AC units + vents on some windows
  g.fillStyle = 'rgba(20,20,22,0.85)';
  for (let i = 0; i < 5; i++) {
    const x = rng.range(8, 220), y = rng.range(16, 220);
    g.fillRect(x, y, 16, 10);
  }
  return tex(c);
}
// Ground floor: shopfront with door, display windows and a sign band.
function shopfront(rng) {
  const [c, g] = cv(256, 64);
  g.fillStyle = '#3d3a36'; g.fillRect(0, 0, 256, 64);
  speckle(g, rng, 200);
  g.fillStyle = '#20242a'; // display windows
  g.fillRect(10, 18, 90, 34); g.fillRect(156, 18, 90, 34);
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
  g.strokeRect(10, 18, 90, 34); g.strokeRect(156, 18, 90, 34);
  g.fillStyle = '#151312'; // door
  g.fillRect(112, 12, 32, 52);
  g.fillStyle = '#c8a24a'; // sign band
  g.fillRect(0, 0, 256, 12);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 6, 12);
  return tex(c);
}
function asphalt(rng) {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#2b2b2e'; g.fillRect(0, 0, 256, 256);
  speckle(g, rng, 1400, 0.1);
  g.fillStyle = 'rgba(255,255,255,0.05)'; // patches
  for (let i = 0; i < 6; i++) g.fillRect(rng.range(0, 200), rng.range(0, 200), rng.range(20, 56), rng.range(14, 40));
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.5; // cracks
  for (let i = 0; i < 7; i++) {
    let x = rng.range(0, 256), y = rng.range(0, 256);
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += rng.range(-26, 26); y += rng.range(-26, 26); g.lineTo(x, y); }
    g.stroke();
  }
  return tex(c);
}
function sidewalk(rng) {
  const [c, g] = cv(128, 128);
  g.fillStyle = '#9a9a94'; g.fillRect(0, 0, 128, 128);
  speckle(g, rng, 500, 0.07);
  g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
  }
  return tex(c);
}
function sand(rng) {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#d9bd8a'; g.fillRect(0, 0, 256, 256);
  speckle(g, rng, 1600, 0.09);
  g.strokeStyle = 'rgba(120,90,50,0.25)'; g.lineWidth = 2; // wind ripples
  for (let i = 0; i < 14; i++) {
    const y = rng.range(0, 256);
    g.beginPath(); g.moveTo(0, y);
    g.bezierCurveTo(80, y + 6, 170, y - 6, 256, y);
    g.stroke();
  }
  return tex(c);
}
function grass(rng) {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#4a7a34'; g.fillRect(0, 0, 256, 256);
  speckle(g, rng, 1800, 0.12);
  g.fillStyle = 'rgba(30,60,20,0.25)';
  for (let i = 0; i < 10; i++) g.fillRect(rng.range(0, 220), rng.range(0, 220), rng.range(16, 44), rng.range(12, 30));
  return tex(c);
}
function water(rng) {
  const [c, g] = cv(256, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2a6a8a'); grad.addColorStop(1, '#174a66');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 2; // wave streaks
  for (let i = 0; i < 18; i++) {
    const y = rng.range(0, 256), x = rng.range(0, 180);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(30, 80), y); g.stroke();
  }
  return tex(c);
}
function paintNoise(rng) {
  const [c, g] = cv(64, 64);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  speckle(g, rng, 500, 0.05);
  return tex(c);
}

export function buildTextures(seed) {
  const rng = makeRng(seed ^ 0x5a17);
  return {
    mid: [facade(0, rng), facade(1, rng), facade(2, rng)],
    glass: facade(3, rng),
    shop: shopfront(rng),
    asphalt: asphalt(rng), sidewalk: sidewalk(rng), sand: sand(rng),
    grass: grass(rng), water: water(rng), paint: paintNoise(rng),
  };
}
