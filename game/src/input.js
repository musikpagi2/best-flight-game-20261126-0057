// Keyboard and mouse input. Held keys give a steering direction; one-shot
// presses (confirm, pause, flaps, camera, mute, restart) are queued as bit
// flags and taken once by the loop, so a press between two frames is never
// lost and never counted twice. Mouse: hold the left button and move to steer.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_FLAPS = 4;
export const ACTION_CAMERA = 8;
export const ACTION_MUTE = 16;
export const ACTION_RESTART = 32;

const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const PITCH_UP = new Set(['ArrowUp']);
const PITCH_DOWN = new Set(['ArrowDown']);
const THROTTLE_UP = new Set(['KeyW', 'ShiftLeft', 'ShiftRight']);
const THROTTLE_DOWN = new Set(['KeyS', 'ControlLeft', 'ControlRight']);
const RUDDER_LEFT = new Set(['KeyQ']);
const RUDDER_RIGHT = new Set(['KeyE']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const BRAKE = new Set(['KeyB']);

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  let mouseSteer = null; // {x, y} in -1..1 while the mouse button is held
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code)) keys.add(event.code);
      event.preventDefault();
      return;
    }
    keys.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (event.code === 'KeyF') actions |= ACTION_FLAPS;
    else if (event.code === 'KeyC') actions |= ACTION_CAMERA;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'KeyR') actions |= ACTION_RESTART;
    if (
      ROLL_LEFT.has(event.code) || ROLL_RIGHT.has(event.code) ||
      PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code) ||
      THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code) ||
      RUDDER_LEFT.has(event.code) || RUDDER_RIGHT.has(event.code) ||
      CONFIRM.has(event.code) || PAUSE.has(event.code) || BRAKE.has(event.code)
    ) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    keys.clear();
    mouseSteer = null;
    mouseDown = false;
  });

  target.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    mouseSteer = { x: 0, y: 0 };
    actions |= ACTION_CONFIRM;
    target.setPointerCapture(event.pointerId);
  });
  target.addEventListener('pointermove', (event) => {
    if (!mouseDown) return;
    const rect = target.getBoundingClientRect();
    mouseSteer = {
      x: Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)),
      y: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)),
    };
  });
  const endPointer = () => {
    mouseDown = false;
    mouseSteer = null;
  };
  target.addEventListener('pointerup', endPointer);
  target.addEventListener('pointercancel', endPointer);

  function has(set) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }

  return {
    /** The steering snapshot for this frame. */
    read() {
      let roll = (has(ROLL_RIGHT) ? 1 : 0) - (has(ROLL_LEFT) ? 1 : 0);
      let pitch = (has(PITCH_UP) ? 1 : 0) - (has(PITCH_DOWN) ? 1 : 0);
      if (mouseSteer) {
        roll = mouseSteer.x;
        pitch = -mouseSteer.y;
      }
      return {
        throttle: (has(THROTTLE_UP) ? 1 : 0) - (has(THROTTLE_DOWN) ? 1 : 0),
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
        rudder: (has(RUDDER_RIGHT) ? 1 : 0) - (has(RUDDER_LEFT) ? 1 : 0),
        brake: has(BRAKE),
        flapsToggle: false,
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
