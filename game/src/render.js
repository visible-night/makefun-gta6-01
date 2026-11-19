// Rendering, camera and HUD for Solmar City. The camera is a smoothed
// follow rig (chase behind the car, third-person on foot) with a fixed mode
// the screenshot staging uses. The minimap is drawn as pure 2D vector art
// from the city data every frame — streets, beach, ocean, player, traffic,
// police, helicopter and the mission marker — so it can never come out dark
// or empty the way a WebGL readback can.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';

export function createRenderer(canvas, city) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(CFG.fog.color, CFG.fog.near, CFG.fog.far);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
  camera.position.set(0, 8, -14);

  const hemi = new THREE.HemisphereLight(0xffd9a8, 0x4a3a2c, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(CFG.sun.color, CFG.sun.intensity);
  sun.position.set(-120, 90, -40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // Procedural environment so PBR paint and glass have something to reflect.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const panel = (color, intensity, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m);
  };
  panel(0xffd9a8, 5, 0, 6, 0);
  panel(0xffe0b3, 3, 6, 2, 4);
  panel(0x40342a, 1, 0, -4, 0);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.9;

  // --- Minimap ------------------------------------------------------------
  const mapCanvas = document.getElementById('minimap');
  const mapCtx = mapCanvas.getContext('2d');
  const MAP = CFG.minimap.size;
  mapCanvas.width = MAP; mapCanvas.height = MAP;
  const mapScale = MAP / (CFG.minimap.range * 2);
  const toMap = (x, z) => [MAP / 2 + x * mapScale, MAP / 2 + z * mapScale];

  function drawMinimap(state, marker) {
    const g = mapCtx;
    // Solid base first — the canvas is never transparent, never blank.
    g.fillStyle = '#0d2733';
    g.fillRect(0, 0, MAP, MAP);
    // Ocean (east strip) and sand.
    const [ox] = toMap(CFG.world.oceanX, 0);
    const [sx] = toMap(CFG.world.beachX, 0);
    g.fillStyle = '#1f6f8b';
    g.fillRect(ox, 0, MAP - ox, MAP);
    g.fillStyle = '#c9a86e';
    g.fillRect(sx, 0, ox - sx, MAP);
    // City blocks: faint warm squares between the streets.
    g.fillStyle = '#274b5c';
    for (let bx = -4; bx <= 4; bx++) {
      for (let bz = -4; bz <= 4; bz++) {
        const cx = bx * CFG.grid.spacing + CFG.grid.spacing / 2;
        const cz = bz * CFG.grid.spacing + CFG.grid.spacing / 2;
        if (cx > CFG.world.cityHalf - 40) continue;
        const [mx, mz] = toMap(cx - CFG.grid.block / 2, cz - CFG.grid.block / 2);
        g.fillRect(mx, mz, CFG.grid.block * mapScale, CFG.grid.block * mapScale);
      }
    }
    // Streets: bright lines on both axes, drawn over the blocks.
    g.strokeStyle = '#c8c4b8';
    g.lineWidth = Math.max(2, CFG.grid.roadHalf * 2 * mapScale * 0.9);
    for (const s of city.streets) {
      g.beginPath();
      if (s.axis === 'x') { const [mx] = toMap(s.at, 0); g.moveTo(mx, 0); g.lineTo(mx, MAP); }
      else { const [, mz] = toMap(0, s.at); g.moveTo(0, mz); g.lineTo(MAP, mz); }
      g.stroke();
    }
    // Boardwalk line.
    g.strokeStyle = '#9a6b42'; g.lineWidth = 3;
    const [bx] = toMap(CFG.world.boardwalkX, 0);
    g.beginPath(); g.moveTo(bx, 0); g.lineTo(bx, MAP); g.stroke();
    // Mission marker: pulsing yellow diamond.
    if (marker && !marker.anywhere) {
      const [mx, mz] = toMap(marker.x, marker.z);
      const pulse = 5 + Math.sin(performance.now() / 180) * 2;
      g.fillStyle = '#ffd75e';
      g.beginPath();
      g.moveTo(mx, mz - pulse - 3); g.lineTo(mx + pulse, mz);
      g.lineTo(mx, mz + pulse + 3); g.lineTo(mx - pulse, mz);
      g.closePath(); g.fill();
    }
    // Traffic: pale dots. Police: flashing blue. Helicopter: red dot.
    for (const c of state.cars) {
      const [mx, mz] = toMap(c.x, c.z);
      g.fillStyle = c.kind === 'cruiser' ? (Math.floor(performance.now() / 300) % 2 ? '#3a7bff' : '#ff5a4e') : '#e8e8e8';
      g.beginPath(); g.arc(mx, mz, c.kind === 'cruiser' ? 3.5 : 2.5, 0, Math.PI * 2); g.fill();
    }
    if (state.heli && state.heli.active) {
      const [mx, mz] = toMap(state.heli.group.position.x, state.heli.group.position.z);
      g.fillStyle = '#ff3020';
      g.beginPath(); g.arc(mx, mz, 4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ff3020'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(mx, mz, 7, 0, Math.PI * 2); g.stroke();
    }
    // Player: white triangle, rotated to the heading. Always drawn last.
    const [px, pz] = toMap(state.player.x, state.player.z);
    g.save();
    g.translate(px, pz);
    g.rotate(-state.player.angle + Math.PI);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111111'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(-6, 6); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    // North tick and frame.
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = 'bold 11px sans-serif';
    g.fillText('N', MAP - 14, 14);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2;
    g.strokeRect(1, 1, MAP - 2, MAP - 2);
  }

  // --- Camera rig ---------------------------------------------------------
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3(0, 8, -14);
  let fixed = null; // {pos, look} — set by screenshot staging
  let shakeApplied = false;

  function updateCamera(dt, state) {
    if (fixed) {
      camera.position.copy(fixed.pos);
      camera.lookAt(fixed.look);
      return;
    }
    const p = state.player;
    const dist = p.inCar ? CFG.camera.followDist : CFG.camera.footDist;
    const height = p.inCar ? CFG.camera.followHeight : CFG.camera.footHeight;
    const back = new THREE.Vector3(-Math.sin(p.angle), 0, -Math.cos(p.angle));
    const wantPos = new THREE.Vector3(p.x, 0, p.z)
      .addScaledVector(back, dist)
      .add(new THREE.Vector3(0, height, 0));
    const t = 1 - Math.exp(-CFG.camera.lerp * dt);
    camPos.lerp(wantPos, t);
    camera.position.copy(camPos);
    camTarget.lerp(new THREE.Vector3(p.x, p.inCar ? 1.4 : 1.7, p.z), t);
    camera.lookAt(camTarget);
    shakeApplied = true;
  }

  // --- HUD ----------------------------------------------------------------
  const el = (id) => document.getElementById(id);
  const hud = {
    stars: el('wanted-stars'), cash: el('cash'), speed: el('speed'),
    health: el('health-fill'), mission: el('mission-text'),
    toast: el('toast'), dialogue: el('dialogue'), dialogueText: el('dialogue-text'),
    title: el('title-screen'), paused: el('paused-screen'),
    dead: el('dead-screen'), deadText: el('dead-text'),
    tip: el('tip'), radio: el('radio-label'),
  };
  let toastUntil = 0;
  let dialogueUntil = 0;

  function updateHud(state, marker, packagesFound) {
    const stars = '★'.repeat(state.wanted) + '☆'.repeat(CFG.wanted.max - state.wanted);
    hud.stars.textContent = stars;
    hud.stars.style.color = state.wanted >= 4 ? PALETTE.hudDanger : state.wanted > 0 ? PALETTE.hud : '#cfd6dd';
    hud.cash.textContent = `$${state.cash}`;
    const mph = Math.round(Math.abs(state.player.speed || 0) * 2.237);
    hud.speed.textContent = state.player.inCar ? `${mph}` : '—';
    hud.health.style.width = `${Math.max(0, state.health)}%`;
    hud.health.style.background = state.health < 30 ? PALETTE.hudDanger : PALETTE.hudOk;
    if (marker) hud.mission.textContent = `◆ ${marker.label}`;
    else if (packagesFound > 0) hud.mission.textContent = `Packages ${packagesFound}/20 — keep hunting`;
    else hud.mission.textContent = 'Talk to Rosa at the Beach Bar';
    hud.title.style.display = state.mode === 'title' ? 'flex' : 'none';
    hud.paused.style.display = state.mode === 'paused' ? 'flex' : 'none';
    hud.dead.style.display = state.mode === 'dead' ? 'flex' : 'none';
    if (performance.now() > toastUntil) hud.toast.style.opacity = '0';
    if (performance.now() > dialogueUntil) hud.dialogue.style.opacity = '0';
  }

  return {
    renderer, scene, camera, sun,
    setFixed(pos, look) {
      fixed = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) } : null;
      if (!fixed) {
        camPos.copy(camera.position);
        camTarget.set(0, 1.5, 0);
      }
    },
    get fixedMode() { return !!fixed; },
    toast(text, ms = 3200) {
      hud.toast.textContent = text;
      hud.toast.style.opacity = '1';
      toastUntil = performance.now() + ms;
    },
    say(text, ms = 5200) {
      hud.dialogueText.textContent = text;
      hud.dialogue.style.opacity = '1';
      dialogueUntil = performance.now() + ms;
    },
    setDead(text) { hud.deadText.textContent = text; },
    setTip(text) { hud.tip.textContent = text; },
    setRadio(text) { hud.radio.textContent = text; },
    drawMinimap, updateCamera, updateHud,
    onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    },
  };
}
