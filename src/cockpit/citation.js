// SPDX-License-Identifier: AGPL-3.0-or-later
// Police citation drawn like a 1990s dot-matrix printout: continuous tractor-feed paper with
// sprocket holes and alternating bars, fed upwards line by line while it "prints".

import { CONFIG } from '../config.js';
import { fillRect } from '../gfx/draw2d.js';
import { drawText, CELL } from '../gfx/font.js';
import { paletteIndex } from '../gfx/palette.js';

const TIMES = { day: '14:32', sunset: '19:48', night: '23:15' };

function pad(value, width) {
  return String(Math.round(value)).padStart(width, ' ');
}

/**
 * Text of a citation (built once per stop, not per frame). Agency and names are fictional.
 * @param {{number: number, time: string, kmh: number, limit: number, penalty: number,
 *   stop: number, maxStops: number, final: boolean, vehicle: string, units: {factor: number, label: string}}} c
 *   speeds in km/h, printed in the chosen units
 * @returns {string[]} lines of at most CONFIG.citation.columns characters
 */
export function buildCitation(c) {
  return [
    '   COUNTY SHERIFF',
    ' TRAFFIC CITATION',
    '---------------------',
    `NO. 91-${String(c.number).padStart(5, '0')}`,
    `DATE 07/14/91 ${TIMES[c.time] || TIMES.day}`,
    `VEHICLE  ${c.vehicle.toUpperCase()}`,
    `SPEEDING  (${c.units.label})`,
    `SPEED ${pad((c.kmh * c.units.factor) / 3.6, 3)} LIMIT ${pad((c.limit * c.units.factor) / 3.6, 3)}`,
    `PENALTY    +${pad(c.penalty, 2)} SEC`,
    `STOP ${c.stop} OF ${c.maxStops}`,
    c.final ? '*** BUSTED ***' : '',
    c.final ? 'RACE IS OVER' : 'DRIVE SAFELY',
    '',
    'X____________________',
    '  SIGNATURE',
  ];
}

/**
 * @param {Uint8Array} buf overlay buffer
 * @param {string[]} lines from buildCitation
 * @param {number} age seconds since the printout started
 * @param {string} prompt shown on the paper under the text once printing has finished
 */
export function drawCitation(buf, lines, age, prompt) {
  const c = CONFIG.citation, height = CONFIG.render.height;
  const width = c.columns * CELL + c.margin * 2 + c.feed * 2;
  const x = (CONFIG.render.width - width) >> 1;
  const paperHeight = (lines.length + 2) * c.lineHeight;
  // The paper comes out of the bottom of the screen as the lines are printed.
  const printed = Math.min(lines.length, Math.floor(age / c.lineTime));
  const top = Math.max(c.top, height - (printed + 2) * c.lineHeight - c.top);
  const paper = paletteIndex(c.paperRamp, c.paperLevel), bar = paletteIndex(c.barRamp, c.barLevel);
  const ink = paletteIndex(c.inkRamp, c.inkLevel), hole = paletteIndex(c.holeRamp, c.holeLevel);
  fillRect(buf, x, top, width, Math.min(paperHeight, height - top), paper);
  const bottom = Math.min(top + paperHeight, height);
  for (let y = top + c.lineHeight; y < bottom; y += c.lineHeight * 2) {
    fillRect(buf, x + c.feed, y, width - c.feed * 2, Math.min(c.lineHeight, bottom - y), bar);
  }
  // Tractor-feed strips: sprocket holes and the perforation along them.
  for (let y = top + 3; y < Math.min(top + paperHeight, height); y += c.holeSpacing) {
    fillRect(buf, x + 3, y, 4, 4, hole);
    fillRect(buf, x + width - 7, y, 4, 4, hole);
  }
  for (let y = top; y < Math.min(top + paperHeight, height); y += 2) {
    buf[y * CONFIG.render.width + x + c.feed - 1] = hole;
    buf[y * CONFIG.render.width + x + width - c.feed] = hole;
  }
  for (let i = 0; i < printed; i++) {
    const y = top + c.lineHeight + i * c.lineHeight + 1;
    if (y < height) drawText(buf, x + c.feed + c.margin, y, lines[i], ink);
  }
  if (printed === lines.length) {
    const y = top + c.lineHeight * (lines.length + 1) + 1;
    if (y < height) drawText(buf, x + c.feed + c.margin, y, prompt, hole);
  }
  // Tear line at the top edge.
  for (let px = x; px < x + width; px += 3) fillRect(buf, px, top, 1, 1, hole);
}
