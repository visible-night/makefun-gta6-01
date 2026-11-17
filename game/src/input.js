// Keyboard and mouse. Held keys are read every step; one-shot presses are queued as
// bit flags and taken once, so a press between two frames is never lost or double-counted.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MUTE = 8;
export const ACTION_HORN = 16;

const GAME_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyM', 'KeyH', 'KeyP',
  'Enter', 'Escape', 'ShiftLeft', 'ShiftRight',
]);
const CONFIRM = new Set(['Enter', 'Space']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false, justDown: false, justUp: false };

  window.addEventListener('keydown', (event) => {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    if (!event.repeat) {
      pressed.add(event.code);
      if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
      if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
      if (event.code === 'KeyE') actions |= ACTION_ENTER;
      if (event.code === 'KeyM') actions |= ACTION_MUTE;
      if (event.code === 'KeyH') actions |= ACTION_HORN;
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
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.down = true;
    mouse.justDown = true;
    if (event.button === 0) actions |= ACTION_CONFIRM;
  });
  window.addEventListener('mouseup', () => {
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
      return pressed.has(code);
    },
    // -1..1 on each axis from WASD or arrows.
    axis() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    running() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    handbrake() {
      return held.has('Space');
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    endFrame() {
      pressed.clear();
      mouse.justDown = false;
      mouse.justUp = false;
    },
  };
}
