// SPDX-License-Identifier: AGPL-3.0-or-later
// CPU queries of the driving surface: nearest track position for a world point, ground height and
// surface type, consistent with the rendered road and terrain rows. No DOM or GL.

import { CONFIG } from '../config.js';
import { buildRow, SURFACE_POINTS } from './chunks.js';
import { hypot2 } from '../engine/math3d.js';

const MIN_STEP = 1e-3; // m between neighbouring profile points

/**
 * Lateral profile (horizontal offset u from the centerline, height y) of every track sample.
 * @param {import('./track.js').TrackPath} path
 * @returns {{rowU: Float32Array, rowY: Float32Array}}
 */
export function buildSurface(path) {
  const rowU = new Float32Array(path.count * SURFACE_POINTS), rowY = new Float32Array(path.count * SURFACE_POINTS);
  for (let i = 0; i < path.count; i++) {
    const cosH = Math.cos(path.heading[i]), sinH = Math.sin(path.heading[i]);
    buildRow(path, i).forEach((p, j) => {
      // Clipped junction rows may fold back; the profile is kept increasing for the lookups.
      const u = (p[0] - path.x[i]) * cosH + (p[2] - path.z[i]) * sinH;
      rowU[i * SURFACE_POINTS + j] = j > 0 ? Math.max(u, rowU[i * SURFACE_POINTS + j - 1] + MIN_STEP) : u;
      rowY[i * SURFACE_POINTS + j] = p[1];
    });
  }
  return { rowU, rowY };
}

/**
 * Finds the track segment nearest to a point.
 * @param {import('./track.js').TrackPath} path
 * @param {number} x
 * @param {number} z
 * @param {number} hint sample index to search around, or -1 to search the whole track
 * @param {{index: number, t: number, u: number}} out segment index, position 0-1 inside it,
 *   lateral offset in meters (positive right)
 * @returns {typeof out}
 */
export function locate(path, x, z, hint, out) {
  const window = CONFIG.physics.locateWindow;
  const from = hint < 0 ? 0 : Math.max(0, hint - window);
  const to = hint < 0 ? path.count - 2 : Math.min(path.count - 2, hint + window);
  let best = Infinity;
  for (let i = from; i <= to; i++) {
    const dx = path.x[i + 1] - path.x[i], dz = path.z[i + 1] - path.z[i];
    const px = x - path.x[i], pz = z - path.z[i];
    const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / (dx * dx + dz * dz)));
    const ex = px - dx * t, ez = pz - dz * t;
    const d = ex * ex + ez * ez;
    if (d < best) {
      best = d;
      out.index = i;
      out.t = t;
      // Right of the travel direction (dx, dz) is (-dz, dx).
      out.u = (-dz * ex + dx * ez) / hypot2(dx, dz);
    }
  }
  return out;
}

function rowHeight(surface, row, u) {
  const o = row * SURFACE_POINTS, { rowU, rowY } = surface;
  if (u <= rowU[o]) return rowY[o];
  for (let j = 1; j < SURFACE_POINTS; j++) {
    if (u <= rowU[o + j]) {
      const t = (u - rowU[o + j - 1]) / (rowU[o + j] - rowU[o + j - 1]);
      return rowY[o + j - 1] + (rowY[o + j] - rowY[o + j - 1]) * t;
    }
  }
  return rowY[o + SURFACE_POINTS - 1];
}

/**
 * Ground height at a track position.
 * @param {import('./track.js').TrackPath} path
 * @param {{rowU: Float32Array, rowY: Float32Array}} surface
 * @param {number} s distance along the track in meters
 * @param {number} u lateral offset in meters, positive right
 * @returns {number}
 */
export function heightAt(path, surface, s, u) {
  const f = Math.max(0, Math.min(s / path.step, path.count - 1));
  const i = Math.min(Math.floor(f), path.count - 2);
  const a = rowHeight(surface, i, u), b = rowHeight(surface, i + 1, u);
  return a + (b - a) * (f - i);
}

/**
 * Nearest road to a point among the roads near it: the one whose centerline is closest (with a
 * little hysteresis in favour of the current road). Branches count only along their drawn part.
 * @param {import('./track.js').TrackPath[]} roads
 * @param {number} x
 * @param {number} z
 * @param {number} current road id to prefer
 * @param {Int32Array} hints last sample index per road (-1 = unknown)
 * @param {{index: number, t: number, u: number}} where filled for the chosen road
 * @returns {number} chosen road id
 */
export function pickRoad(roads, x, z, current, hints, where) {
  let best = current, bestU = Infinity;
  for (let r = 0; r < roads.length; r++) {
    const road = roads[r];
    if (r !== current && r !== 0 && (x < road.minX || x > road.maxX || z < road.minZ || z > road.maxZ)) {
      hints[r] = -1;
      continue;
    }
    locate(road, x, z, hints[r], scratch);
    hints[r] = scratch.index;
    if (scratch.index < road.drawnFrom || scratch.index >= road.drawnTo) continue;
    const u = Math.abs(scratch.u) - (r === current ? HYSTERESIS : 0);
    if (u < bestU) {
      bestU = u;
      best = r;
      where.index = scratch.index; where.t = scratch.t; where.u = scratch.u;
    }
  }
  if (bestU === Infinity) {
    locate(roads[current], x, z, hints[current], where);
    hints[current] = where.index;
  }
  return best;
}

const scratch = { index: 0, t: 0, u: 0 };
const HYSTERESIS = 0.5;
const BOUNDS_MARGIN = 200;

/**
 * Bounding boxes used by pickRoad to skip far roads.
 * @param {import('./track.js').TrackPath[]} roads
 */
export function setRoadBounds(roads) {
  for (const road of roads) {
    road.minX = Math.min(...road.x) - BOUNDS_MARGIN; road.maxX = Math.max(...road.x) + BOUNDS_MARGIN;
    road.minZ = Math.min(...road.z) - BOUNDS_MARGIN; road.maxZ = Math.max(...road.z) + BOUNDS_MARGIN;
  }
}

/**
 * Creates the ground function used by the physics: height and surface of the nearest road's
 * cross-section. It remembers where it was, so one instance serves one vehicle; call `reset()`
 * after teleporting.
 * @param {import('./track.js').TrackPath[]} roads
 * @param {Array<{rowU: Float32Array, rowY: Float32Array}>} surfaces one per road
 * @param {number} [gripScale] weather factor on every surface's grip
 * @returns {((x: number, z: number, out: {y: number, grip: number, rolling: number}) => void) &
 *   {reset: () => void, follow: (road: number, hints: Int32Array) => void}}
 */
export function createGround(roads, surfaces, gripScale = 1) {
  const { surfaces: types } = CONFIG.physics;
  const where = { index: 0, t: 0, u: 0 };
  const hints = new Int32Array(roads.length).fill(-1);
  let current = 0;
  const ground = (x, z, out) => {
    current = pickRoad(roads, x, z, current, hints, where);
    const road = roads[current], surface = surfaces[current];
    const half = road.width / 2, edge = half + CONFIG.track.shoulder;
    const a = rowHeight(surface, where.index, where.u), b = rowHeight(surface, where.index + 1, where.u);
    const side = Math.abs(where.u);
    const paved = road.surface === 'gravel' ? types.gravel : types.asphalt;
    const type = side <= half ? paved : side <= edge ? types.shoulder : types.grass;
    out.y = a + (b - a) * where.t;
    out.grip = type.grip * gripScale;
    out.rolling = type.rolling;
  };
  ground.reset = () => { hints.fill(-1); current = 0; };
  // Starts the next lookups from a known position (another vehicle's road and hints).
  ground.follow = (road, from) => { current = road; hints.set(from); };
  return ground;
}
