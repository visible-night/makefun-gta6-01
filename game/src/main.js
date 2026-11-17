// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. Screens: title, how-to,
// play, paused; the world owns its own overlays (briefing, busted, wasted,
// mission passed/failed).
//
// ?seed=N fixes the city. ?shot=title|drive|chase|foot (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
// The live game sets window.__gameReady once the first frame is painted.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import {
  createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER, ACTION_MUTE, ACTION_HORN,
} from './input.js';
import { createRenderer, SCREEN_TITLE, SCREEN_HOWTO, SCREEN_PLAY, SCREEN_PAUSED } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const world = createWorld(createRandom(seed), audio, reduceMotion);
const renderer = createRenderer(canvas);

function announce(message) {
  status.textContent = message;
}

function titleMenu() {
  return [
    { id: 'continue', label: 'Continue', disabled: !world.hasSave() },
    { id: 'new', label: 'New Game' },
    { id: 'howto', label: 'How to Play' },
  ];
}

function pauseMenu() {
  return [
    { id: 'resume', label: 'Resume' },
    { id: 'howto', label: 'How to Play' },
    { id: 'sound', label: `Sound: ${audio.muted ? 'Off' : 'On'}` },
    { id: 'quit', label: 'Save & Quit to Title' },
  ];
}

function runShot(name) {
  const scene = stageShot(name, world);
  const ui = { menuItems: titleMenu(), menuIndex: 1, showHint: false };
  // Paint many frames, not two: smoothed HUD values (the speedometer eases
  // 15% per paint) need a couple of dozen frames to settle on the staged
  // values, or the shot shows a car that looks parked.
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, ui);
    painted += 1;
    if (painted < 25) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let returnScreen = SCREEN_TITLE;
  let menuItems = titleMenu();
  let menuIndex = world.hasSave() ? 0 : 1;
  let accumulator = 0;
  let last = performance.now();
  let started = false;
  let ready = false;

  function startNewGame() {
    audio.ensure();
    world.reset(true);
    started = true;
    screen = SCREEN_PLAY;
    audio.startMusic();
    announce('Playing. Steal the car by the Safehouse, then follow the yellow marker.');
  }

  function continueGame() {
    audio.ensure();
    world.reset(true);
    world.load();
    started = true;
    screen = SCREEN_PLAY;
    audio.startMusic();
    announce('Continuing your game in Solmar City.');
  }

  function quitToTitle() {
    world.save();
    audio.stopMusic();
    audio.engine(0, false);
    audio.skid(0);
    audio.siren(false);
    menuItems = titleMenu();
    menuIndex = 0;
    screen = SCREEN_TITLE;
    announce('Solmar City. Title screen.');
  }

  function pauseGame() {
    menuItems = pauseMenu();
    menuIndex = 0;
    screen = SCREEN_PAUSED;
    world.save();
    announce('Paused.');
  }

  function activateMenu(id) {
    audio.ensure();
    audio.click();
    if (id === 'new') startNewGame();
    else if (id === 'continue') continueGame();
    else if (id === 'howto') {
      returnScreen = screen;
      screen = SCREEN_HOWTO;
    } else if (id === 'back') {
      screen = returnScreen;
      menuItems = screen === SCREEN_PAUSED ? pauseMenu() : titleMenu();
    } else if (id === 'resume') {
      screen = SCREEN_PLAY;
    } else if (id === 'sound') {
      audio.setMuted(!audio.muted);
      menuItems = pauseMenu();
    } else if (id === 'quit') quitToTitle();
  }

  function menuMove(delta) {
    const count = menuItems.length;
    for (let i = 0; i < count; i += 1) {
      menuIndex = (menuIndex + delta + count) % count;
      if (!menuItems[menuIndex].disabled) break;
    }
  }

  function handleFrame(actions) {
    // A mouse click on a button beats the keyboard confirm from the same click.
    let confirm = actions & ACTION_CONFIRM;
    if (input.mouse.justDown) {
      for (const b of renderer.buttons) {
        if (b.disabled) continue;
        if (input.mouse.x >= b.x && input.mouse.x <= b.x + b.w && input.mouse.y >= b.y && input.mouse.y <= b.y + b.h) {
          activateMenu(b.id);
          confirm = 0;
          break;
        }
      }
    }
    // Hover follows the mouse over menu buttons.
    if (screen === SCREEN_TITLE || screen === SCREEN_PAUSED) {
      renderer.buttons.forEach((b, i) => {
        if (b.disabled) return;
        if (input.mouse.x >= b.x && input.mouse.x <= b.x + b.w && input.mouse.y >= b.y && input.mouse.y <= b.y + b.h) {
          menuIndex = i;
        }
      });
    }
    if (input.pressed('ArrowUp') || input.pressed('KeyW')) {
      if (screen === SCREEN_TITLE || screen === SCREEN_PAUSED) menuMove(-1);
    }
    if (input.pressed('ArrowDown') || input.pressed('KeyS')) {
      if (screen === SCREEN_TITLE || screen === SCREEN_PAUSED) menuMove(1);
    }
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.muted);
      if (screen === SCREEN_PAUSED) menuItems = pauseMenu();
    }

    if (screen === SCREEN_TITLE) {
      if (confirm && menuItems[menuIndex] && !menuItems[menuIndex].disabled) activateMenu(menuItems[menuIndex].id);
      return;
    }
    if (screen === SCREEN_HOWTO) {
      if (confirm || (actions & ACTION_PAUSE)) activateMenu('back');
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PLAY;
        return;
      }
      if (confirm && menuItems[menuIndex]) activateMenu(menuItems[menuIndex].id);
      return;
    }
    // SCREEN_PLAY
    if (actions & ACTION_PAUSE && !world.state.overlay) {
      pauseGame();
      return;
    }
    const overlay = world.state.overlay;
    if (overlay) {
      if (overlay === 'briefing' && input.pressed('Escape')) {
        world.declineBriefing();
        return;
      }
      if (confirm && world.state.overlayT > 0.8) world.advanceOverlay();
      return;
    }
    world.handleActions(actions & (ACTION_ENTER | ACTION_HORN), input);
  }

  function step() {
    if (screen === SCREEN_TITLE || screen === SCREEN_HOWTO) {
      world.stepAmbient(STEP);
      return;
    }
    if (screen === SCREEN_PLAY) {
      world.state.view.w = renderer.w;
      world.state.view.h = renderer.h;
      world.step(STEP, input, null);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleFrame(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_HOWTO || screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen === SCREEN_PAUSED) break;
      }
    } else {
      accumulator = 0;
    }
    const ui = {
      menuItems,
      menuIndex,
      showHint: started && world.state.time < 25 && !world.state.overlay,
    };
    renderer.draw(world, screen, ui);
    input.endFrame();
    if (!ready) {
      ready = true;
      window.__gameReady = true;
      window.__state = world.state;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) pauseGame();
  });
  window.addEventListener('blur', () => {
    if (screen === SCREEN_PLAY) pauseGame();
  });
  window.addEventListener('pointerdown', () => audio.ensure(), { once: true });
  // F toggles fullscreen: the canvas already fills the window, so this only
  // drops the browser chrome for a cleaner frame.
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyF') return;
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });

  announce('Solmar City. An open-world crime game. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
