// SPDX-License-Identifier: AGPL-3.0-or-later
// Cockpit drawn into the CPU overlay: windshield frame, hood, dashboard, tachometer and
// speedometer with needles, gear indicator. The static art is drawn once and copied every frame.

import { CONFIG } from '../config.js';
import { fillRect, fillEllipse, drawLine } from '../gfx/draw2d.js';
import { drawText, drawChar, drawNumber } from '../gfx/font.js';
import { paletteIndex } from '../gfx/palette.js';

const W = CONFIG.render.width, H = CONFIG.render.height;
const DEG = Math.PI / 180;
// Buffer pixels are taller than wide on the 4:3 screen; gauges are squashed to look round.
const PIXEL_ASPECT = W / H / CONFIG.render.displayAspect;
const CHAR_R = 82;

function gaugePoint(cx, fraction, scale, out) {
  const c = CONFIG.cockpit;
  const a = (c.sweepStartDeg + c.sweepDeg * fraction) * DEG;
  out[0] = cx + Math.cos(a) * c.gaugeRadius * scale;
  out[1] = c.gaugeY + (Math.sin(a) * c.gaugeRadius * scale) / PIXEL_ASPECT;
}

function drawGauge(buf, cx, ticks, redFrom, label, needleIndex) {
  const c = CONFIG.cockpit, a = [0, 0], b = [0, 0];
  fillEllipse(buf, cx, c.gaugeY, c.gaugeRadius + 2, (c.gaugeRadius + 2) / PIXEL_ASPECT, c.gaugeRimIndex);
  fillEllipse(buf, cx, c.gaugeY, c.gaugeRadius, c.gaugeRadius / PIXEL_ASPECT, c.gaugeFaceIndex);
  for (let i = 0; i <= ticks; i++) {
    gaugePoint(cx, i / ticks, 0.78, a);
    gaugePoint(cx, i / ticks, 0.96, b);
    drawLine(buf, a[0], a[1], b[0], b[1], i >= redFrom ? needleIndex : c.tickIndex);
  }
  drawText(buf, cx - label.length * 4, c.gaugeY + 8, label, c.textIndex);
}

function buildStatic(bodyRamp, night, units) {
  const c = CONFIG.cockpit, m = CONFIG.mirror;
  const buf = new Uint8Array(W * H);
  const needleIndex = paletteIndex(c.needleRamp, c.needleLevel);
  fillRect(buf, 0, 0, W, c.roofHeight, c.frameIndex);
  for (let y = 0; y < c.dashTop; y++) {
    const w = Math.round(c.pillarTop + ((c.pillarBottom - c.pillarTop) * y) / c.dashTop);
    fillRect(buf, 0, y, w, 1, c.frameIndex);
    fillRect(buf, W - w, y, w, 1, c.frameIndex);
  }
  fillRect(buf, W / 2 - 2, 0, 4, m.y, c.frameIndex);
  fillRect(buf, m.x - 2, m.y - 2, m.w + 4, m.h + 4, c.frameIndex);
  fillRect(buf, m.x, m.y, m.w, m.h, 0);
  for (let y = c.hoodTop; y < c.dashTop; y++) {
    const half = c.hoodHalfTop + (y - c.hoodTop) * c.hoodSlope;
    fillRect(buf, W / 2 - half, y, half * 2, 1, bodyRamp * 16 + (night ? c.hoodNightLevel : y === c.hoodTop ? c.hoodEdgeLevel : c.hoodLevel));
  }
  for (let y = c.binnacleTop; y < c.dashTop; y++) {
    const half = c.binnacleHalf + (y - c.binnacleTop);
    fillRect(buf, W / 2 - half, y, half * 2, 1, y === c.binnacleTop ? c.dashEdgeIndex : c.dashIndex);
  }
  fillRect(buf, 0, c.dashTop, W, H - c.dashTop, c.dashIndex);
  fillRect(buf, 0, c.dashTop, W / 2 - c.binnacleHalf - (c.dashTop - c.binnacleTop), 1, c.dashEdgeIndex);
  fillRect(buf, W / 2 + c.binnacleHalf + (c.dashTop - c.binnacleTop), c.dashTop, W, 1, c.dashEdgeIndex);
  drawGauge(buf, c.tachX, c.tachTicks, Math.round((7000 / c.tachMax) * c.tachTicks), 'RPM', needleIndex);
  drawGauge(buf, c.speedoX, c.speedoTicks, c.speedoTicks + 1, units.label, needleIndex);
  fillRect(buf, c.gearX - 3, c.gearY - 3, 14, 13, c.gaugeFaceIndex);
  return buf;
}

/**
 * Radar detector: a LED blinking faster as the signal rises (steady at full signal) and a bar graph.
 * @param {Uint8Array} buf overlay buffer
 * @param {number} x left edge
 * @param {number} y top edge
 * @param {number} signal 0-1
 * @param {number} time seconds, drives the blinking
 */
export function drawDetector(buf, x, y, signal, time) {
  const d = CONFIG.detector, c = CONFIG.cockpit;
  fillRect(buf, x, y, 12 + d.bars * 5, 12, c.frameIndex);
  const blink = signal >= 1 || (signal > 0 && (time * (d.blinkBase + d.blinkGain * signal)) % 1 < 0.5);
  fillRect(buf, x + 2, y + 3, 6, 6, blink ? paletteIndex(d.ledRamp, d.ledLevel) : d.offIndex);
  for (let i = 0; i < d.bars; i++) {
    const h = 3 + Math.round(i * 1.5), on = signal * d.bars > i;
    fillRect(buf, x + 11 + i * 5, y + 10 - h, 3, h, on ? paletteIndex(d.ledRamp, d.ledLevel) : d.offIndex);
  }
}

/**
 * @param {number} bodyRamp paint ramp of the car (hood color)
 * @param {boolean} night darkens the hood
 * @param {{factor: number, label: string, gaugeMax: number}} units speed units (CONFIG.units entry)
 * @returns {Object} cockpit: update(car, dt), draw(buf, car), setCrack(rng), drawCrack(buf)
 */
export function createCockpit(bodyRamp, night, units = CONFIG.units.kmh) {
  const c = CONFIG.cockpit;
  const layer = buildStatic(bodyRamp, night, units);
  const needleIndex = paletteIndex(c.needleRamp, c.needleLevel);
  const tip = [0, 0];
  let rpm = 0, speed = 0;

  function needle(buf, cx, fraction) {
    gaugePoint(cx, Math.max(0, Math.min(1, fraction)), 0.85, tip);
    drawLine(buf, cx, c.gaugeY, tip[0], tip[1], needleIndex);
    fillRect(buf, cx - 1, c.gaugeY - 1, 3, 3, c.tickIndex);
  }

  const crack = new Int16Array(CONFIG.crash.crackLines * 8);
  let cracked = false;

  return {
    /**
     * Breaks (seeded) or repairs the windshield.
     * @param {(() => number)|null} rng random source for the crack pattern; null repairs
     */
    setCrack(rng) {
      cracked = rng !== null;
      if (!cracked) return;
      const cx = W / 2 + (rng() - 0.5) * 80, cy = 40 + rng() * 50;
      for (let i = 0; i < crack.length; i += 8) {
        // Each crack is two segments: from the impact point outwards, then a kink.
        const a = (i / crack.length) * Math.PI * 2 + rng(), r1 = 15 + rng() * 40, r2 = r1 + 20 + rng() * 70;
        const mx = cx + Math.cos(a) * r1, my = cy + (Math.sin(a) * r1) / PIXEL_ASPECT;
        const bend = a + (rng() - 0.5);
        crack.set([cx, cy, mx, my, mx, my, cx + Math.cos(bend) * r2, cy + (Math.sin(bend) * r2) / PIXEL_ASPECT], i);
      }
    },
    /**
     * Cracked windshield over the 3D view; call before `draw` so the dashboard stays on top.
     * @param {Uint8Array} buf overlay buffer
     */
    drawCrack(buf) {
      if (!cracked) return;
      for (let i = 0; i < crack.length; i += 4) drawLine(buf, crack[i], crack[i + 1], crack[i + 2], crack[i + 3], CONFIG.crash.crackIndex);
    },
    // Displayed values follow the car smoothly, so needles do not jump on gear changes.
    update(car, dt) {
      const k = Math.min(1, c.needleRate * dt);
      rpm += (car.rpm - rpm) * k;
      speed += (Math.abs(car.vLong) * units.factor - speed) * k;
    },
    draw(buf, car) {
      // The static art goes over whatever is already drawn (cracks), keeping transparent pixels.
      for (let i = 0; i < layer.length; i++) if (layer[i]) buf[i] = layer[i];
      // Nothing drawn on the windshield (cracks, rain) covers the mirror.
      fillRect(buf, CONFIG.mirror.x, CONFIG.mirror.y, CONFIG.mirror.w, CONFIG.mirror.h, 0);
      needle(buf, c.tachX, rpm / c.tachMax);
      needle(buf, c.speedoX, speed / units.gaugeMax);
      drawChar(buf, c.gearX, c.gearY, car.gear < 0 ? CHAR_R : 48 + car.gear, c.tickIndex);
      drawNumber(buf, c.speedX, c.speedY, speed, 3, c.tickIndex);
    },
  };
}
