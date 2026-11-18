// Keyboard + mouse input. Gameplay reads named actions; bindings are data here.
const KEY_ACTIONS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run', Space: 'brake',
  KeyE: 'use', KeyH: 'horn', KeyQ: 'weapon', KeyM: 'mute', KeyF: 'fullscreen',
  KeyP: 'pause', Escape: 'pause', Enter: 'confirm',
};
// v5: orbitDX/orbitDY/wheel are read by render.js each frame (mouse orbit + wheel zoom) and cleared here by update(); the camera never reads them directly.
export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set(); // edge-triggered, consumed by update()
  const buffered = new Map(); // action -> game time when pressed (0.15 s buffer)
  let gameTime = 0;
  const inp = {
    mouseX: 0, mouseY: 0, mouseDown: false, mousePressed: false,
    orbitDX: 0, orbitDY: 0, locked: false, wheel: 0,
    held: (a) => held.has(a),
    pressed: (a) => pressed.has(a),
    buffered: (a) => {
      const t = buffered.get(a);
      if (t === undefined) return false;
      if (gameTime - t > 0.15) { buffered.delete(a); return false; }
      return true;
    },
    consume: (a) => { pressed.delete(a); buffered.delete(a); },
    axis: () => {
      let x = 0, y = 0;
      if (held.has('left')) x -= 1;
      if (held.has('right')) x += 1;
      if (held.has('up')) y += 1;
      if (held.has('down')) y -= 1;
      return { x, y };
    },
    update(dt) {
      gameTime += dt;
      pressed.clear();
      inp.mousePressed = false;
      inp.orbitDX = 0; inp.orbitDY = 0; inp.wheel = 0;
    },
    lockPointer() {
      if (document.pointerLockElement !== canvas) {
        const r = canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      }
    },
    unlockPointer() { if (document.pointerLockElement === canvas) document.exitPointerLock(); },
    destroy() {},
  };
  const onKey = (down) => (e) => {
    const a = KEY_ACTIONS[e.code];
    if (!a) return;
    if (down) {
      if (!held.has(a)) { pressed.add(a); buffered.set(a, gameTime); }
      held.add(a);
    } else held.delete(a);
    if (['up', 'down', 'left', 'right', 'brake'].includes(a)) e.preventDefault();
  };
  window.addEventListener('keydown', onKey(true));
  window.addEventListener('keyup', onKey(false));
  window.addEventListener('blur', () => held.clear());
  canvas.addEventListener('mousemove', (e) => {
    inp.mouseX = e.clientX; inp.mouseY = e.clientY;
    if (inp.locked) { inp.orbitDX += e.movementX; inp.orbitDY += e.movementY; }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { inp.mouseDown = true; inp.mousePressed = true; }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) inp.mouseDown = false; });
  canvas.addEventListener('wheel', (e) => { inp.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerlockchange', () => { inp.locked = document.pointerLockElement === canvas; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  return inp;
}
