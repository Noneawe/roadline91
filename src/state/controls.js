// SPDX-License-Identifier: AGPL-3.0-or-later
// Controls screen: every driving action with its key and pad button. Confirm on a row waits for
// the next key or pad button and assigns it (Escape cancels); a binding taken from another action
// is swapped. Saved with the settings.

import { CONFIG } from '../config.js';
import { fillRect } from '../gfx/draw2d.js';
import { drawText, CELL } from '../gfx/font.js';
import { BINDABLE, DEFAULT_KEYS, DEFAULT_PAD, bind, keyLabel, padLabel } from '../engine/input.js';
import { createMenu } from './menu.js';

const W = CONFIG.render.width, H = CONFIG.render.height;

/**
 * Fresh copies of the default bindings.
 * @returns {{keys: Object<string, string[]>, pad: Object<string, number[]>}}
 */
export function defaultBindings() {
  const keys = {}, pad = {};
  for (const action in DEFAULT_KEYS) {
    keys[action] = DEFAULT_KEYS[action].slice();
    pad[action] = DEFAULT_PAD[action].slice();
  }
  return { keys, pad };
}

/**
 * @param {{settings: Object, saveSettings: () => void, input: Object, go: (name: string) => void}} app
 * @param {() => void} [onBack] leaves the screen (default: back to the title)
 * @returns {Object} scene (also used as a panel over the pause menu)
 */
export function createControls(app, onBack = () => app.go('title')) {
  const C = CONFIG.controls, M = CONFIG.menu, set = app.settings;
  let waiting = null; // label of the action being remapped

  function apply() {
    app.input.setBindings(set.keys, set.pad);
    app.saveSettings();
  }

  function remap(action, label) {
    waiting = label;
    app.input.capture((binding) => {
      waiting = null;
      if (!binding) return;
      if (binding.key) bind(set.keys, action, binding.key);
      else bind(set.pad, action, binding.button);
      apply();
    });
  }

  const menu = createMenu([
    ...BINDABLE.map(([action, label]) => ({
      label,
      value: () => `${set.keys[action].map(keyLabel).join('/').padEnd(C.keyWidth)} ${set.pad[action].map(padLabel).join('/')}`,
      activate: () => remap(action, label),
    })),
    {
      label: 'RESET DEFAULTS',
      activate() {
        Object.assign(set, defaultBindings());
        apply();
      },
    },
    { label: 'BACK', activate: () => onBack() },
  ], { x: C.menuX, y: C.menuY, valueX: C.valueX });

  return {
    sound: { music: 'menu' },
    update(dt, input) {
      if (waiting) return;
      if (input.pressed.back) onBack();
      else menu.update(input);
    },
    // The overlay covers the whole screen.
    render() {},
    drawOverlay(buf) {
      fillRect(buf, 0, 0, W, H, CONFIG.cockpit.frameIndex);
      drawText(buf, C.menuX, C.titleY, 'CONTROLS', M.selectedIndex);
      drawText(buf, C.valueX, C.titleY, 'KEY', M.textIndex);
      drawText(buf, C.valueX + (C.keyWidth + 1) * CELL, C.titleY, 'PAD', M.textIndex);
      menu.draw(buf);
      const hint = waiting ? `${waiting}: PRESS A KEY OR BUTTON, ESC CANCELS` : 'ENTER: CHANGE  MENU KEYS ARE FIXED';
      drawText(buf, (W - hint.length * CELL) >> 1, H - CELL - 4, hint, waiting ? M.selectedIndex : M.textIndex);
    },
  };
}
