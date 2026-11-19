// Solmar City boot and main loop. Parses ?seed=, ?shot=, ?lowq= and ?fresh=,
// builds the city, the simulation, the HUD and the sky, then runs a fixed
// 60 Hz simulation with interpolated rendering. Exposes window.__gameReady,
// window.__state and window.__THREE_GAME_DIAGNOSTICS__ for headless tests.
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeRng } from './random.js';
import { buildTextures } from './textures.js';
import { buildCity } from './city.js';
import { createWorld } from './world.js';
import { createNpcs } from './npcs.js';
import { createMissions } from './missions.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createJuice } from './juice.js';
import { createRenderer } from './render.js';
import { createSky } from './sky.js';
import { stageShot, SHOT_NAMES } from './shots.js';
import { STORY, HUD, TIPS } from './text.js';

const params = new URLSearchParams(location.search);
const seed = params.get('seed') || 'solmar-1';
const shotName = params.get('shot');
const lowq = params.get('lowq') === '1';
const fresh = params.get('fresh') === '1';
const rng = makeRng(seed);

const canvas = document.getElementById('game');
const tex = buildTextures();
const city = buildCity(tex, rng);
const renderer = createRenderer(canvas, city);
const { scene, camera } = renderer;
scene.add(city.group);
const sky = createSky(scene);

const audio = createAudio();
const input = createInput(canvas);
const juice = createJuice(scene, camera);
const world = createWorld(scene, city, rng, {
  toast: (t) => renderer.toast(t),
  horn: () => audio.horn(),
  addTrauma: (v) => juice.addTrauma(v),
  onCrash: (x, z) => { audio.crash(); juice.burst(new THREE.Vector3(x, 1, z), 0xffa040, 18, 7); },
  onShot: (x, z, angle) => {
    audio.shot();
    juice.flash();
    npcs.panicAt(x, z, performance.now() / 1000);
  },
  onCrime: (wanted) => {
    if (wanted >= 4) renderer.toast('The helicopter is on you — lose it!');
  },
  onBusted: () => renderer.setDead(HUD.busted),
  onInteractEmpty: (x, z) => {
    const npc = npcs.nearestNamed(x, z, 5);
    if (npc) {
      const res = npcs.talk(npc, state);
      renderer.say(`${npc.name}: ${res.line}`);
      if (res.mission) {
        missions.start(res.mission);
        renderer.toast(`New job: ${res.mission.name} — ${res.mission.brief}`);
        audio.missionDone();
      }
    }
  },
  onEnterCar: () => audio.click(),
});
const state = world.state;
const npcs = createNpcs(scene, city, rng);
const missions = createMissions(city, rng);

// Save / load: cash, health, packages, completed missions, player spot.
function save() {
  if (state.mode !== 'play') return;
  try {
    localStorage.setItem(CFG.saveKey, JSON.stringify({
      cash: state.cash, health: state.health,
      packages: missions.packages.filter((p) => p.found).length,
      done: missions.missions.filter((m) => m.done).map((m) => m.id),
      x: state.player.x, z: state.player.z,
    }));
  } catch { /* storage may be unavailable; the game still plays */ }
}
function load() {
  if (fresh) { try { localStorage.removeItem(CFG.saveKey); } catch {} return; }
  try {
    const raw = localStorage.getItem(CFG.saveKey);
    if (!raw) return;
    const s = JSON.parse(raw);
    state.cash = s.cash ?? state.cash;
    state.health = s.health ?? state.health;
    for (const id of s.done || []) {
      const m = missions.missions.find((mm) => mm.id === id);
      if (m) m.done = true;
    }
    for (let i = 0; i < (s.packages || 0) && i < missions.packages.length; i++) {
      missions.packages[i].found = true;
    }
    if (typeof s.x === 'number') { state.player.x = s.x; state.player.z = s.z; }
  } catch { /* a corrupt save never blocks the game */ }
}
load();

// Package markers: small gold diamonds floating over unfound packages.
const packageMeshes = [];
{
  const geo = new THREE.OctahedronGeometry(0.5);
  const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd75e, emissiveIntensity: 2 });
  for (const p of missions.packages) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p.x, 1.2, p.z);
    scene.add(m);
    packageMeshes.push(m);
  }
}
// Mission marker: a tall gold beacon over the current objective.
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.4, 0.4, 30, 8),
  new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.25, depthWrite: false }));
beacon.position.y = 15;
scene.add(beacon);

// Player avatar on foot: a simple figure with a jacket, visible in third
// person and in the foot screenshot.
const playerMesh = (() => {
  const g = new THREE.Group();
  const jacket = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.8, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0x2c5aa0, roughness: 0.8 }));
  jacket.position.y = 1.1; jacket.castShadow = true; g.add(jacket);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.7 }));
  head.position.y = 1.95; head.castShadow = true; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }));
  cap.position.y = 2.12; g.add(cap);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 }));
    leg.position.set(sx * 0.15, 0.4, 0); g.add(leg);
  }
  g.visible = false;
  scene.add(g);
  return g;
})();

// Title screen copy.
document.getElementById('title-heading').textContent = STORY.title;
document.getElementById('title-sub').textContent = STORY.subtitle;
document.getElementById('title-controls').textContent = STORY.controls;
document.getElementById('tip').textContent = `Tip: ${TIPS[(Math.random() * TIPS.length) | 0]}`;

// Wiring for missions.js callbacks that need main-level state.
state.toast = (t) => renderer.toast(t);
state.pay = (amount) => { state.cash += amount; audio.cash(); };
state.onMissionDone = (m) => {
  audio.missionDone();
  juice.addTrauma(0.25);
  renderer.toast(`Job done: ${m.name} — paid $${m.pay}.`);
  const giver = npcs.named.find((n) => n.id === m.giver);
  if (giver) giver.favorDone = true;
  save();
};
state.onPackage = (found) => {
  audio.pickup();
  renderer.toast(found >= 20
    ? 'All 20 packages! Marcus owes you a sports coupe — find him.'
    : `Package ${found}/20 — +$${CFG.economy.packageReward}.`);
};
state.playerNear = (x, z, r) => world.playerNear(x, z, r);

// Diagnostics: the live renderer.info plus a frame counter, for headless
// play-tests and the frame-rate probe.
const diagnostics = { renderer: { render: renderer.renderer.info.render, memory: renderer.renderer.info.memory } };
window.__THREE_GAME_DIAGNOSTICS__ = diagnostics;
window.__state = state;
window.__state.city = { buildings: city.buildings, palms: city.palms };
window.__state.cars = world.state.cars;
window.__state.peds = npcs.peds;
window.__state.mission = { def: null };
window.renderer = renderer.renderer;
window.scene = scene;
window.__input = input;
window.__gameReady = false;
window.__shotReady = false;

if (lowq) {
  renderer.renderer.setPixelRatio(0.75);
  scene.environmentIntensity = 0;
}

// Staged screenshot mode: build the shot, then raise __shotReady after the
// scene has had a few frames to settle.
let shotFrames = -1;
if (shotName && SHOT_NAMES.includes(shotName)) {
  stageShot(shotName, { state, world, render: renderer, npcs, city });
  shotFrames = 0;
}

const timer = new THREE.Timer();
timer.connect(document);
let acc = 0;
const STEP = 1 / 60;
let frames = 0;
let saveAt = 0;

function step(dt) {
  const a = input.actions();
  if (a.startPressed && (state.mode === 'title' || state.mode === 'dead')) {
    const wasDead = state.mode === 'dead';
    state.mode = 'play';
    audio.unlock();
    if (wasDead) {
      // Busted or wasted: wake up at the Beach Bar, clean slate, full health.
      state.health = CFG.player.health;
      state.wanted = 0;
      state.heat = 0;
      state.player.x = city.spawn.player.x;
      state.player.z = city.spawn.player.z;
      state.player.angle = city.spawn.player.angle;
      state.player.inCar = null;
      state.player.onFoot = true;
      renderer.toast('Back on your feet at the Beach Bar.');
    }
    renderer.toast(STORY.intro[2]);
  }
  if (a.pausePressed && (state.mode === 'play' || state.mode === 'paused')) {
    state.mode = state.mode === 'play' ? 'paused' : 'play';
    audio.click();
  }
  if (a.mutePressed) audio.toggleMute();
  if (a.radioPressed) {
    const on = audio.toggleRadio();
    renderer.setRadio(on ? `♪ SUN 98 — ${audio.radioLine()}` : 'Radio off');
  }
  if (state.mode === 'play') {
    world.update(dt, a);
    npcs.update(dt, performance.now() / 1000, state.player);
    missions.update(dt, state);
    const m = missions.active();
    window.__state.mission = { def: m ? { name: m.name } : null };
    audio.engine(state.player.inCar ? Math.abs(state.player.speed) / CFG.car.maxSpeed : 0, !!state.player.inCar);
    audio.siren(state.wanted >= 2, dt);
    // Sun follows the clock; the directional light tracks the player so its
    // shadow frustum always covers the action.
    const sunInfo = sky.update(state.time, camera);
    renderer.sun.intensity = sunInfo.night ? 0.4 : CFG.sun.intensity;
    renderer.sun.position.set(
      state.player.x + Math.cos(CFG.sun.azimuth) * 140,
      90, state.player.z + Math.sin(CFG.sun.azimuth) * 140);
    renderer.sun.target.position.set(state.player.x, 0, state.player.z);
    // Package markers spin; the beacon tracks the objective.
    const now = performance.now() / 1000;
    missions.packages.forEach((p, i) => {
      packageMeshes[i].visible = !p.found;
      packageMeshes[i].rotation.y = now * 1.5;
      packageMeshes[i].position.y = 1.2 + Math.sin(now * 2 + i) * 0.25;
    });
    const marker = missions.marker();
    if (marker && !marker.anywhere) {
      beacon.visible = true;
      beacon.position.set(marker.x, 15, marker.z);
    } else beacon.visible = false;
    if (now - saveAt > 15) { saveAt = now; save(); }
  }
  // Player avatar follows the player on foot; hidden while driving.
  playerMesh.visible = state.player.onFoot && state.mode !== 'title';
  if (playerMesh.visible) {
    playerMesh.position.set(state.player.x, 0, state.player.z);
    playerMesh.rotation.y = state.player.angle;
    playerMesh.position.y = state.player.moving ? Math.abs(Math.sin(performance.now() / 130)) * 0.06 : 0;
  }
  input.endFrame();
}

renderer.renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(Math.max(timer.getDelta(), 0), 0.1);
  const timeScale = juice.update(dt, performance.now() / 1000);
  acc += dt * timeScale;
  let n = 0;
  while (acc >= STEP && n < 8) { step(STEP); acc -= STEP; n++; }
  const marker = missions.marker();
  renderer.updateCamera(dt, state);
  renderer.drawMinimap(state, marker);
  renderer.updateHud(state, marker, missions.packages.filter((p) => p.found).length);
  renderer.renderer.render(scene, camera);
  renderer.renderer.info.render.frame = ++frames;
  if (shotFrames >= 0) {
    shotFrames++;
    if (shotFrames >= 8) { window.__shotReady = true; shotFrames = -1; }
  }
  if (!window.__gameReady && frames > 3) window.__gameReady = true;
});

window.addEventListener('resize', () => renderer.onResize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'play') state.mode = 'paused';
});
