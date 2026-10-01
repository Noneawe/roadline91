// SPDX-License-Identifier: AGPL-3.0-or-later
// Station screen drawn into the overlay: split times, comparison with the rival, choice of the time
// of day for the next section and a map of the whole route.

import { CONFIG } from '../config.js';
import { fillRect, drawLine } from '../gfx/draw2d.js';
import { drawText } from '../gfx/font.js';
import { paletteIndex } from '../gfx/palette.js';

/**
 * @param {number} seconds
 * @returns {string} m:ss.t
 */
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60), s = seconds - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

/**
 * Map of all roads scaled into a rectangle, built once: line segments in overlay pixels.
 * @param {import('../world/track.js').TrackPath[]} roads
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @returns {{lines: Array<{road: number, points: Int16Array}>, project: (px: number, pz: number, out: number[]) => number[]}}
 */
export function buildRouteMap(roads, x, y, w, h) {
  const step = CONFIG.station.mapStep;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const road of roads) {
    for (let i = 0; i < road.count; i++) {
      minX = Math.min(minX, road.x[i]); maxX = Math.max(maxX, road.x[i]);
      minZ = Math.min(minZ, road.z[i]); maxZ = Math.max(maxZ, road.z[i]);
    }
  }
  const scale = Math.min(w / (maxX - minX), (h * CONFIG.station.pixelAspect) / (maxZ - minZ));
  const ox = x + (w - (maxX - minX) * scale) / 2, oy = y + (h - ((maxZ - minZ) * scale) / CONFIG.station.pixelAspect) / 2;
  const project = (px, pz, out) => {
    out[0] = Math.round(ox + (px - minX) * scale);
    out[1] = Math.round(oy + ((pz - minZ) * scale) / CONFIG.station.pixelAspect);
    return out;
  };
  const p = [0, 0];
  const lines = roads.map((road) => {
    const points = [];
    for (let i = road.drawnFrom; i <= road.drawnTo; i += step) points.push(...project(road.x[i], road.z[i], p));
    return { road: road.id, points: new Int16Array(points) };
  });
  return { lines, project };
}

const mark = [0, 0];

/**
 * @param {Uint8Array} buf overlay buffer
 * @param {string[]} lines text on the left
 * @param {Object} map from buildRouteMap
 * @param {Array<{x: number, z: number}>} stations positions of the stations on the map
 * @param {{x: number, z: number}} car current position
 */
export function drawStation(buf, lines, map, stations, car) {
  const c = CONFIG.station, index = (ramp, level) => paletteIndex(ramp, level);
  fillRect(buf, 0, 0, CONFIG.render.width, CONFIG.render.height, index('gray', c.backLevel));
  fillRect(buf, c.mapX - 2, c.mapY - 2, c.mapW + 4, c.mapH + 4, index('gray', c.frameLevel));
  for (const { road, points } of map.lines) {
    const color = road === 0 ? index('roadLine', 14) : index('paint3', 13);
    for (let i = 2; i < points.length; i += 2) drawLine(buf, points[i - 2], points[i - 1], points[i], points[i + 1], color);
  }
  for (const st of stations) {
    map.project(st.x, st.z, mark);
    fillRect(buf, mark[0] - 1, mark[1] - 1, 3, 3, index('paint2', 14));
  }
  map.project(car.x, car.z, mark);
  fillRect(buf, mark[0] - 2, mark[1] - 2, 5, 5, index('paint1', 14));
  lines.forEach((line, i) => drawText(buf, c.textX, c.textY + i * c.lineHeight, line, index('gray', 15)));
}
