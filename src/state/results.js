// SPDX-License-Identifier: AGPL-3.0-or-later
// Results screen after the finish (or the last police stop): total time, splits against the
// rival, name entry when the time makes the record table, then race again or back to the menu.

import { CONFIG } from '../config.js';
import { fillRect } from '../gfx/draw2d.js';
import { drawText, drawChar, CELL } from '../gfx/font.js';
import { formatTime } from '../cockpit/station.js';
import { recordRank, insertRecord } from '../storage.js';
import { createMenu } from './menu.js';
import { TRACK } from '../data/track-main.js';

const W = CONFIG.render.width;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';

/**
 * Lines of the result summary.
 * @param {Object} result from the race scene (see createRaceScene onFinish)
 * @returns {string[]}
 */
export function resultLines(result) {
  const lines = [
    result.busted ? 'BUSTED - RACE OVER' : result.win ? 'YOU WIN THE RACE' : 'THE RIVAL WINS',
    `${result.car.toUpperCase()}  ${result.weather.toUpperCase()}  ${String(result.time || '').toUpperCase()}`,
    '',
    'SECTION     YOU     RIVAL',
  ];
  result.splits.forEach((split, i) => {
    if (split === null) return;
    const rival = result.rivalTimes[i];
    lines.push(`${String(i + 1).padStart(4)}    ${formatTime(split).padStart(7)}  ${rival === null ? '    ---' : formatTime(rival).padStart(7)}`);
  });
  lines.push('', `TOTAL  ${formatTime(result.total)}`, `POLICE STOPS ${result.stops}`);
  return lines;
}

/**
 * @param {{records: Object, saveRecords: () => void, settings: Object, go: (name: string) => void}} app
 * @param {Object} result
 * @returns {Object} scene
 */
export function createResults(app, result) {
  const R = CONFIG.results, M = CONFIG.menu, size = CONFIG.records.size;
  const table = app.records[TRACK.name] || (app.records[TRACK.name] = []);
  // Only full races count: started at the first section and finished without being busted.
  const eligible = !result.busted && result.firstSection === 0;
  let entering = eligible && recordRank(table, result.total, size) >= 0;
  const name = (app.settings.lastName || 'AAA').split('').map((c) => Math.max(0, LETTERS.indexOf(c)));
  let cursor = 0, rank = -1;
  const lines = resultLines(result);
  const menu = createMenu([
    { label: 'RACE AGAIN', activate: () => app.go('race') },
    { label: 'MAIN MENU', activate: () => app.go('title') },
  ], { x: R.menuX, y: R.menuY });

  function saveName() {
    const text = name.map((i) => LETTERS[i]).join('');
    rank = insertRecord(table, { name: text, time: result.total, car: result.car }, size);
    app.settings.lastName = text;
    app.saveSettings();
    app.saveRecords();
    entering = false;
  }

  function updateName(input) {
    const p = input.pressed;
    if (p.up) name[cursor] = (name[cursor] + 1) % LETTERS.length;
    if (p.down) name[cursor] = (name[cursor] + LETTERS.length - 1) % LETTERS.length;
    if (p.left) cursor = Math.max(0, cursor - 1);
    if (p.right) cursor = Math.min(name.length - 1, cursor + 1);
    if (input.tap.on) {
      // Tap above a letter: next letter, below: previous; on DONE: save.
      const slot = Math.floor((input.tap.x - R.nameX) / R.slot);
      if (slot >= 0 && slot < name.length) {
        cursor = slot;
        name[slot] = (name[slot] + (input.tap.y < R.nameY + CELL / 2 ? 1 : LETTERS.length - 1)) % LETTERS.length;
      } else if (input.tap.x >= R.doneX) saveName();
    }
    if (p.confirm) {
      if (cursor < name.length - 1) cursor++;
      else saveName();
    }
  }

  return {
    sound: { music: 'results' },
    update(dt, input) {
      if (entering) updateName(input);
      else menu.update(input);
    },
    // The overlay covers the whole screen; there is no 3D view.
    render() {},
    drawOverlay(buf) {
      fillRect(buf, 0, 0, W, CONFIG.render.height, CONFIG.cockpit.frameIndex);
      lines.forEach((line, i) => drawText(buf, R.x, R.y + i * M.row, line, i === 0 ? M.selectedIndex : M.textIndex));
      if (entering) {
        drawText(buf, R.x, R.nameY, 'NEW RECORD! NAME:', M.selectedIndex);
        for (let i = 0; i < name.length; i++) {
          const x = R.nameX + i * R.slot;
          drawChar(buf, x, R.nameY, LETTERS.charCodeAt(name[i]), i === cursor ? M.selectedIndex : M.textIndex);
          if (i === cursor) drawChar(buf, x, R.nameY + CELL, 95, M.selectedIndex);
        }
        drawText(buf, R.doneX, R.nameY, 'DONE', M.textIndex);
        return;
      }
      if (rank >= 0) drawText(buf, R.x, R.nameY, `RECORD TABLE PLACE ${rank + 1}`, M.selectedIndex);
      else if (!eligible) drawText(buf, R.x, R.nameY, result.busted ? 'NO RECORD WHEN BUSTED' : 'RECORDS NEED THE FULL ROUTE', M.textIndex);
      menu.draw(buf);
    },
  };
}
