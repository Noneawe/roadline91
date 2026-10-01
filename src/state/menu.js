// SPDX-License-Identifier: AGPL-3.0-or-later
// Menu list shared by the title, setup, results and records screens: up/down to move, left/right
// to change a value, confirm to activate; a tap or click on a row selects it (on an option row the
// left/right half steps the value). Drawn into the overlay.

import { CONFIG } from '../config.js';
import { drawText, CELL } from '../gfx/font.js';

/**
 * @typedef {Object} MenuItem
 * @property {string} label
 * @property {() => string} [value] current value shown after the label
 * @property {(dir: number) => void} [change] steps the value by -1 / +1
 * @property {() => void} [activate] runs on confirm
 */

/**
 * @param {MenuItem[]} items
 * @param {{x: number, y: number, valueX?: number}} layout overlay pixels
 * @returns {{items: MenuItem[], selected: number, update: (input: Object) => void, draw: (buf: Uint8Array) => void}}
 */
export function createMenu(items, layout) {
  const m = CONFIG.menu;
  const menu = {
    items, selected: 0,
    update(input) {
      const p = input.pressed;
      if (p.up) menu.selected = (menu.selected + items.length - 1) % items.length;
      if (p.down) menu.selected = (menu.selected + 1) % items.length;
      let item = items[menu.selected];
      if ((p.left || p.right) && item.change) item.change(p.right ? 1 : -1);
      if (p.confirm) {
        if (item.activate) item.activate();
        else if (item.change) item.change(1);
      }
      if (!input.tap || !input.tap.on) return;
      const row = Math.floor((input.tap.y - layout.y + m.row / 4) / m.row);
      if (row < 0 || row >= items.length || input.tap.x < layout.x - m.hitMargin) return;
      menu.selected = row;
      item = items[row];
      if (item.change) item.change(input.tap.x < (layout.valueX || layout.x) + m.valueTapSplit ? -1 : 1);
      else if (item.activate) item.activate();
    },
    draw(buf) {
      for (let i = 0; i < items.length; i++) {
        const y = layout.y + i * m.row, on = i === menu.selected, item = items[i];
        const index = on ? m.selectedIndex : m.textIndex;
        if (on) drawText(buf, layout.x - CELL - 2, y, '>', index);
        drawText(buf, layout.x, y, item.label, index);
        if (item.value) {
          const x = layout.valueX || layout.x + (item.label.length + 1) * CELL;
          drawText(buf, x, y, item.change ? `< ${item.value()} >` : item.value(), index);
        }
      }
    },
  };
  return menu;
}

/**
 * Volume rows (overall, music, effects) shared by the title and pause menus: 0..volumeSteps
 * shown as a bar; a change is applied at once and saved.
 * @param {{settings: Object, applyVolumes: () => void, saveSettings: () => void}} app
 * @returns {MenuItem[]}
 */
export function volumeItems(app) {
  const steps = CONFIG.menu.volumeSteps;
  const volume = (label, key) => ({
    label,
    value: () => '#'.repeat(app.settings[key]).padEnd(steps, '.'),
    change(dir) {
      app.settings[key] = Math.max(0, Math.min(steps, app.settings[key] + dir));
      app.applyVolumes();
      app.saveSettings();
    },
  });
  return [volume('VOLUME', 'volMaster'), volume('MUSIC', 'volMusic'), volume('EFFECTS', 'volEffects')];
}

/**
 * Cycles through a list: the element `dir` steps from `current`.
 * @template T
 * @param {T[]} list
 * @param {T} current
 * @param {number} dir
 * @returns {T}
 */
export function step(list, current, dir) {
  const i = Math.max(0, list.indexOf(current));
  return list[(i + dir + list.length) % list.length];
}
