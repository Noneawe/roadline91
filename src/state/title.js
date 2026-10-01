// SPDX-License-Identifier: AGPL-3.0-or-later
// Title screen: the logo in color-cycled sunset colors over a turning car, the main menu and the
// record table.

import { CONFIG } from '../config.js';
import { fillRect } from '../gfx/draw2d.js';
import { drawText, drawTextScaled, CELL } from '../gfx/font.js';
import { paletteIndex } from '../gfx/palette.js';
import { createShowroom } from './showroom.js';
import { createMenu, volumeItems } from './menu.js';
import { formatTime } from '../cockpit/station.js';
import { TRACK } from '../data/track-main.js';

const W = CONFIG.render.width, H = CONFIG.render.height;
const LOGO = "ROADLINE '91";

// Logo and stripes drawn once; every row uses the next level of the cycled ramp, so the palette
// rotation makes the colors run through them.
function buildLogo() {
  const T = CONFIG.title, buf = new Uint8Array(W * H);
  const x = (W - LOGO.length * CELL * T.logoScale) >> 1;
  drawTextScaled(buf, x, T.logoY, LOGO, T.logoScale, 1);
  for (let y = 0; y < H; y++) {
    const level = paletteIndex(CONFIG.showroom.cycleRamp, (y >> 1) & 15);
    for (let px = 0; px < W; px++) if (buf[y * W + px]) buf[y * W + px] = level;
  }
  for (let i = 0; i < T.stripes; i++) {
    const y = T.stripeY + i * T.stripeGap;
    fillRect(buf, x, y, LOGO.length * CELL * T.logoScale, T.stripeHeight, paletteIndex(CONFIG.showroom.cycleRamp, (i * 3) & 15));
  }
  return buf;
}

/**
 * @param {{renderer: Object, settings: Object, records: Object, go: (name: string) => void,
 *   toggleFullscreen: () => void}} app
 * @returns {Object} scene
 */
export function createTitle(app) {
  const T = CONFIG.title, M = CONFIG.menu;
  const showroom = createShowroom(app.renderer);
  const logo = buildLogo();
  let time = 0, showRecords = false;
  const menu = createMenu([
    { label: 'START RACE', activate: () => app.go('setup') },
    { label: 'RECORDS', activate: () => { showRecords = true; } },
    ...volumeItems(app),
    { label: 'CONTROLS', activate: () => app.go('controls') },
    { label: 'FULLSCREEN', activate: () => app.toggleFullscreen() },
  ], { x: T.menuX, y: T.menuY, valueX: T.valueX });

  function drawRecords(buf) {
    const table = app.records[TRACK.name] || [];
    fillRect(buf, T.recordsX - 6, T.recordsY - 6, W - 2 * (T.recordsX - 6), T.recordsH, CONFIG.cockpit.frameIndex);
    drawText(buf, T.recordsX, T.recordsY, `RECORDS  ${TRACK.name.toUpperCase()}`, M.selectedIndex);
    if (!table.length) drawText(buf, T.recordsX, T.recordsY + 2 * M.row, 'NO RECORDS YET', M.textIndex);
    table.forEach((r, i) => {
      const line = `${String(i + 1).padStart(2)} ${r.name} ${formatTime(r.time)} ${r.car.toUpperCase()}`;
      drawText(buf, T.recordsX, T.recordsY + (i + 2) * M.row, line, M.textIndex);
    });
    drawText(buf, T.recordsX, T.recordsY + T.recordsH - 2 * M.row, 'ENTER: BACK', M.textIndex);
  }

  return {
    sound: { music: 'menu' },
    update(dt, input) {
      time += dt;
      if (showRecords) {
        if (input.pressed.confirm || input.pressed.back || input.tap.on) showRecords = false;
        return;
      }
      menu.update(input);
    },
    render() {
      showroom.cycle(time);
      showroom.draw(app.settings.car, time * T.spin, T.lift);
    },
    drawOverlay(buf) {
      for (let i = 0; i < logo.length; i++) if (logo[i]) buf[i] = logo[i];
      if (showRecords) {
        drawRecords(buf);
        return;
      }
      menu.draw(buf);
      drawText(buf, T.footerX, H - CELL - 2, T.footer, M.textIndex);
    },
  };
}
