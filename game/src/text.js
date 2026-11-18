// Canvas-generated text helpers: sign boards and glow sprites.
// Building facades live in textures.js now; this file only draws lettering.
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

// A sign board: dark plate, gold border, centred text. Returns a texture.
export function signTexture(text, opts = {}) {
  const fs = opts.fontSize ?? 44;
  const pad = opts.pad ?? 18;
  const [mc, mg] = [document.createElement('canvas'), null];
  const measure = mc.getContext('2d');
  measure.font = `bold ${fs}px Arial, sans-serif`;
  const tw = Math.ceil(measure.measureText(text).width);
  return canvasTexture(tw + pad * 2, fs + pad * 2, (g, w, h) => {
    g.fillStyle = opts.bg ?? '#151310';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = opts.border ?? '#c8a24a';
    g.lineWidth = 4; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = opts.fg ?? '#ffd970';
    g.font = `bold ${fs}px Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1);
    if (opts.sub) {
      g.fillStyle = opts.subColor ?? '#e8e0cc';
      g.font = `bold ${Math.round(fs * 0.42)}px Arial, sans-serif`;
      g.fillText(opts.sub, w / 2, h - pad * 0.55);
    }
  });
}

// Soft radial glow (particles, lamp halos, explosion flash).
export function glowTexture() {
  return canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  });
}
