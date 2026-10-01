// SPDX-License-Identifier: AGPL-3.0-or-later
// Bitmap font: 5x7 glyphs in an 8x8 cell, defined as data. Uppercase, digits and basic punctuation.

import { CONFIG } from '../config.js';

export const CELL = 8;
const ROWS = 7;
const COLS = 5;

export const GLYPH_ART = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# ##..# #.#.# #..## #...# #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# ##.## #...#',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  0: '.###. #...# #..## #.#.# ##..# #...# .###.',
  1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  2: '.###. #...# ....# ...#. ..#.. .#... #####',
  3: '####. ....# ....# .###. ....# ....# ####.',
  4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  5: '##### #.... ####. ....# ....# #...# .###.',
  6: '.###. #.... #.... ####. #...# #...# .###.',
  7: '##### ....# ...#. ..#.. .#... .#... .#...',
  8: '.###. #...# #...# .###. #...# #...# .###.',
  9: '.###. #...# #...# .#### ....# ....# .###.',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  ',': '..... ..... ..... ..... .##.. ..#.. .#...',
  ':': '..... .##.. .##.. ..... .##.. .##.. .....',
  '-': '..... ..... ..... ##### ..... ..... .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  '/': '....# ....# ...#. ..#.. .#... #.... #....',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  '%': '##..# ##..# ...#. ..#.. .#... #..## #..##',
  '=': '..... ..... ##### ..... ##### ..... .....',
  "'": '..#.. ..#.. ..... ..... ..... ..... .....',
  _: '..... ..... ..... ..... ..... ..... #####',
  '*': '..... #.#.# .###. ##### .###. #.#.# .....',
  '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
  '>': '.#... ..#.. ...#. ....# ...#. ..#.. .#...',
  '^': '..#.. .#.#. #...# ..... ..... ..... .....',
  '_': '..... ..... ..... ..... ..... ..... #####',
  '#': '..... ##### ##### ##### ##### ##### .....', // solid block (volume bars)
};

// Row bitmasks indexed by ASCII code; undefined characters stay blank.
const GLYPHS = new Uint8Array(128 * ROWS);
for (const [ch, art] of Object.entries(GLYPH_ART)) {
  art.split(' ').forEach((row, r) => {
    let bits = 0;
    for (let c = 0; c < COLS; c++) if (row[c] === '#') bits |= 1 << (COLS - 1 - c);
    GLYPHS[ch.charCodeAt(0) * ROWS + r] = bits;
  });
}

/**
 * Draws one character into the overlay buffer, clipped to its bounds.
 * @param {Uint8Array} buf overlay buffer (CONFIG.render.width x height)
 * @param {number} x left edge in pixels
 * @param {number} y top edge in pixels
 * @param {number} code ASCII code; lowercase maps to uppercase, unknown codes are blank
 * @param {number} index palette index
 */
export function drawChar(buf, x, y, code, index) {
  const w = CONFIG.render.width, h = CONFIG.render.height;
  if (code >= 97 && code <= 122) code -= 32;
  if (code > 127) return;
  for (let r = 0; r < ROWS; r++) {
    const bits = GLYPHS[code * ROWS + r], py = y + r;
    if (!bits || py < 0 || py >= h) continue;
    for (let c = 0; c < COLS; c++) {
      const px = x + c;
      if (bits & (1 << (COLS - 1 - c)) && px >= 0 && px < w) buf[py * w + px] = index;
    }
  }
}

/**
 * Draws text into the overlay buffer, clipped to its bounds.
 * @param {Uint8Array} buf overlay buffer
 * @param {number} x left edge in pixels
 * @param {number} y top edge in pixels
 * @param {string} text
 * @param {number} index palette index
 */
export function drawText(buf, x, y, text, index) {
  for (let i = 0; i < text.length; i++) drawChar(buf, x + i * CELL, y, text.charCodeAt(i), index);
}

/**
 * Draws a non-negative integer right-aligned in a field of `digits` cells, without allocating.
 * @param {Uint8Array} buf overlay buffer
 * @param {number} x left edge of the field
 * @param {number} y top edge
 * @param {number} value
 * @param {number} digits field width in characters
 * @param {number} index palette index
 */
export function drawNumber(buf, x, y, value, digits, index) {
  let v = Math.max(0, Math.round(value));
  for (let i = digits - 1; i >= 0; i--) {
    drawChar(buf, x + i * CELL, y, 48 + (v % 10), index);
    v = Math.floor(v / 10);
    if (v === 0) break;
  }
}

/**
 * Draws text with every font pixel enlarged to a `scale` x `scale` block (titles).
 * @param {Uint8Array} buf overlay buffer
 * @param {number} x left edge in pixels
 * @param {number} y top edge in pixels
 * @param {string} text
 * @param {number} scale
 * @param {number} index palette index
 */
export function drawTextScaled(buf, x, y, text, scale, index) {
  const w = CONFIG.render.width, h = CONFIG.render.height;
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 97 && code <= 122) code -= 32;
    if (code > 127) continue;
    for (let r = 0; r < ROWS; r++) {
      const bits = GLYPHS[code * ROWS + r];
      for (let c = 0; c < COLS; c++) {
        if (!(bits & (1 << (COLS - 1 - c)))) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = x + (i * CELL + c) * scale + dx, py = y + r * scale + dy;
            if (px >= 0 && px < w && py >= 0 && py < h) buf[py * w + px] = index;
          }
        }
      }
    }
  }
}
