// SPDX-License-Identifier: AGPL-3.0-or-later
// 2D primitives drawn on the CPU into the overlay buffer (palette indices, 0 = transparent).

import { CONFIG } from '../config.js';

/**
 * @param {Uint8Array} buf overlay buffer
 */
export function clearOverlay(buf) {
  buf.fill(0);
}

/**
 * Filled rectangle clipped to the buffer.
 * @param {Uint8Array} buf overlay buffer
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} index palette index
 */
export function fillRect(buf, x, y, w, h, index) {
  const bw = CONFIG.render.width, bh = CONFIG.render.height;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const x0 = Math.max(x, 0), x1 = Math.min(x + w, bw);
  const y1 = Math.min(y + h, bh);
  if (x1 <= x0) return;
  for (let py = Math.max(y, 0); py < y1; py++) buf.fill(index, py * bw + x0, py * bw + x1);
}

/**
 * Line between two points (Bresenham), clipped per pixel.
 * @param {Uint8Array} buf overlay buffer
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} index palette index
 */
export function drawLine(buf, x0, y0, x1, y1, index) {
  const bw = CONFIG.render.width, bh = CONFIG.render.height;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x0 >= 0 && x0 < bw && y0 >= 0 && y0 < bh) buf[y0 * bw + x0] = index;
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/**
 * Filled axis-aligned ellipse.
 * @param {Uint8Array} buf overlay buffer
 * @param {number} cx center
 * @param {number} cy
 * @param {number} rx horizontal radius in pixels
 * @param {number} ry vertical radius in pixels
 * @param {number} index palette index
 */
export function fillEllipse(buf, cx, cy, rx, ry, index) {
  for (let dy = -Math.floor(ry); dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
    fillRect(buf, cx - half, cy + dy, half * 2 + 1, 1, index);
  }
}
