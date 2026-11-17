// Keyboard and pointer. Held keys are read every fixed step; one-shot presses
// queue as bit flags and are taken once, so a press between two frames is never
// lost or counted twice. Pointer Events are the single stream for mouse, touch
// and pen, and every coordinate converts through the canvas rect.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MUTE = 8;
export const ACTION_HORN = 16;

const GAME_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyM', 'KeyH', 'KeyP', 'KeyQ',
  // KeyF is the fullscreen toggle, handled in main.js; capturing it here
  // keeps the keypress from reaching anything else.
  'KeyF',
  'Enter', 'Escape', 'ShiftLeft', 'ShiftRight',
]);
const CONFIRM_KEYS = new Set(['Enter', 'Space']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);

export function createInput(canvas) {
  const held = new Set();
  const fresh = new Set();
  let queued = 0;
  const mouse = { x: 0, y: 0, down: false, justDown: false, justUp: false };

  // CSS pixels, matching the renderer's logical size: the canvas fills the
  // window, so the rect offset is the whole conversion.
  function toCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  window.addEventListener('keydown', (event) => {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    if (!event.repeat) {
      fresh.add(event.code);
      if (CONFIRM_KEYS.has(event.code)) queued |= ACTION_CONFIRM;
      if (PAUSE_KEYS.has(event.code)) queued |= ACTION_PAUSE;
      if (event.code === 'KeyE') queued |= ACTION_ENTER;
      if (event.code === 'KeyM') queued |= ACTION_MUTE;
      if (event.code === 'KeyH') queued |= ACTION_HORN;
    }
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const p = toCanvas(event);
    mouse.x = p.x;
    mouse.y = p.y;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const p = toCanvas(event);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.down = true;
    mouse.justDown = true;
    if (event.button === 0) queued |= ACTION_CONFIRM;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a nicety; the game plays without it.
    }
  });
  window.addEventListener('pointerup', () => {
    if (mouse.down) mouse.justUp = true;
    mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    down(code) {
      return held.has(code);
    },
    // True once for a fresh press; consumed by endFrame.
    pressed(code) {
      return fresh.has(code);
    },
    // Each axis from -1 to 1, from WASD or the arrow keys.
    axis() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0)
        - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0)
        - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    running() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    handbrake() {
      return held.has('Space');
    },
    takeActions() {
      const taken = queued;
      queued = 0;
      return taken;
    },
    endFrame() {
      fresh.clear();
      mouse.justDown = false;
      mouse.justUp = false;
    },
  };
}
