// SPDX-License-Identifier: AGPL-3.0-or-later
// Input: keyboard, gamepad and touch mapped to actions. Game logic reads only `state` (held/analog
// actions), `pressed` (one-shot actions, cleared by endStep after an update consumed them) and
// `tap` (a one-shot touch or click point in overlay pixels, for menus). Driving actions can be
// remapped (setBindings); menu keys (arrows, Enter, Escape, Backspace, D-pad, A, B) stay fixed.

import { CONFIG } from '../config.js';

/** Remappable driving actions in menu order, with their labels. */
export const BINDABLE = [
  ['throttle', 'THROTTLE'], ['brake', 'BRAKE'], ['steerLeft', 'STEER LEFT'], ['steerRight', 'STEER RIGHT'],
  ['gearUp', 'GEAR UP'], ['gearDown', 'GEAR DOWN'], ['horn', 'HORN'], ['camera', 'CAMERA'],
  ['lookBack', 'LOOK BACK'], ['replay', 'REPLAY'], ['pause', 'PAUSE'],
];
/** Default keyboard codes of the remappable actions. */
export const DEFAULT_KEYS = {
  throttle: ['ArrowUp', 'KeyW'], brake: ['ArrowDown', 'KeyS'], steerLeft: ['ArrowLeft', 'KeyA'], steerRight: ['ArrowRight', 'KeyD'],
  gearUp: ['KeyE'], gearDown: ['KeyQ'], horn: ['KeyH'], camera: ['KeyC'], lookBack: ['KeyV'],
  replay: ['KeyR'], pause: ['Escape', 'KeyP'],
};
// Standard gamepad mapping: RT/A, LT/B, D-pad, RB, LB, L3, Y, R3, Back, Start.
/** Default gamepad buttons of the remappable actions. */
export const DEFAULT_PAD = {
  throttle: [7, 0], brake: [6, 1], steerLeft: [14], steerRight: [15],
  gearUp: [5], gearDown: [4], horn: [10], camera: [3], lookBack: [11], replay: [8], pause: [9],
};
// Fixed menu keys and buttons.
const MENU_KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  confirm: ['Enter'], back: ['Escape', 'Backspace'],
};
const MENU_PAD = { left: [14], right: [15], up: [12], down: [13], confirm: [0], back: [1] };
/** Keys that never become bindings: debug keys, mute, and Escape (cancels a capture). */
export const RESERVED_KEYS = ['F1', 'F2', 'F3', 'F4', 'KeyM', 'Escape'];
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT'];

/**
 * Short label of a keyboard code ('KeyW' -> 'W', 'ArrowUp' -> 'UP').
 * @param {string} code
 * @returns {string}
 */
export function keyLabel(code) {
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
  // ShiftLeft -> SHIFTL, Numpad4 -> NUM4.
  return code.replace(/^(Key|Digit)/, '').replace(/^Numpad/, 'NUM').replace(/(Left|Right)$/, (m) => m[0])
    .toUpperCase().slice(0, 8);
}

/**
 * Label of a standard-mapping gamepad button.
 * @param {number} button
 * @returns {string}
 */
export function padLabel(button) {
  return PAD_NAMES[button] || `B${button}`;
}

/**
 * Assigns one key (or pad button) to an action; an action that had it before gets the previous
 * binding of this action instead (swap), so nothing is left unbound.
 * @param {Object<string, Array>} map action -> keys or buttons (changed in place)
 * @param {string} action
 * @param {string|number} code
 */
export function bind(map, action, code) {
  const previous = map[action];
  for (const other in map) {
    if (other === action || !map[other].includes(code)) continue;
    map[other] = map[other].filter((c) => c !== code);
    if (!map[other].length) map[other] = previous.slice(0, 1);
  }
  map[action] = [code];
}
const ONE_SHOT = ['gearUp', 'gearDown', 'camera', 'pause', 'confirm', 'back', 'left', 'right', 'up', 'down', 'replay'];
const PAD_STEER_AXIS = 0;
// Stick directions that count as a menu press: [action, axis, sign].
const STICK_MENU = [['left', 0, -1], ['right', 0, 1], ['up', 1, -1], ['down', 1, 1]];
const MAX_TOUCHES = 10;

/**
 * @param {HTMLElement} [surface] element receiving touches and clicks (the canvas)
 * @returns {{state: {throttle: number, brake: number, steer: number, horn: boolean, lookBack: boolean},
 *   pressed: Object<string, boolean>, tap: {x: number, y: number, on: boolean},
 *   touch: {used: boolean, count: number, xs: Float32Array, ys: Float32Array},
 *   setButtons: (buttons: Array|null) => void, setBindings: (keys: Object, pad: Object) => void,
 *   capture: (done: ((binding: {key?: string, button?: number} | null) => void) | null) => void,
 *   poll: (dt: number) => void, endStep: () => void}}
 */
export function createInput(surface) {
  const cfg = CONFIG.input;
  const down = new Set();
  const state = { throttle: 0, brake: 0, steer: 0, horn: false, lookBack: false };
  const pressed = {}, held = {};
  for (const action of ONE_SHOT) pressed[action] = held[action] = false;
  const tap = { x: 0, y: 0, on: false };
  const touch = { used: false, count: 0, xs: new Float32Array(MAX_TOUCHES), ys: new Float32Array(MAX_TOUCHES) };
  const touchHeld = {};
  let pad = null, buttons = null, capturing = null;
  const keyMap = { ...MENU_KEYS }, padMap = { ...MENU_PAD };
  const padWas = new Uint8Array(32);
  function setBindings(keys, pads) {
    for (const action in DEFAULT_KEYS) {
      keyMap[action] = (keys && keys[action]) || DEFAULT_KEYS[action];
      padMap[action] = (pads && pads[action]) || DEFAULT_PAD[action];
    }
  }
  setBindings(null, null);

  window.addEventListener('keydown', (e) => {
    if (capturing) {
      // The next key becomes a binding; Escape cancels; reserved keys are ignored.
      e.preventDefault();
      if (e.code === 'Escape') finishCapture(null);
      else if (!RESERVED_KEYS.includes(e.code)) finishCapture({ key: e.code });
      return;
    }
    down.add(e.code);
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());

  // Client coordinates -> overlay pixels inside the 4:3 letterbox.
  function toOverlay(clientX, clientY, i) {
    const r = surface.getBoundingClientRect(), aspect = CONFIG.render.displayAspect;
    const h = Math.min(r.height, r.width / aspect), w = h * aspect;
    touch.xs[i] = ((clientX - r.left - (r.width - w) / 2) / w) * CONFIG.render.width;
    touch.ys[i] = ((clientY - r.top - (r.height - h) / 2) / h) * CONFIG.render.height;
  }
  function readTouches(e) {
    e.preventDefault();
    touch.used = true;
    touch.count = Math.min(MAX_TOUCHES, e.touches.length);
    for (let i = 0; i < touch.count; i++) toOverlay(e.touches[i].clientX, e.touches[i].clientY, i);
  }
  if (surface) {
    surface.addEventListener('touchstart', (e) => {
      readTouches(e);
      const t = e.changedTouches[0];
      toOverlay(t.clientX, t.clientY, MAX_TOUCHES - 1);
      tap.x = touch.xs[MAX_TOUCHES - 1];
      tap.y = touch.ys[MAX_TOUCHES - 1];
      tap.on = true;
    }, { passive: false });
    surface.addEventListener('touchmove', readTouches, { passive: false });
    surface.addEventListener('touchend', readTouches, { passive: false });
    surface.addEventListener('touchcancel', readTouches, { passive: false });
    surface.addEventListener('mousedown', (e) => {
      toOverlay(e.clientX, e.clientY, MAX_TOUCHES - 1);
      tap.x = touch.xs[MAX_TOUCHES - 1];
      tap.y = touch.ys[MAX_TOUCHES - 1];
      tap.on = true;
    });
  }

  // On-screen buttons held by a finger.
  function readButtons() {
    for (const action in touchHeld) touchHeld[action] = false;
    if (!buttons) return;
    for (let b = 0; b < buttons.length; b++) {
      const button = buttons[b];
      for (let i = 0; i < touch.count; i++) {
        const x = touch.xs[i], y = touch.ys[i];
        if (x >= button.x && x < button.x + button.w && y >= button.y && y < button.y + button.h) touchHeld[button.action] = true;
      }
    }
  }

  // Analog value of an action: 1 for a key or a touch button, the button value for a gamepad.
  function value(action) {
    if (touchHeld[action]) return 1;
    const keys = keyMap[action], pads = padMap[action];
    for (let i = 0; i < keys.length; i++) if (down.has(keys[i])) return 1;
    let v = 0;
    if (pad) {
      for (let i = 0; i < pads.length; i++) {
        const button = pad.buttons[pads[i]];
        if (button) v = Math.max(v, button.pressed ? Math.max(button.value, 1e-3) : 0);
      }
    }
    return v;
  }

  function findPad() {
    // Queried every frame: pads appear and disappear while the game runs.
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    if (pads) for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) return pads[i];
    return null;
  }

  function stickMenu(action) {
    if (!pad) return false;
    for (let i = 0; i < STICK_MENU.length; i++) {
      const entry = STICK_MENU[i];
      if (entry[0] === action && (pad.axes[entry[1]] || 0) * entry[2] > cfg.menuStick) return true;
    }
    return false;
  }

  function finishCapture(binding) {
    const done = capturing;
    capturing = null;
    down.clear();
    done(binding);
  }

  // While capturing, a newly pressed pad button becomes the binding.
  function capturePad() {
    if (!pad) return;
    for (let i = 0; i < pad.buttons.length && i < padWas.length; i++) {
      const on = pad.buttons[i].pressed;
      if (on && !padWas[i] && capturing) finishCapture({ button: i });
      padWas[i] = on ? 1 : 0;
    }
  }

  function poll(dt) {
    pad = findPad();
    if (capturing) {
      capturePad();
      return;
    }
    if (pad) for (let i = 0; i < pad.buttons.length && i < padWas.length; i++) padWas[i] = pad.buttons[i].pressed ? 1 : 0;
    readButtons();
    state.throttle = value('throttle');
    state.brake = value('brake');
    state.horn = value('horn') > 0;
    state.lookBack = value('lookBack') > 0;
    const stick = pad ? pad.axes[PAD_STEER_AXIS] || 0 : 0;
    if (Math.abs(stick) > cfg.deadzone) {
      state.steer = (stick - Math.sign(stick) * cfg.deadzone) / (1 - cfg.deadzone);
    } else {
      // Touch arrows (left/right) steer too.
      const want = Math.max(value('steerRight'), touchHeld.right ? 1 : 0) - Math.max(value('steerLeft'), touchHeld.left ? 1 : 0);
      const rate = (want === 0 || want * state.steer < 0 ? cfg.steerReturn : cfg.steerRate) * dt;
      state.steer += Math.max(-rate, Math.min(rate, want - state.steer));
    }
    for (let i = 0; i < ONE_SHOT.length; i++) {
      const action = ONE_SHOT[i], now = value(action) > 0 || stickMenu(action);
      if (now && !held[action]) pressed[action] = true;
      held[action] = now;
    }
  }

  function endStep() {
    for (let i = 0; i < ONE_SHOT.length; i++) pressed[ONE_SHOT[i]] = false;
    tap.on = false;
  }

  return {
    state, pressed, tap, touch, poll, endStep,
    /** On-screen touch buttons [{action, x, y, w, h}] in overlay pixels, or null. */
    setButtons(list) { buttons = list; },
    /** Remapped driving actions: {action: [codes]}, {action: [buttons]}; missing ones use defaults. */
    setBindings,
    /** Sends the next key or pad button to `done` (null after Escape) instead of the game. */
    capture(done) { capturing = done; },
    get capturing() { return capturing !== null; },
  };
}
