// SPDX-License-Identifier: AGPL-3.0-or-later
// Scenery placement: turns zone and section rules into per-chunk instance matrices with a seeded
// RNG. Pure data (no GL); world.js uploads the result as instance batches.

import { CONFIG } from '../config.js';
import { createRng } from '../engine/rng.js';
import { mat4FromYawPitch } from '../engine/math3d.js';
import { ZONES } from '../data/zones.js';
import { SCENERY, SEGMENT_LENGTH } from '../models/scenery.js';
import { pathAt } from './track.js';
import { heightAt } from './surface.js';
import { openSide } from './terrain.js';
import { SURFACE_POINTS } from './chunks.js';
import { buildGrid, queryCells } from '../engine/grid.js';

const SIDES = { left: [-1], right: [1], both: [-1, 1], center: [0] };
const RULE_SEED = 7919, SECTION_SEED = 104729;

// Structures that follow the geometry: tunnel segments with portals at both ends, and bridge
// parapets with piers.
function placeStructures(path, place, rng) {
  const every = (meters) => Math.max(1, Math.round(meters / path.step));
  const segment = every(SEGMENT_LENGTH), pier = every(CONFIG.scenery.pierSpacing);
  const center = { offset: 0, where: 'any' };
  let inside = false;
  for (let i = 0; i < path.count; i++) {
    const s = i * path.step, tunnel = path.tunnel[i] > 0.9;
    if (tunnel && !inside) place(center, SCENERY.tunnelPortal, s, 0, rng);
    if (!tunnel && inside) place({ ...center, flip: true }, SCENERY.tunnelPortal, s, 0, rng);
    if (tunnel && i % segment === 0) place(center, SCENERY.tunnel, s, 0, rng);
    inside = tunnel;
    // Guard rail along the water of a lake road or the edge of a precipice.
    const open = path.lake[i] + path.cliff[i] + path.sea[i];
    if (Math.abs(open) > 0.5 && i % segment === 0) place({ offset: -0.3, where: 'any' }, SCENERY.bridgeRail, s, Math.sign(open), rng);
    if (path.bridge[i] > 0.5) {
      if (i % segment === 0) for (const side of [-1, 1]) place({ offset: -0.3, where: 'bridge' }, SCENERY.bridgeRail, s, side, rng);
      if (i % pier === 0) for (const side of [-1, 1]) place({ offset: 0.6, where: 'bridge' }, SCENERY.bridgePier, s, side, rng);
    }
  }
}

// Warning signs generated from the geometry: before every sharp curve and before every fork.
function autoSigns(path, roads) {
  const t = CONFIG.track, signs = [];
  let last = -Infinity;
  for (let i = 1; i < path.count; i++) {
    const k = path.curvature[i], s = i * path.step;
    if (Math.abs(k) >= t.signCurve && Math.abs(path.curvature[i - 1]) < t.signCurve && s - last > t.signSpacing) {
      signs.push({ s: s - t.signBefore, obj: k > 0 ? 'signCurveRight' : 'signCurveLeft', side: 1 });
      last = s;
    }
  }
  for (const road of roads) {
    if (road.fork !== null && path.id === 0) signs.push({ s: road.fork - t.signBefore, obj: 'signFork', side: road.side === 'left' ? -1 : 1 });
  }
  return signs;
}

/**
 * @param {import('./track.js').TrackPath} path
 * @param {{rowU: Float32Array, rowY: Float32Array}} surface
 * @param {number} seed
 * @param {import('./track.js').TrackPath[]} [roads] all roads (for fork signs on the main road)
 * @returns {Array<Object<string, number[]>>} per chunk index of this road: object name -> flat list
 *   of 4x4 matrices
 */
export function placeScenery(path, surface, seed, roads = [path]) {
  const cfg = CONFIG.scenery, perChunk = Math.round(CONFIG.chunk.length / path.step);
  const chunkCount = Math.ceil((path.count - 1) / perChunk);
  const chunks = Array.from({ length: chunkCount }, () => ({}));
  const edge = path.width / 2 + CONFIG.track.shoulder;
  const p = {}, matrix = new Float32Array(16);

  function place(rule, def, s, side, rng) {
    if (s < 0 || s > path.length) return;
    const i = Math.min(Math.round(s / path.step), path.count - 1);
    if (i < path.drawnFrom || i > path.drawnTo || path.junction[i]) return;
    const where = rule.where || 'land';
    if (where === 'land' && (path.bridge[i] > cfg.bridgeLimit || path.tunnel[i] > cfg.tunnelLimit)) return;
    if (where === 'bridge' && path.bridge[i] <= 0.5) return;
    const offset = Array.isArray(rule.offset) ? rule.offset[0] + (rule.offset[1] - rule.offset[0]) * rng() : rule.offset;
    const u = side * (edge + offset);
    if (side !== 0 && path.canyon[i] > 0.3 && offset < CONFIG.terrain.canyonWall + 1) return;
    if (side !== 0 && (path.lake[i] + path.cliff[i] + path.sea[i]) * side > 0.3 && where === 'land' && openSide(path, i, side)) return;
    const yaw = def.align === 'random' ? rng() * Math.PI * 2 : 0;
    const scale = def.scale ? def.scale[0] + (def.scale[1] - def.scale[0]) * rng() : 1;
    // Stay on the terrain strip (it is squeezed on the inside of curves).
    const limit = surface.rowU[i * SURFACE_POINTS + (side < 0 ? 0 : SURFACE_POINTS - 1)];
    if (side !== 0 && Math.abs(u) > Math.abs(limit) - cfg.edgeMargin) return;
    pathAt(path, s, p);
    const x = p.x + Math.cos(p.heading) * u, z = p.z + Math.sin(p.heading) * u;
    const flip = (side < 0 && def.mirrorLeft) !== !!rule.flip ? Math.PI : 0;
    const turn = def.align === 'random' ? yaw : -p.heading + flip + (def.yawOffset || 0);
    mat4FromYawPitch(matrix, turn, 0, x, heightAt(path, surface, s, u) + (def.lift || 0), z);
    for (let k = 0; k < 12; k++) matrix[k] *= scale;
    const chunk = chunks[Math.min(Math.floor(Math.min(i, path.drawnTo - 1) / perChunk), chunkCount - 1)];
    (chunk[def.name] || (chunk[def.name] = [])).push(...matrix);
  }

  // Zone rules apply over each run of pieces in that zone, section rules over the section.
  const ranges = [
    ...path.zones.map((run) => ({ start: run.start, end: run.end, rules: ZONES[run.zone].scenery })),
    ...path.sections.map((section) => ({ start: section.start, end: section.end, rules: section.scenery })),
  ];
  ranges.forEach((section, sectionIndex) => {
    section.rules.forEach((rule, ruleIndex) => {
      const def = SCENERY[rule.obj];
      if (!def) throw new Error(`scenery rule refers to unknown object ${rule.obj}`);
      const rng = createRng(seed + ruleIndex * RULE_SEED + sectionIndex * SECTION_SEED);
      const sides = SIDES[rule.side];
      if (rule.rule === 'at') {
        for (const side of sides) place(rule, def, section.start + rule.pos, side, rng);
        return;
      }
      const from = section.start + (rule.from || 0);
      const to = rule.to === undefined ? section.end : section.start + rule.to;
      for (let s = from; s < to; s += rule.spacing) {
        for (const side of sides) {
          place(rule, def, s + (rng() - 0.5) * rule.spacing * (rule.jitter || 0), side, rng);
        }
      }
    });
  });
  path.sections.forEach((section, sectionIndex) => {
    if (!section.station) return;
    // Every section ends at a gas station on the right, with a parking lot.
    const rng = createRng(seed + sectionIndex);
    for (const [obj, back, offset] of STATION_LAYOUT) place({ offset, where: 'any' }, SCENERY[obj], section.end - back, 1, rng);
    for (const [obj, along] of PARKED) place({ offset: LOT_OFFSET - 7, where: 'any' }, SCENERY[obj], section.end - LOT_BACK + along, 1, rng);
  });
  const rng = createRng(seed + SIGN_SEED);
  for (const sign of autoSigns(path, roads)) place({ offset: 1 }, SCENERY[sign.obj], sign.s, sign.side, rng);
  placeStructures(path, place, rng);
  return chunks;
}

// Station buildings: object, meters before the section end, offset from the shoulder.
const LOT_BACK = 95, LOT_OFFSET = 12;
const STATION_LAYOUT = [['gasStation', 45, 9], ['shop', 25, 20], ['parkingLot', LOT_BACK, LOT_OFFSET]];
// Cars on the station parking lot: object, meters along the road from the lot center.
const PARKED = [['parkedSedan', -5.6], ['parkedVan', 0], ['parkedRed', 5.6]];
const SIGN_SEED = 31337;

/**
 * World positions of the lamps (models with a `light`) as a spatial grid.
 * @param {Array<Object<string, number[]>>} placed result of placeScenery (chunks of all roads)
 * @returns {{cell: number, stride: number, cells: Map<number, Float32Array>}} records x, y, z
 */
export function buildLights(placed) {
  const out = [];
  for (const byName of placed) {
    for (const name of Object.keys(byName)) {
      const light = SCENERY[name].light, m = byName[name];
      if (!light) continue;
      for (let i = 0; i < m.length; i += 16) {
        for (let k = 0; k < 3; k++) out.push(m[i + k] * light[0] + m[i + 4 + k] * light[1] + m[i + 8 + k] * light[2] + m[i + 12 + k]);
      }
    }
  }
  return buildGrid(out, 3, LIGHT_CELL, 0, 2);
}

const LIGHT_CELL = 50;
const lightCells = new Array(64);

/**
 * Picks the lamps nearest to a point.
 * @param {{cell: number, cells: Map<number, Float32Array>}} lights from buildLights
 * @param {number} x point the lamps should be near
 * @param {number} z
 * @param {number} radius search radius in meters
 * @param {Float32Array} out x, y, z per picked lamp, nearest first; its length sets the maximum
 * @param {Float32Array} distances scratch array with one entry per lamp that fits in `out`
 * @returns {number} number of lamps written
 */
export function selectLights(lights, x, z, radius, out, distances) {
  const max = distances.length;
  let count = 0;
  const n = queryCells(lights, x, z, radius, lightCells);
  for (let k = 0; k < n; k++) {
    const list = lightCells[k];
    for (let i = 0; i < list.length; i += 3) {
      const d = (list[i] - x) ** 2 + (list[i + 2] - z) ** 2;
      if (count === max && d >= distances[max - 1]) continue;
      // Insertion into the sorted list of the nearest lamps.
      let at = Math.min(count, max - 1);
      while (at > 0 && distances[at - 1] > d) {
        distances[at] = distances[at - 1];
        out.copyWithin(at * 3, (at - 1) * 3, at * 3);
        at--;
      }
      distances[at] = d;
      out[at * 3] = list[i]; out[at * 3 + 1] = list[i + 1]; out[at * 3 + 2] = list[i + 2];
      if (count < max) count++;
    }
  }
  return count;
}

/**
 * Lighthouse lanterns (models with a `beacon`), for the rotating beams at night.
 * @param {Array<Object<string, number[]>>} placed result of placeScenery (chunks of all roads)
 * @returns {number[][]} [x, y, z] per lantern
 */
export function buildBeacons(placed) {
  const out = [];
  for (const byName of placed) {
    for (const name of Object.keys(byName)) {
      const beacon = SCENERY[name].beacon, m = byName[name];
      if (!beacon) continue;
      for (let i = 0; i < m.length; i += 16) {
        out.push([0, 1, 2].map((k) => m[i + k] * beacon[0] + m[i + 4 + k] * beacon[1] + m[i + 8 + k] * beacon[2] + m[i + 12 + k]));
      }
    }
  }
  return out;
}
