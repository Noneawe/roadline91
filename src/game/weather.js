// SPDX-License-Identifier: AGPL-3.0-or-later
// Rain in the CPU overlay: falling streaks over the view, drops collecting on the windshield and
// two wipers that sweep them away. Weather effects on the world (palette, distance, grip) live in
// world.js; this module only animates and draws the 2D layer. No DOM or GL.

import { CONFIG } from '../config.js';
import { createRng } from '../engine/rng.js';
import { fillRect, drawLine } from '../gfx/draw2d.js';
import { hypot2 } from '../engine/math3d.js';

const W = CONFIG.render.width, H = CONFIG.render.height;
const DEG = Math.PI / 180;
const PIXEL_ASPECT = W / H / CONFIG.render.displayAspect;

/**
 * Wiper angle (rad from resting flat to the left) at a time.
 * @param {number} t seconds
 * @returns {number}
 */
export function wiperAngle(t) {
  const r = CONFIG.weather.rainOverlay;
  return ((1 - Math.cos((2 * Math.PI * t) / r.wiperPeriod)) / 2) * r.wiperSweepDeg * DEG;
}

// Windshield area where drops may sit: below the roof, above the hood, inside the pillars, not
// on the mirror.
function onGlass(x, y) {
  const c = CONFIG.cockpit, m = CONFIG.mirror;
  if (y < c.roofHeight + 1 || y >= c.hoodTop - 1) return false;
  const pillar = c.pillarTop + ((c.pillarBottom - c.pillarTop) * y) / c.dashTop;
  if (x < pillar + 1 || x > W - pillar - 2) return false;
  return !(x >= m.x - 3 && x < m.x + m.w + 3 && y < m.y + m.h + 3);
}

/**
 * @param {boolean} raining
 * @param {number} seed
 * @returns {{raining: boolean, drops: Int16Array, dropCount: number, update: (dt: number, speed: number) => void,
 *   draw: (buf: Uint8Array, cockpit: boolean) => void}}
 */
export function createRain(raining, seed) {
  const r = CONFIG.weather.rainOverlay, rng = createRng(seed);
  const streaks = new Float32Array(r.streaks * 2);
  for (let i = 0; i < streaks.length; i += 2) {
    streaks[i] = rng() * W;
    streaks[i + 1] = rng() * H;
  }
  const drops = new Int16Array(r.drops * 2), ages = new Float32Array(r.drops);
  let dropCount = 0, time = 0, spawn = 0, angle = 0;

  function remove(i) {
    dropCount--;
    drops[i * 2] = drops[dropCount * 2];
    drops[i * 2 + 1] = drops[dropCount * 2 + 1];
    ages[i] = ages[dropCount];
  }

  // Removes the drops between the previous and the current wiper angle, and old drops (the
  // airflow blows them off where the wipers do not reach).
  function wipe(from, to, dt) {
    const lo = Math.min(from, to), hi = Math.max(from, to);
    for (let i = 0; i < dropCount;) {
      const x = drops[i * 2], y = drops[i * 2 + 1];
      let hit = false;
      for (let k = 0; k < r.wiperPivots.length; k++) {
        const px = r.wiperPivots[k][0], py = r.wiperPivots[k][1];
        const dx = px - x, dy = (py - y) * PIXEL_ASPECT, a = Math.atan2(dy, dx);
        if (hypot2(dx, dy) <= r.wiperLength && a >= lo - 0.05 && a <= hi + 0.05) hit = true;
      }
      ages[i] += dt;
      if (hit || ages[i] > r.dropLife) remove(i);
      else i++;
    }
  }

  const rain = {
    raining, drops,
    get dropCount() { return dropCount; },
    /**
     * @param {number} dt seconds
     * @param {number} speed car speed in m/s (more drops hit the glass when driving)
     */
    update(dt, speed) {
      if (!raining) return;
      time += dt;
      for (let i = 0; i < streaks.length; i += 2) {
        streaks[i + 1] += r.streakSpeed * dt;
        streaks[i] += r.streakSpeed * r.streakSlant * dt;
        if (streaks[i + 1] > H) {
          streaks[i + 1] -= H + r.streakLength;
          streaks[i] = rng() * W;
        }
      }
      spawn += (r.dropRate + r.dropRateSpeed * Math.abs(speed)) * dt;
      while (spawn >= 1) {
        spawn--;
        const x = Math.floor(rng() * W), y = Math.floor(rng() * H);
        if (dropCount < r.drops && onGlass(x, y)) {
          drops[dropCount * 2] = x;
          drops[dropCount * 2 + 1] = y;
          ages[dropCount] = 0;
          dropCount++;
        }
      }
      const next = wiperAngle(time);
      wipe(angle, next, dt);
      angle = next;
    },
    /**
     * @param {Uint8Array} buf overlay buffer
     * @param {boolean} cockpit inside view: drops and wipers on the windshield too
     */
    draw(buf, cockpit) {
      if (!raining) return;
      for (let i = 0; i < streaks.length; i += 2) {
        const x = streaks[i] % W, y = streaks[i + 1];
        drawLine(buf, x, y, x + r.streakLength * r.streakSlant, y + r.streakLength, r.streakIndex);
      }
      if (!cockpit) return;
      for (let i = 0; i < dropCount; i++) {
        fillRect(buf, drops[i * 2], drops[i * 2 + 1], 2, 2, r.dropIndex);
        fillRect(buf, drops[i * 2], drops[i * 2 + 1], 1, 1, r.dropHighlight);
      }
      for (let k = 0; k < r.wiperPivots.length; k++) {
        const px = r.wiperPivots[k][0], py = r.wiperPivots[k][1];
        const ex = px - Math.cos(angle) * r.wiperLength, ey = py - (Math.sin(angle) * r.wiperLength) / PIXEL_ASPECT;
        drawLine(buf, px, py, ex, ey, r.wiperIndex);
        drawLine(buf, px + 1, py, ex + 1, ey, r.wiperIndex);
      }
    },
  };
  return rain;
}
