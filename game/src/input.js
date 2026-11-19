// Input for Solmar City: keyboard, mouse and touch, all funnelled into named
// actions. Gameplay reads actions, never raw keys — bindings are data in
// config.js, so rebinding is a data edit. Edge detection lives here too:
// pressed() is true only on the frame the key went down.
import { KEYS } from './config.js';

export function createInput(canvas) {
  const held = new Set();
  const pressedQueue = new Set();
  const releasedQueue = new Set();
  let mouseDown = false;
  let mouseEdge = false;
  let mouseX = 0, mouseY = 0;
  let lastDevice = 'keyboard';
  let touch = { x: 0, y: 0, active: false };

  const codeOf = (e) => e.code;
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    held.add(codeOf(e));
    pressedQueue.add(codeOf(e));
    lastDevice = 'keyboard';
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    held.delete(codeOf(e));
    releasedQueue.add(codeOf(e));
  });
  window.addEventListener('blur', () => { held.clear(); });
  canvas.addEventListener('mousedown', (e) => {
    mouseDown = true; mouseEdge = true; mouseX = e.clientX; mouseY = e.clientY;
    lastDevice = 'mouse';
  });
  window.addEventListener('mouseup', () => { mouseDown = false; });
  canvas.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
  canvas.addEventListener('touchstart', (e) => {
    lastDevice = 'touch';
    const t = e.touches[0];
    touch = { x: t.clientX, y: t.clientY, active: true };
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', () => { touch.active = false; });

  const anyHeld = (codes) => codes.some((c) => held.has(c));
  const anyPressed = (codes) => codes.some((c) => pressedQueue.has(c));

  return {
    // Called once per frame after the game reads actions: clears edge state.
    endFrame() {
      pressedQueue.clear();
      releasedQueue.clear();
      mouseEdge = false;
    },
    actions() {
      return {
        up: anyHeld(KEYS.up), down: anyHeld(KEYS.down),
        left: anyHeld(KEYS.left), right: anyHeld(KEYS.right),
        brake: anyHeld(KEYS.brake),
        interactPressed: anyPressed(KEYS.interact),
        hornPressed: anyPressed(KEYS.horn),
        pausePressed: anyPressed(KEYS.pause),
        radioPressed: anyPressed(KEYS.radio),
        mutePressed: anyPressed(KEYS.mute),
        startPressed: anyPressed(KEYS.start),
        sprint: anyHeld(KEYS.sprint),
        shootPressed: mouseEdge, shootHeld: mouseDown,
        mouseX, mouseY, touch, lastDevice,
      };
    },
    // Touch buttons on the HUD call these directly.
    press(code) { held.add(code); pressedQueue.add(code); },
    release(code) { held.delete(code); },
    isHeld(code) { return held.has(code); },
  };
}
