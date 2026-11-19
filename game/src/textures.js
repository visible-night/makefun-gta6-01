// Procedural canvas textures for Solmar City. Everything is drawn in code —
// no image files, no downloads, no licenses. Each texture is a small canvas
// painted once at boot and reused across the whole city.
import * as THREE from 'three';

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(g, w, h, n, colors, sMax = 3) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    const s = 1 + Math.random() * sMax;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

export function buildTextures() {
  const asphalt = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2b2e33'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['#33363c', '#24272b', '#3a3d44'], 2);
    // centre dashes, running along +v
    g.fillStyle = '#d8c95a';
    for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 3, y + 8, 6, 34);
    // edge lines
    g.fillStyle = '#c8c4b8';
    g.fillRect(6, 0, 3, h); g.fillRect(w - 9, 0, 3, h);
  }, 1, 6);

  const sidewalk = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8d8578'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, ['#7d7568', '#9d9588', '#6d6558'], 2);
    g.strokeStyle = '#6d6558'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke();
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke();
    }
  }, 2, 2);

  const sand = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e0c188'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1400, ['#d4b478', '#ecd096', '#c8a86e', '#f2dcab'], 2);
    // faint wind ripples
    g.strokeStyle = 'rgba(180,150,100,0.35)'; g.lineWidth = 2;
    for (let y = 12; y < h; y += 26) {
      g.beginPath();
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.09 + y) * 3);
      g.stroke();
    }
  }, 8, 8);

  const ocean = canvasTex(256, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2a8aa8'); grad.addColorStop(1, '#155a75');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const y = Math.random() * h, x = Math.random() * w, len = 20 + Math.random() * 50;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + 2); g.stroke();
    }
  }, 6, 6);

  const boardwalk = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a6b42'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = y % 64 === 0 ? '#a5764c' : '#8f6238';
      g.fillRect(0, y, w, 30);
      g.fillStyle = '#5f4126';
      g.fillRect(0, y + 30, w, 2);
    }
    speckle(g, w, h, 300, ['#7d5230', '#b08355'], 2);
  }, 1, 8);

  // Building facades: warm stucco with lit windows, three variants so the
  // skyline does not repeat one texture.
  function facade(base, trim, lit) {
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 260, [trim, base], 2);
      g.fillStyle = trim; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 5; col++) {
          const x = 16 + col * 46, y = 24 + row * 38;
          const on = Math.random() < 0.55;
          g.fillStyle = on ? lit : '#1d2f42';
          g.fillRect(x, y, 28, 22);
          g.fillStyle = 'rgba(255,255,255,0.14)';
          g.fillRect(x, y, 28, 4);
        }
      }
    });
  }

  const palmFrond = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#2f8f4e'; g.lineWidth = 5; g.lineCap = 'round';
    for (let i = -4; i <= 4; i++) {
      g.beginPath(); g.moveTo(w / 2, h);
      g.quadraticCurveTo(w / 2 + i * 12, h * 0.55, w / 2 + i * 16, h * 0.12 + Math.abs(i) * 6);
      g.stroke();
    }
  });

  return {
    asphalt, sidewalk, sand, ocean, boardwalk, palmFrond,
    facadeA: facade('#e8c9a0', '#c9a06e', '#ffd98a'),
    facadeB: facade('#c9d4dc', '#8fa3b0', '#ffe9b0'),
    facadeC: facade('#d98a6a', '#a85f42', '#ffcf7a'),
    facadeBank: facade('#b8c4cc', '#7d8b96', '#fff2c0'),
  };
}
