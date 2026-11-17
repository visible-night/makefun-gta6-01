// Canvas-generated textures: building windows, signs, glow sprites. No image files.
import * as THREE from 'three';

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Procedural window grid for building facades. kind: 'glass' | 'concrete' | 'house' | 'warehouse'.
export function buildingTexture(kind) {
  // Light facades: the per-instance tint multiplies this texture, so a dark
  // base renders nearly black. Keep bases bright and windows mid-tone.
  const palettes = {
    glass: { bg: '#7d9bb8', lit: '#ffe9a8', dark: '#3d5a78', cols: 10, rows: 16 },
    concrete: { bg: '#a89e8e', lit: '#ffe9b0', dark: '#5a5348', cols: 8, rows: 10 },
    house: { bg: '#d8c8b3', lit: '#ffedb8', dark: '#6b5d4d', cols: 4, rows: 3 },
    warehouse: { bg: '#98a2ad', lit: '#d8ecff', dark: '#4a545e', cols: 6, rows: 4 },
  };
  const p = palettes[kind] || palettes.concrete;
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = p.bg; g.fillRect(0, 0, w, h);
    const cw = w / p.cols, rh = h / p.rows;
    let n = 7;
    for (let y = 0; y < p.rows; y++) {
      for (let x = 0; x < p.cols; x++) {
        n = (n * 16807) % 2147483647; // deterministic speckle, no RNG import
        g.fillStyle = n % 3 === 0 ? p.lit : p.dark;
        g.fillRect(x * cw + cw * 0.22, y * rh + rh * 0.25, cw * 0.56, rh * 0.5);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, h - 6, w, 6);
  });
}
// Shop / street sign texture with big readable text.
export function signTexture(text, opts = {}) {
  const { bg = '#10202f', fg = '#ffd166', sub = '' } = opts;
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${sub ? 44 : 56}px system-ui, sans-serif`;
    g.fillText(text, w / 2, sub ? h / 2 - 16 : h / 2);
    if (sub) { g.font = '28px system-ui, sans-serif'; g.fillText(sub, w / 2, h / 2 + 34); }
  });
}
// Soft radial glow sprite for particles, beacons and headlights.
export function glowTexture() {
  return canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  });
}
