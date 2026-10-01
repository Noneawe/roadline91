// SPDX-License-Identifier: AGPL-3.0-or-later
// All roads of a track (main road + branches) and the room each road sample has for its terrain:
// every point of the ground belongs to the nearest road sample, so terrain strips of neighbouring
// roads (or of the two legs of a hairpin) meet halfway instead of overlapping. CPU data only.

import { CONFIG } from '../config.js';
import { buildPath, buildBranches, pathAt } from './track.js';
import { hypot2 } from '../engine/math3d.js';

const CELL = 40; // m, spatial hash cell
const KEY = 100000;

function cellKey(x, z) {
  return Math.floor(x / CELL) * KEY + Math.floor(z / CELL);
}

/**
 * Spatial hash of road samples.
 * @param {import('./track.js').TrackPath[]} roads
 * @returns {Map<number, number[]>} cell -> flat list of [road, sample] pairs
 */
function hashSamples(roads) {
  const cells = new Map();
  for (const road of roads) {
    for (let i = road.drawnFrom; i <= road.drawnTo; i++) {
      const key = cellKey(road.x[i], road.z[i]);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(road.id, i);
    }
  }
  return cells;
}

/**
 * Calls fn(road, sample) for every hashed sample within `radius` of (x, z) (roughly).
 */
function nearby(cells, x, z, radius, fn) {
  const r = Math.ceil(radius / CELL);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      const list = cells.get((cx + i) * KEY + (cz + j));
      if (list) for (let k = 0; k < list.length; k += 2) fn(list[k], list[k + 1]);
    }
  }
}

// Marks the samples of a branch that still overlap the main road (near its fork and rejoin) and
// remembers the nearest main road sample of each: those rows are clipped against the main road's
// corridor (see clipToMain), so the two surfaces never overlap.
function markJunction(branch, main, cells) {
  const reach = CONFIG.track.junctionGap + branch.width / 2 + CONFIG.track.shoulder;
  branch.main = main;
  branch.junction = new Uint8Array(branch.count);
  branch.mainIndex = new Int32Array(branch.count).fill(-1);
  for (let i = 0; i < branch.count; i++) {
    let best = reach;
    nearby(cells, branch.x[i], branch.z[i], reach, (road, j) => {
      const d = hypot2(main.x[j] - branch.x[i], main.z[j] - branch.z[i]);
      if (road === main.id && d < best) { best = d; branch.mainIndex[i] = j; }
    });
    if (best < CONFIG.track.junctionGap) branch.junction[i] = 1;
  }
}

/**
 * Builds every road of the track with its terrain room (extentL / extentR per sample).
 * @param {Object} track
 * @returns {import('./track.js').TrackPath[]} main road first
 */
export function buildRoads(track) {
  const main = buildPath(track);
  const roads = [main, ...buildBranches(track, main)];
  const mainCells = hashSamples([main]);
  main.junction = new Uint8Array(main.count);
  for (let r = 1; r < roads.length; r++) markJunction(roads[r], main, mainCells);
  const cells = hashSamples(roads);
  const reach = path0Reach();
  for (const road of roads) {
    road.extentReach = reach;
    road.extentL = new Float32Array(road.count).fill(reach);
    road.neighbourL = Float32Array.from(road.y);
    road.neighbourR = Float32Array.from(road.y);
    road.extentR = new Float32Array(road.count).fill(reach);
    for (let i = 0; i < road.count; i++) {
      const cx = road.x[i], cz = road.z[i], rx = Math.cos(road.heading[i]), rz = Math.sin(road.heading[i]);
      // The point at lateral distance e stays nearest to this sample while e <= |d|^2 / (2 a),
      // for every other sample at offset d whose lateral component a points to that side.
      nearby(cells, cx, cz, reach, (other, j) => {
        if (other === road.id && j === i) return;
        const o = roads[other], dx = o.x[j] - cx, dz = o.z[j] - cz;
        const a = dx * rx + dz * rz, d2 = dx * dx + dz * dz;
        // Also remember the height of the road that limits the strip: terrain between two roads
        // at different heights ramps to the average at the halfway line.
        if (a > 1e-6 && d2 / (2 * a) < road.extentR[i]) { road.extentR[i] = d2 / (2 * a); road.neighbourR[i] = o.y[j]; }
        else if (a < -1e-6 && d2 / (-2 * a) < road.extentL[i]) { road.extentL[i] = d2 / (-2 * a); road.neighbourL[i] = o.y[j]; }
      });
    }
    // The strip reaches the halfway line exactly, but its hills flatten according to a room that
    // may grow only gradually along the road, so a squeezed strip never ends in a wall.
    const grow = CONFIG.terrain.squeezeSlope * road.step;
    road.flatL = Float32Array.from(road.extentL);
    road.flatR = Float32Array.from(road.extentR);
    for (const flat of [road.flatL, road.flatR]) {
      for (let i = 1; i < road.count; i++) flat[i] = Math.min(flat[i], flat[i - 1] + grow);
      for (let i = road.count - 2; i >= 0; i--) flat[i] = Math.min(flat[i], flat[i + 1] + grow);
    }
  }
  return roads;
}

// Full lateral reach of a road's cross-section: shoulder edge plus the widest terrain column.
function path0Reach() {
  const t = CONFIG.terrain;
  return CONFIG.track.shoulder + t.offsets[t.offsets.length - 1] + 8 + 10;
}

/**
 * Finds the road sample nearest to a point (used by validation and tools).
 * @param {import('./track.js').TrackPath[]} roads
 * @param {number} x
 * @param {number} z
 * @returns {{road: number, sample: number, distance: number}}
 */
export function nearestSample(roads, x, z) {
  let best = { road: -1, sample: -1, distance: Infinity };
  for (const road of roads) {
    for (let i = road.drawnFrom; i <= road.drawnTo; i++) {
      const d = hypot2(road.x[i] - x, road.z[i] - z);
      if (d < best.distance) best = { road: road.id, sample: i, distance: d };
    }
  }
  return best;
}

const clipSample = {};

/**
 * Moves the points of a branch cross-section that fall inside the main road's corridor (asphalt +
 * shoulders) onto the corridor's edge on the branch's side, at the height of that edge.
 * @param {import('./track.js').TrackPath} branch
 * @param {number} i sample index
 * @param {number[][]} row points [x, y, z], changed in place
 */
export function clipToMain(branch, i, row) {
  const main = branch.main, j0 = branch.mainIndex[i];
  if (j0 < 0) return;
  const edge = main.width / 2 + CONFIG.track.shoulder;
  // Side of the main road the branch is on here (the declared side where they still coincide).
  const cu = (branch.x[i] - main.x[j0]) * Math.cos(main.heading[j0]) + (branch.z[i] - main.z[j0]) * Math.sin(main.heading[j0]);
  const side = Math.abs(cu) > 1 ? Math.sign(cu) : branch.side === 'left' ? -1 : 1;
  for (const p of row) {
    // Nearest main road position by projection onto the neighbouring main segments.
    let best = Infinity, s = 0, u = 0;
    for (let j = Math.max(0, j0 - 4); j < Math.min(main.count - 1, j0 + 4); j++) {
      const dx = main.x[j + 1] - main.x[j], dz = main.z[j + 1] - main.z[j], px = p[0] - main.x[j], pz = p[2] - main.z[j];
      const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / (dx * dx + dz * dz)));
      const ex = px - dx * t, ez = pz - dz * t, d = ex * ex + ez * ez;
      if (d < best) { best = d; s = (j + t) * main.step; u = (-dz * ex + dx * ez) / hypot2(dx, dz); }
    }
    if (u * side >= edge) continue;
    const c = pathAt(main, s, clipSample), e = side * edge;
    p[0] = c.x + Math.cos(c.heading) * e;
    p[2] = c.z + Math.sin(c.heading) * e;
    p[1] = c.y - e * Math.sin(c.bank);
  }
}
