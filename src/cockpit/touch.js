// SPDX-License-Identifier: AGPL-3.0-or-later
// On-screen touch buttons drawn into the overlay: outlined boxes with a centered label.

import { CONFIG } from '../config.js';
import { fillRect } from '../gfx/draw2d.js';
import { drawText, CELL } from '../gfx/font.js';

/**
 * @param {Uint8Array} buf overlay buffer
 * @param {{x: number, y: number, w: number, h: number, label: string}[]} buttons
 */
export function drawTouchButtons(buf, buttons) {
  const index = CONFIG.touch.index;
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    fillRect(buf, b.x, b.y, b.w, 1, index);
    fillRect(buf, b.x, b.y + b.h - 1, b.w, 1, index);
    fillRect(buf, b.x, b.y, 1, b.h, index);
    fillRect(buf, b.x + b.w - 1, b.y, 1, b.h, index);
    drawText(buf, b.x + ((b.w - b.label.length * CELL) >> 1), b.y + ((b.h - CELL) >> 1), b.label, index);
  }
}
