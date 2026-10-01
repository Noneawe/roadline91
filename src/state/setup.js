// SPDX-License-Identifier: AGPL-3.0-or-later
// Race setup: car choice (turning car, description and rating bars) and race options: time of
// day, weather, gearbox, difficulty, units, resolution. Choices are saved as settings.

import { CONFIG } from '../config.js';
import { fillRect } from '../gfx/draw2d.js';
import { drawText, CELL } from '../gfx/font.js';
import { paletteIndex } from '../gfx/palette.js';
import { CARS } from '../vehicle/cars.js';
import { createCar, stepCar } from '../vehicle/physics.js';
import { TIMES, WEATHERS } from '../world/world.js';
import { TRACK } from '../data/track-main.js';
import { createShowroom } from './showroom.js';
import { createMenu, step } from './menu.js';

const W = CONFIG.render.width;
const GEARBOXES = ['auto', 'manual'];
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const UNITS = ['kmh', 'mph'];
const SCALES = [1, 2];

const mean = (range) => (range[0] + range[1]) / 2;
const FLAT = (x, z, out) => { out.y = 0; out.grip = 1; out.rolling = 1; };

// Handling measured on a flat road: steady lateral acceleration with the wheel turned, and the
// largest slip angle in a left-right flick (smaller = more stable).
function handling(spec) {
  const R = CONFIG.setup.rating, dt = CONFIG.loop.step;
  const pad = { throttle: R.throttle, brake: 0, steer: R.steer, gearUp: false, gearDown: false };
  const skid = createCar(spec);
  skid.vLong = R.speed;
  skid.gear = R.gear;
  let lateral = 0;
  for (let t = 0; t < R.seconds; t += dt) {
    stepCar(skid, pad, dt, FLAT);
    lateral = Math.max(lateral, Math.abs(skid.vLong * skid.yawRate));
  }
  const flick = createCar(spec);
  flick.vLong = R.speed;
  flick.gear = R.gear;
  let slip = 0;
  for (let t = 0; t < R.seconds; t += dt) {
    pad.steer = t < R.seconds / 3 ? 1 : t < (2 * R.seconds) / 3 ? -1 : 0;
    stepCar(flick, pad, dt, FLAT);
    slip = Math.max(slip, Math.abs(Math.atan2(flick.vLat, flick.vLong)));
  }
  return [lateral, 1 / slip];
}

/**
 * Ratings 0-1 of every car relative to the others: top speed, acceleration (design values from
 * cars.js), cornering grip and stability (measured with the physics).
 * @returns {number[][]} per car [speed, accel, grip, stability]
 */
export function carRatings() {
  const raw = CARS.map((s) => [mean(s.expected.gearVmaxKmh[s.gears.length - 1]), 1 / mean(s.expected.zeroToHundredS), ...handling(s)]);
  return raw.map((r) => r.map((v, k) => {
    const all = raw.map((x) => x[k]), lo = Math.min(...all), hi = Math.max(...all);
    return CONFIG.setup.barFloor + (1 - CONFIG.setup.barFloor) * (hi > lo ? (v - lo) / (hi - lo) : 1);
  }));
}

/**
 * @param {{renderer: Object, settings: Object, saveSettings: () => void, go: (name: string) => void}} app
 * @returns {Object} scene
 */
export function createSetup(app) {
  const S = CONFIG.setup, M = CONFIG.menu, set = app.settings;
  const showroom = createShowroom(app.renderer);
  const ratings = carRatings();
  let time = 0;
  const option = (label, list, key, show = (v) => String(v).toUpperCase()) => ({
    label, value: () => show(set[key]),
    change(dir) {
      set[key] = step(list, set[key], dir);
      if (key === 'res') app.renderer.setScale(set.res);
      app.saveSettings();
    },
  });
  const menu = createMenu([
    { label: 'CAR', value: () => CARS[set.car].name.toUpperCase(), change(dir) { set.car = (set.car + dir + CARS.length) % CARS.length; app.saveSettings(); } },
    { label: 'TRACK', value: () => TRACK.name.toUpperCase() },
    option('TIME', TIMES, 'time'),
    option('WEATHER', WEATHERS, 'weather'),
    option('GEARBOX', GEARBOXES, 'gearbox'),
    option('DIFFICULTY', DIFFICULTIES, 'difficulty'),
    option('UNITS', UNITS, 'units', (v) => CONFIG.units[v].label),
    option('RESOLUTION', SCALES, 'res', (v) => `${CONFIG.render.width * v}X${CONFIG.render.height * v}`),
    { label: 'START RACE', activate: () => app.go('race') },
    { label: 'BACK', activate: () => app.go('title') },
  ], { x: S.menuX, y: S.menuY, valueX: S.valueX });

  function drawCarInfo(buf) {
    const spec = CARS[set.car], bars = ratings[set.car];
    // Dark boxes keep the text readable over the sky.
    const frame = CONFIG.cockpit.frameIndex;
    fillRect(buf, 0, 0, (spec.name.length + 1) * CELL, S.infoBoxH, frame);
    fillRect(buf, S.barX - 4, 0, S.barBoxW, S.barY + S.barLabels.length * M.row + 2, frame);
    fillRect(buf, 0, S.blurbY - 3, W, S.panelY - S.blurbY + 3, frame);
    drawText(buf, S.infoX, S.infoY, spec.name.toUpperCase(), M.selectedIndex);
    spec.blurb.forEach((line, i) => drawText(buf, S.infoX, S.blurbY + i * M.row, line, M.textIndex));
    S.barLabels.forEach((label, i) => {
      const y = S.barY + i * M.row;
      drawText(buf, S.barX, y, label, M.textIndex);
      const x = S.barX + S.barLabelWidth * CELL;
      fillRect(buf, x, y + 1, S.barWidth, CELL - 3, CONFIG.cockpit.frameIndex);
      fillRect(buf, x, y + 1, Math.round(S.barWidth * bars[i]), CELL - 3, paletteIndex(S.barRamp, S.barLevel));
    });
  }

  return {
    sound: { music: 'menu' },
    update(dt, input) {
      time += dt;
      if (input.pressed.back) {
        app.go('title');
        return;
      }
      menu.update(input);
    },
    render() {
      showroom.cycle(time);
      showroom.draw(set.car, time * CONFIG.title.spin, S.lift);
    },
    drawOverlay(buf) {
      fillRect(buf, 0, S.panelY, W, CONFIG.render.height - S.panelY, CONFIG.cockpit.frameIndex);
      drawCarInfo(buf);
      menu.draw(buf);
    },
  };
}
