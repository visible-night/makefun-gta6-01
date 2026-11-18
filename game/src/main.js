// Boot, fixed-step loop, HUD, menus, save/load, dialogue UI, event routing.
import { buildCity } from './city.js';
import { createWorld, update as updateWorld } from './world.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { missionTarget, missionText, sideJobTarget } from './missions.js';
import { startDialogue, dialogueNode, dialogueChoose } from './npcs.js';
import { SAVE_KEY, PLAYER_HP } from './config.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '1', 10) || 1;
const shot = params.get('shot');
const fresh = params.get('fresh') === '1';
function loadSave() {
  if (fresh) return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
const saveData = loadSave();
const city = buildCity(seed);
const S = createWorld(seed, city, saveData);
const input = createInput(document.getElementById('game'));
const audio = createAudio();
// v5 render contract: createRenderer returns {renderer, juice, boom, setBeacon, update, setOrbit, setZoom}; S.camYaw is written by render.update every frame and is the movement basis in world.js.
const render = createRenderer(document.getElementById('game'), city, S);
const $ = (id) => document.getElementById(id);
const els = {
  cash: $('cash'), clock: $('clock'), stars: $('stars'), hp: $('hp-fill'), armour: $('armour-fill'),
  speed: $('speed'), objective: $('objective'), hints: $('hints'), banner: $('banner'),
  bannerTitle: $('banner-title'), bannerSub: $('banner-sub'), toast: $('toast'), bark: $('bark'),
  dialogue: $('dialogue'), dlgName: $('dlg-name'), dlgText: $('dlg-text'), dlgChoices: $('dlg-choices'),
  title: $('title'), btnContinue: $('btn-continue'), pause: $('pause'), dead: $('dead'),
  pkg: $('packages'), muteBtn: $('mute-btn'),
};
let dlg = null;
let playTime = 0;
let bannerTimer = null, toastTimer = null;
let lastHud = {};
function setText(el, key, value) {
  if (lastHud[key] !== value) { lastHud[key] = value; el.textContent = value; }
}
function showBanner(title, sub = '', ms = 2600) {
  els.bannerTitle.textContent = title;
  els.bannerSub.textContent = sub;
  els.banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => els.banner.classList.remove('show'), ms);
}
function showToast(text, ms = 2500) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
}
function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      seed, time: S.time, cash: S.player.cash, hp: S.player.hp, hasSmg: S.player.hasSmg,
      missionIdx: S.missionIdx, rep: S.rep, flags: S.flags,
      packages: city.packages.filter((p) => p.found).map((p) => p.id),
    }));
    showToast('Progress saved.');
  } catch { showToast('Save failed (storage unavailable).'); }
}
function openDialogue(npcId) {
  const npc = S.named.find((n) => n.id === npcId);
  dlg = startDialogue(S, npcId);
  if (!dlg) return;
  S.mode = 'dialogue';
  els.dialogue.classList.add('show');
  renderDialogue(npc);
}
function renderDialogue(npc) {
  const view = dialogueNode(S, dlg);
  els.dlgName.textContent = npc ? `${npc.name} — ${npc.role}` : '???';
  els.dlgText.textContent = view.text;
  els.dlgChoices.innerHTML = '';
  view.choices.forEach((c, i) => {
    const b = document.createElement('button');
    b.textContent = `${i + 1}. ${c.text}`;
    b.addEventListener('click', () => chooseDialogue(i));
    els.dlgChoices.appendChild(b);
  });
  if (view.end) {
    const b = document.createElement('button');
    b.textContent = '1. (Leave)';
    b.addEventListener('click', () => closeDialogue());
    els.dlgChoices.appendChild(b);
  }
}
function chooseDialogue(i) {
  const npc = S.named.find((n) => n.id === dlg.npcId);
  audio.uiClick();
  dlg = dialogueChoose(S, dlg, i);
  if (!dlg) { closeDialogue(); return; }
  renderDialogue(npc);
}
function closeDialogue() {
  dlg = null;
  els.dialogue.classList.remove('show');
  S.mode = 'play';
}
window.addEventListener('keydown', (e) => {
  if (S.mode !== 'dialogue' || !dlg) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 3) {
    const view = dialogueNode(S, dlg);
    if (view.end && n === 1) closeDialogue();
    else chooseDialogue(n - 1);
  }
});

// --- Event drain: world events -> audio, juice, DOM ---
function drainEvents() {
  for (const e of S.events) {
    switch (e.type) {
      case 'gunshot':
        audio.gunshot();
        render.juice.tracer(e.x, e.y, e.z, e.tx, e.ty, e.tz);
        render.juice.burst(e.x, e.y, e.z, 3, 0xffe9a8, 2, 1);
        break;
      case 'hit': render.juice.burst(e.x, e.y, e.z, 6, 0xff5533, 4, 2); break;
      case 'kill':
        render.juice.burst(e.x, 1, e.z, 10, 0xcc2222, 4, 3);
        render.juice.addTrauma(0.25);
        break;
      case 'explosion':
        audio.explosion();
        render.juice.explosion(e.x, e.y, e.z);
        render.boom(e.x, e.y, e.z);
        break;
      case 'crash':
        render.juice.burst(e.x, 0.8, e.z, e.hard ? 10 : 4, 0xffcc66, 5, 2);
        if (e.hard) { audio.noise(0.15, 0.3, 200, 1200); render.juice.addTrauma(0.3); }
        break;
      case 'smoke':
        render.juice.burst(e.x, e.y, e.z, 1, e.fire ? 0xff7722 : 0x777777, 1, 2);
        break;
      case 'horn': audio.horn(); break;
      case 'pickup': audio.pickup(); showToast(e.label); break;
      case 'cash': audio.cash(); showToast(e.label || `+$${e.amount}`); break;
      case 'toast': showToast(e.label); break;
      case 'mission-start': showBanner(e.name, e.intro, 3600); audio.missionOk(); break;
      case 'mission-complete':
        showBanner('Job Complete', `${e.name} — $${e.reward}`, 3600);
        audio.missionOk(); writeSave();
        break;
      case 'mission-fail': showBanner('Job Failed', e.why, 3000); audio.missionFail(); break;
      case 'sidejob': showToast(e.label, 3500); break;
      case 'dialogue': openDialogue(e.npcId); break;
      case 'save': writeSave(); break;
      case 'spray': audio.cash(); showToast('Repaint done — wanted level cleared.'); break;
      case 'hurt':
        render.juice.setVignette(0.55);
        render.juice.addTrauma(0.4);
        setTimeout(() => render.juice.setVignette(S.player.hp < 30 ? 0.3 : 0), 250);
        break;
      case 'shake': render.juice.addTrauma(e.amount); break;
      case 'wasted':
        S.mode = 'dead';
        els.dead.classList.add('show');
        audio.missionFail();
        break;
      default: break;
    }
  }
  S.events.length = 0;
}
// --- HUD ---
const HINTS = [
  [2, 'WASD to move • Mouse to aim • Click to shoot'],
  [14, 'Press E near the red sedan to steal it — then drive!'],
  [30, 'Follow the yellow beacon to the Safehouse to start your first job.'],
  [60, 'Cops chase you when wanted. Break line of sight or visit Spray & Go.'],
  [100, '20 hidden packages pay $50 each. Talk to Rosa at the beach bar.'],
];
function updateHud() {
  const p = S.player;
  setText(els.cash, 'cash', `$${Math.floor(p.cash)}`);
  const h = Math.floor(S.time % 24), m = Math.floor((S.time % 1) * 60);
  setText(els.clock, 'clock', `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  setText(els.stars, 'stars', '★'.repeat(S.wanted) + '☆'.repeat(5 - S.wanted));
  els.hp.style.width = `${Math.max(0, p.hp)}%`;
  els.armour.style.width = `${Math.max(0, p.armour)}%`;
  const found = city.packages.filter((x) => x.found).length;
  setText(els.pkg, 'pkg', `📦 ${found}/20`);
  setText(els.speed, 'speed', p.inCar ? `${Math.round(Math.abs(p.inCar.speed) * 3.6)} km/h` : '');
  const obj = missionText(S) + (S.sideJob ? ` • Side: ${S.sideJob.kind === 'fare' ? 'Taxi fare' : 'Vigilante'}` : '');
  setText(els.objective, 'obj', obj);
  // Coach hints for the first 120 seconds.
  let hint = '';
  if (playTime < 120) {
    for (const [t, text] of HINTS) if (playTime >= t) hint = text;
  }
  if (S.hint) { hint = S.hint; S.hint = ''; }
  setText(els.hints, 'hints', hint);
  // NPC bark bubble.
  if (S.lastBark) {
    S.lastBark.t += 1 / 60;
    if (S.lastBark.t < 3) {
      els.bark.textContent = `${S.lastBark.name}: “${S.lastBark.text}”`;
      els.bark.classList.add('show');
    } else els.bark.classList.remove('show');
  }
  // Low-health vignette.
  if (p.hp < 30 && S.mode === 'play') render.juice.setVignette(0.3 + Math.sin(performance.now() * 0.004) * 0.1);
  // Engine + siren loops.
  audio.engine(!!p.inCar, p.inCar ? Math.abs(p.inCar.speed) / 46 : 0);
  audio.siren(S.wanted > 0);
}
// --- Menus ---
function startPlay() {
  audio.unlock();
  audio.startMusic();
  S.mode = 'play';
  els.title.classList.remove('show');
  els.pause.classList.remove('show');
  input.lockPointer();
}
$('btn-new').addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  location.href = `${location.pathname}?fresh=1&seed=${1 + Math.floor(Math.random() * 99999)}`;
});
if (saveData) {
  els.btnContinue.classList.remove('hidden');
  els.btnContinue.addEventListener('click', startPlay);
}
$('btn-resume').addEventListener('click', () => { S.mode = 'play'; els.pause.classList.remove('show'); input.lockPointer(); });
$('btn-save').addEventListener('click', writeSave);
$('btn-title').addEventListener('click', () => { writeSave(); location.href = location.pathname; });
$('btn-respawn').addEventListener('click', respawn);
function respawn() {
  const p = S.player;
  p.dead = false;
  p.hp = PLAYER_HP;
  p.cash = Math.max(0, p.cash - 100);
  S.heat = 0; S.wanted = 0;
  S.cops = [];
  S.cars = S.cars.filter((c) => c.role !== 'police');
  p.inCar = null;
  p.x = city.landmarks.spawn.x; p.z = city.landmarks.spawn.z;
  els.dead.classList.remove('show');
  S.mode = 'play';
  showBanner('Back on your feet', 'The hospital took $100. Stay sharp.', 3000);
}
els.muteBtn.addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  els.muteBtn.textContent = audio.muted ? '🔇' : '🔊';
});
if (audio.muted) els.muteBtn.textContent = '🔇';
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.mode === 'play') { S.mode = 'paused'; els.pause.classList.add('show'); }
});
window.addEventListener('blur', () => {
  if (S.mode === 'play') { S.mode = 'paused'; els.pause.classList.add('show'); }
});
// --- Main loop: fixed 120 Hz sim, render every frame ---
const STEP = 1 / 120;
let last = performance.now();
let acc = 0;
let frames = 0;
let shotReadySent = false;
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  frames++;
  if (S.mode === 'play') {
    playTime += realDt;
    acc += realDt * render.juice.timeScale;
    let steps = 0;
    while (acc >= STEP && steps < 12) { updateWorld(S, input, STEP); acc -= STEP; steps++; }
    if (steps === 12) acc = 0;
    drainEvents();
    updateHud();
    if (input.pressed('pause')) { input.consume('pause'); S.mode = 'paused'; els.pause.classList.add('show'); input.unlockPointer(); }
    if (input.pressed('mute')) { input.consume('mute'); els.muteBtn.click(); }
    if (input.pressed('fullscreen')) {
      input.consume('fullscreen');
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    }
  } else if (S.mode === 'paused') {
    if (input.pressed('pause') || input.pressed('confirm')) {
      input.consume('pause'); input.consume('confirm');
      S.mode = 'play'; els.pause.classList.remove('show'); input.lockPointer();
    }
  } else if (S.mode === 'title') {
    if (input.pressed('confirm')) { input.consume('confirm'); startPlay(); }
  } else if (S.mode === 'dead') {
    if (input.pressed('confirm')) { input.consume('confirm'); respawn(); }
  }
  const target = missionTarget(S) || sideJobTarget(S)
    || (!S.mission && S.missionIdx < 6 ? { ...city.landmarks.safehouse, label: 'Next job' } : null);
  render.setBeacon(target);
  render.update(realDt * render.juice.timeScale, realDt, now / 1000, input, target);
  input.update(realDt);
  if (frames === 2) {
    window.__gameReady = true;
    window.__state = S;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      renderer: render.renderer.info,
      get state() { return { mode: S.mode, wanted: S.wanted, cars: S.cars.length, peds: S.peds.length, mission: S.missionIdx }; },
    };
  }
  if (shot && !shotReadySent && frames > 30) {
    shotReadySent = true;
    window.__shotReady = true;
  }
}
// --- Boot ---
if (shot) {
  stageShot(S, render, shot);
  playTime = 999; // staged screenshots skip the coach hints
  if (S.mode === 'title') els.title.classList.add('show');
  audio.unlock();
} else {
  els.title.classList.add('show');
  if (saveData) $('title-save-info').textContent = `Save found: $${saveData.cash}, job ${Math.min(saveData.missionIdx + 1, 6)}/6.`;
}
requestAnimationFrame(frame);
