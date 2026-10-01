// SPDX-License-Identifier: AGPL-3.0-or-later
// 256-color palette: 16 ramps x 16 brightness levels, generated on the CPU.
// Index = ramp * 16 + level. Index 0 is reserved (transparent in the overlay, black in the world).

import { CONFIG } from '../config.js';

export const RAMP_NAMES = [
  'gray', 'asphalt', 'roadLine', 'grass', 'forest', 'sand', 'rock', 'water',
  'sky', 'sunset', 'paint1', 'paint2', 'paint3', 'paint4', 'brick', 'lights',
];

/** Ramp name -> ramp number. `glass` is an alias used by models. */
export const RAMP = Object.fromEntries(RAMP_NAMES.map((name, i) => [name, i]));
RAMP.glass = RAMP.water;

const RAMP_COLORS = [
  [170, 170, 170], [96, 96, 104], [230, 220, 160], [70, 160, 60],
  [30, 100, 50], [210, 180, 120], [140, 120, 100], [40, 110, 190],
  [90, 160, 230], [240, 120, 60], [210, 40, 40], [40, 80, 210],
  [230, 200, 40], [220, 220, 225], [170, 80, 50], [255, 240, 180],
];

/**
 * @param {string} ramp ramp name
 * @param {number} level 0-15
 * @returns {number} palette index
 */
export function paletteIndex(ramp, level) {
  return RAMP[ramp] * 16 + level;
}

/**
 * Builds a day palette, optionally with other base colors for some ramps (zones).
 * @param {Object<string, number[]>} [overrides] ramp name -> [r, g, b]
 * @returns {Uint8Array} 256 RGBA entries
 */
export function buildPalette(overrides = {}) {
  const { baseLevel, darkFloor, whiteMix } = CONFIG.palette;
  const out = new Uint8Array(256 * 4);
  for (let ramp = 0; ramp < 16; ramp++) {
    const color = overrides[RAMP_NAMES[ramp]] || RAMP_COLORS[ramp];
    for (let level = 0; level < 16; level++) {
      const o = (ramp * 16 + level) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const dark = color[ch] * (darkFloor + (1 - darkFloor) * Math.min(level / baseLevel, 1));
        const white = Math.max(level - baseLevel, 0) / (15 - baseLevel) * whiteMix;
        out[o + ch] = Math.round(dark + (255 - dark) * white);
      }
      out[o + 3] = 255;
    }
  }
  out[0] = out[1] = out[2] = 0;
  return out;
}

/**
 * Builds the base (day, default colors) palette.
 * @returns {Uint8Array} 256 RGBA entries
 */
export function buildBasePalette() {
  return buildPalette();
}

/**
 * Time-of-day variant of a palette. The emissive `lights` ramp is never changed; the sky ramp
 * becomes a zenith-to-horizon gradient over the levels used by the sky shader.
 * @param {Uint8Array} base day palette
 * @param {{tint: number[], darkTint?: number[], darkLevels?: number, sky?: {zenith: number[], horizon: number[]}}} time
 *   entry of CONFIG.time
 * @returns {Uint8Array} new palette
 */
export function applyTime(base, time) {
  const out = new Uint8Array(base);
  const { zenithLevel, horizonLevel } = CONFIG.sky;
  for (let index = 1; index < 256; index++) {
    const ramp = index >> 4, level = index & 15, o = index * 4;
    if (ramp === RAMP.lights) continue;
    if (ramp === RAMP[CONFIG.sky.ramp] && time.sky) {
      const t = Math.max(0, Math.min(1, (level - zenithLevel) / (horizonLevel - zenithLevel)));
      for (let ch = 0; ch < 3; ch++) out[o + ch] = Math.round(time.sky.zenith[ch] + (time.sky.horizon[ch] - time.sky.zenith[ch]) * t);
      continue;
    }
    const r = base[o] * time.tint[0], g = base[o + 1] * time.tint[1], b = base[o + 2] * time.tint[2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const k = time.darkTint ? Math.max(0, 1 - level / time.darkLevels) : 0;
    const tint = time.darkTint || time.tint;
    out[o] = Math.min(255, Math.round(r + (luma * tint[0] - r) * k));
    out[o + 1] = Math.min(255, Math.round(g + (luma * tint[1] - g) * k));
    out[o + 2] = Math.min(255, Math.round(b + (luma * tint[2] - b) * k));
  }
  return out;
}

/**
 * Weather variant of a palette (applied after the time of day): colors drift towards gray and
 * darken; the sky ramp grays out and may flatten to its horizon color (fog). Emissive lights stay.
 * @param {Uint8Array} base palette
 * @param {{desat: number, dark: number, skyDesat: number, skyFlat: number}} weather entry of CONFIG.weather
 * @returns {Uint8Array} new palette
 */
export function applyWeather(base, weather) {
  const out = new Uint8Array(base);
  const sky = RAMP[CONFIG.sky.ramp], horizon = (sky * 16 + CONFIG.sky.horizonLevel) * 4;
  for (let index = 1; index < 256; index++) {
    const ramp = index >> 4, o = index * 4;
    if (ramp === RAMP.lights) continue;
    const isSky = ramp === sky, desat = isSky ? weather.skyDesat : weather.desat;
    const flat = isSky ? weather.skyFlat : 0;
    const rgb = [0, 1, 2].map((ch) => base[o + ch] + (base[horizon + ch] - base[o + ch]) * flat);
    const luma = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    for (let ch = 0; ch < 3; ch++) out[o + ch] = Math.round((rgb[ch] + (luma - rgb[ch]) * desat) * weather.dark);
  }
  return out;
}

/**
 * Interpolates palette colors (never indices): out = a + (b - a) * t.
 * @param {Uint8Array} out
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @param {number} t 0-1
 * @returns {Uint8Array}
 */
export function lerpPalette(out, a, b, t) {
  for (let i = 0; i < out.length; i++) out[i] = Math.round(a[i] + (b[i] - a[i]) * t);
  return out;
}
