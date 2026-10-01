// SPDX-License-Identifier: AGPL-3.0-or-later
// Track centerline sampling and road cross-sections built from track pieces. CPU data only
// (no GL, no DOM): physics and AI sample the same path.

import { CONFIG } from '../config.js';
import { ZONES } from '../data/zones.js';
import { hypot3 } from '../engine/math3d.js';

const DEG = Math.PI / 180;

/** Points per road cross-section, left to right. */
export const ROAD_POINTS = 8;

/**
 * @typedef {Object} TrackPath
 * @property {number} step distance between samples in meters
 * @property {number} count number of samples
 * @property {number} length usable length in meters ((count - 1) * step)
 * @property {number} width road width in meters
 * @property {Float64Array} x
 * @property {Float64Array} y
 * @property {Float64Array} z
 * @property {Float64Array} heading radians, 0 = -Z, positive turns right
 * @property {Float64Array} curvature rad/m, positive turns right
 * @property {Float64Array} grade slope dy/ds
 * @property {Float64Array} bank radians, positive lowers the right side
 * @property {Float64Array} bridge 0-1 blend towards a bridge
 * @property {Float64Array} tunnel 0-1 blend towards a tunnel through a hill
 * @property {Float64Array} flat 0-1 blend towards level ground (rest areas, stations)
 * @property {Float64Array} canyon 0-1 blend towards a canyon (steep rock walls beside the road)
 * @property {Float64Array} lake -1..1: a lake on the left (-1) or right (+1) side, high mountains on the other
 * @property {Float64Array} cliff -1..1: a precipice on the left (-1) or right (+1) side, mountain on the other
 * @property {Float64Array} sea -1..1: a sea cliff on the left (-1) or right (+1) side, open sea below
 * @property {Float64Array} hills terrain hill height multiplier (from the zone)
 * @property {Array<{start: number, end: number, zone: string}>} zones runs of pieces in the same zone
 * @property {Array<Object>} sections ranges in meters with zone, station, scenery, traffic and police data
 * @property {number} id road number (0 = main road)
 * @property {string} surface 'asphalt' | 'gravel'
 * @property {number} drawnFrom first sample with geometry (branches start clear of the main road)
 * @property {number} drawnTo last sample with geometry
 * @property {number|null} fork main road distance where a branch leaves (null on the main road)
 * @property {number|null} rejoin main road distance where a branch comes back
 * @property {Float32Array} [extentL] room for terrain left of each sample (set by roads.js)
 * @property {Float32Array} [extentR] room for terrain right of each sample
 */

// Box-filtered piecewise-constant piece parameter: linear transitions of length `ease` at joints.
function makeSmoothed(pieces, value, ease) {
  const starts = [0], sums = [0];
  for (const piece of pieces) {
    starts.push(starts[starts.length - 1] + piece.len);
    sums.push(sums[sums.length - 1] + value(piece) * piece.len);
  }
  const total = starts[pieces.length];
  const integral = (s) => {
    if (s <= 0) return value(pieces[0]) * s;
    if (s >= total) return sums[pieces.length] + value(pieces[pieces.length - 1]) * (s - total);
    let i = 0;
    while (starts[i + 1] <= s) i++;
    return sums[i] + value(pieces[i]) * (s - starts[i]);
  };
  return (s) => (integral(s + ease / 2) - integral(s - ease / 2)) / ease;
}

const ARRAYS = ['x', 'y', 'z', 'heading', 'curvature', 'grade', 'bank', 'bridge', 'tunnel', 'canyon', 'lake', 'cliff', 'sea', 'flat', 'hills'];

// Consecutive pieces of the same zone joined into ranges in meters.
function zoneRuns(pieces) {
  const runs = [];
  let at = 0;
  for (const piece of pieces) {
    const last = runs[runs.length - 1];
    if (last && last.zone === piece.zone) last.end += piece.len;
    else runs.push({ start: at, end: at + piece.len, zone: piece.zone });
    at += piece.len;
  }
  return runs;
}

// Samples a list of pieces from a start pose into centerline arrays.
function integrate(pieces, start) {
  const { step, easeLength } = CONFIG.track;
  const total = pieces.reduce((sum, piece) => sum + piece.len, 0);
  const count = Math.floor(total / step) + 1;
  const curve = makeSmoothed(pieces, (p) => ((p.curve || 0) * DEG) / 100, easeLength);
  const grade = makeSmoothed(pieces, (p) => (p.grade || 0) / 100, easeLength);
  const bank = makeSmoothed(pieces, (p) => (p.bank || 0) * DEG, easeLength);
  const bridge = makeSmoothed(pieces, (p) => (p.bridge ? 1 : 0), easeLength);
  const tunnel = makeSmoothed(pieces, (p) => (p.tunnel ? 1 : 0), easeLength);
  const flat = makeSmoothed(pieces, (p) => (p.flat ? 1 : 0), easeLength);
  const canyon = makeSmoothed(pieces, (p) => (p.canyon ? 1 : 0), easeLength);
  const lake = makeSmoothed(pieces, (p) => ({ left: -1, right: 1 })[p.lake] || 0, easeLength);
  const cliff = makeSmoothed(pieces, (p) => ({ left: -1, right: 1 })[p.cliff] || 0, easeLength);
  const sea = makeSmoothed(pieces, (p) => ({ left: -1, right: 1 })[p.sea] || 0, easeLength);
  const hills = makeSmoothed(pieces, (p) => ZONES[p.zone].hills, CONFIG.zones.blendLength);
  const path = { step, count, length: (count - 1) * step, zones: zoneRuns(pieces) };
  for (const key of ARRAYS) path[key] = new Float64Array(count);
  let { x, y, z, heading } = start;
  for (let i = 0; i < count; i++) {
    const s = i * step;
    path.x[i] = x; path.y[i] = y; path.z[i] = z; path.heading[i] = heading;
    path.curvature[i] = curve(s); path.grade[i] = grade(s);
    path.bank[i] = bank(s); path.bridge[i] = bridge(s); path.hills[i] = hills(s);
    path.tunnel[i] = tunnel(s); path.flat[i] = flat(s); path.canyon[i] = canyon(s); path.lake[i] = lake(s); path.cliff[i] = cliff(s); path.sea[i] = sea(s);
    const k = curve(s + step / 2), mid = heading + (k * step) / 2;
    x += Math.sin(mid) * step;
    z -= Math.cos(mid) * step;
    y += grade(s + step / 2) * step;
    heading += k * step;
  }
  return path;
}

/**
 * Samples the main road of a track: its sections joined in order. Branches are separate roads
 * (see buildBranches). The road width of the first section applies to the whole track.
 * @param {{sections: Array<{id: number, zone: string, width: number, station?: string, scenery?: Array,
 *   traffic?: Object, police?: Array, pieces: Array<{len: number, curve?: number, grade?: number,
 *   bank?: number, bridge?: boolean, tunnel?: boolean, canyon?: boolean, lake?: string, cliff?: string, sea?: string, flat?: boolean, zone?: string}>}>}} track
 * @returns {TrackPath}
 */
export function buildPath(track) {
  const pieces = [], sections = [];
  let at = 0;
  for (const section of track.sections) {
    const start = at;
    for (const piece of section.pieces) {
      pieces.push({ ...piece, zone: piece.zone || section.zone });
      at += piece.len;
    }
    sections.push({
      id: section.id, start, end: at, zone: section.zone, station: section.station || null,
      scenery: section.scenery || [], traffic: section.traffic || { density: 0, types: [] }, police: section.police || [],
    });
  }
  const path = integrate(pieces, { x: 0, y: 0, z: 0, heading: 0 });
  // Level ground around every station.
  const { stationFlat, stationFade } = CONFIG.track;
  for (const section of sections) {
    if (!section.station) continue;
    for (let i = 0; i < path.count; i++) {
      const d = section.end - i * path.step;
      if (d < -stationFade || d > stationFlat + stationFade) continue;
      const inside = d >= 0 && d <= stationFlat ? 1 : 1 - Math.min(1, (d < 0 ? -d : d - stationFlat) / stationFade);
      path.flat[i] = Math.max(path.flat[i], inside);
    }
  }
  return Object.assign(path, {
    id: 0, width: track.sections[0].width, surface: 'asphalt', sections,
    drawnFrom: 0, drawnTo: path.count - 1, fork: null, rejoin: null,
  });
}

const sample = {};

/**
 * Samples the branches of a track as separate roads. Each leaves the main road at `at` m into its
 * section and must reach the main road again at `rejoin`; the small remaining gap of the data is
 * closed by bending the branch smoothly (the size of that correction is kept for the validator).
 * @param {Object} track
 * @param {TrackPath} main from buildPath
 * @returns {TrackPath[]}
 */
export function buildBranches(track, main) {
  const branches = [];
  track.sections.forEach((section, k) => {
    for (const branch of section.branches || []) {
      const zone = branch.zone || section.zone;
      const s0 = main.sections[k].start + branch.at;
      const target = main.sections.find((sec) => sec.id === branch.rejoin.section);
      const s1 = (target ? target.start : main.length) + branch.rejoin.pos;
      const start = pathAt(main, s0, {});
      const path = integrate(branch.pieces.map((piece) => ({ ...piece, zone: piece.zone || zone })), start);
      const end = pathAt(main, s1, sample);
      const n = path.count - 1;
      const dx = end.x - path.x[n], dy = end.y - path.y[n], dz = end.z - path.z[n];
      for (let i = 0; i <= n; i++) {
        const t = i / n, w = t * t * (3 - 2 * t);
        path.x[i] += dx * w; path.y[i] += dy * w; path.z[i] += dz * w;
      }
      // Headings, curvature and grade follow the corrected centerline.
      for (let i = 0; i <= n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n, i + 1);
        path.heading[i] = Math.atan2(path.x[b] - path.x[a], -(path.z[b] - path.z[a]));
        path.grade[i] = (path.y[b] - path.y[a]) / ((b - a) * path.step);
      }
      for (let i = 1; i <= n; i++) {
        while (path.heading[i] - path.heading[i - 1] > Math.PI) path.heading[i] -= 2 * Math.PI;
        while (path.heading[i] - path.heading[i - 1] < -Math.PI) path.heading[i] += 2 * Math.PI;
      }
      for (let i = 0; i <= n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n, i + 1);
        path.curvature[i] = (path.heading[b] - path.heading[a]) / ((b - a) * path.step);
      }
      let endAngle = path.heading[n] - end.heading;
      endAngle = Math.atan2(Math.sin(endAngle), Math.cos(endAngle));
      branches.push(Object.assign(path, {
        id: main.id + branches.length + 1, width: main.width, surface: branch.surface || 'asphalt',
        sections: [{ id: section.id, start: 0, end: path.length, zone, station: null, scenery: branch.scenery || [], traffic: { density: 0, types: [] }, police: [] }],
        drawnFrom: 0, drawnTo: n, fork: s0, rejoin: s1, side: branch.side || 'right',
        closure: hypot3(dx, dy, dz), endAngle,
      }));
    }
  });
  return branches;
}

/**
 * Distance along the main road equivalent to a position on any road (branches are mapped
 * linearly between their fork and rejoin).
 * @param {TrackPath} path
 * @param {number} s
 * @returns {number}
 */
export function mainDistance(path, s) {
  return path.fork === null ? s : path.fork + (s / path.length) * (path.rejoin - path.fork);
}

/**
 * Interpolates the centerline at distance s (clamped to the path).
 * @param {TrackPath} path
 * @param {number} s meters from the start
 * @param {{x: number, y: number, z: number, heading: number, grade: number, bank: number}} out
 * @returns {typeof out}
 */
export function pathAt(path, s, out) {
  const f = Math.max(0, Math.min(s / path.step, path.count - 1));
  const i = Math.min(Math.floor(f), path.count - 2), t = f - i;
  out.x = path.x[i] + (path.x[i + 1] - path.x[i]) * t;
  out.y = path.y[i] + (path.y[i + 1] - path.y[i]) * t;
  out.z = path.z[i] + (path.z[i + 1] - path.z[i]) * t;
  out.heading = path.heading[i] + (path.heading[i + 1] - path.heading[i]) * t;
  out.grade = path.grade[i] + (path.grade[i + 1] - path.grade[i]) * t;
  out.bank = path.bank[i] + (path.bank[i + 1] - path.bank[i]) * t;
  return out;
}

/**
 * Road cross-section at sample i, left to right: shoulder edge, asphalt edge, edge line inner,
 * center line left/right, edge line inner, asphalt edge, shoulder edge. Lines are coplanar strips
 * of the road surface, so they cannot z-fight with the asphalt.
 * @param {TrackPath} path
 * @param {number} i sample index
 * @returns {number[][]} ROAD_POINTS points [x, y, z]
 */
export function buildRoadRow(path, i) {
  const { shoulder, edgeLine, centerLine } = CONFIG.track;
  const half = path.width / 2;
  const offsets = [
    -half - shoulder, -half, -half + edgeLine, -centerLine / 2,
    centerLine / 2, half - edgeLine, half, half + shoulder,
  ];
  const cosH = Math.cos(path.heading[i]), sinH = Math.sin(path.heading[i]);
  const cosB = Math.cos(path.bank[i]), sinB = Math.sin(path.bank[i]);
  return offsets.map((u) => [
    path.x[i] + cosH * u * cosB,
    path.y[i] - u * sinB,
    path.z[i] + sinH * u * cosB,
  ]);
}

/**
 * Ramp and level of the 7 road strips of the segment starting at sample i.
 * @param {TrackPath} path
 * @param {number} i sample index
 * @returns {Array<[string, number]>}
 */
export function roadPaint(path, i) {
  const c = CONFIG.track;
  if (path.surface === 'gravel') {
    const gravel = ['sand', c.gravelLevel], edge = ['sand', c.gravelLevel - 2];
    return [edge, gravel, gravel, i % 2 ? gravel : ['sand', c.gravelLevel - 1], gravel, gravel, edge];
  }
  const asphalt = ['asphalt', c.asphaltLevel], line = ['roadLine', c.lineLevel];
  const side = path.bridge[i] > 0.5 || path.tunnel[i] > 0.5 ? ['gray', c.bridgeShoulderLevel] : ['sand', c.shoulderLevel];
  const dash = i % c.dashPeriod < c.dashOn ? line : asphalt;
  return [side, line, asphalt, dash, asphalt, line, side];
}
