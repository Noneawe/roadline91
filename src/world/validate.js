// SPDX-License-Identifier: AGPL-3.0-or-later
// Track validator: checks the data (zones, objects, vehicles, stations, branches) and the built
// geometry (branches meet the main road, no road runs into itself or another road). No DOM or GL.

import { CONFIG } from '../config.js';
import { ZONES } from '../data/zones.js';
import { SCENERY } from '../models/scenery.js';
import { VEHICLES } from '../models/traffic.js';
import { buildRoads } from './roads.js';
import { hypot2 } from '../engine/math3d.js';

const MAX_CLOSURE = 0.08; // share of the branch length the data may miss the rejoin point by
const MAX_JOIN_ANGLE = 0.6; // rad between a branch and the main road where they meet
const MIN_SEPARATION = 25; // m between two parts of the road that are not neighbours
const MAX_JUNCTION = 0.4; // share of a branch that may overlap the main road
const SURFACES = ['asphalt', 'gravel'];

function checkRules(errors, where, rules) {
  for (const rule of rules || []) {
    if (!SCENERY[rule.obj]) errors.push(`${where}: unknown scenery object ${rule.obj}`);
    if (!['every', 'at'].includes(rule.rule)) errors.push(`${where}: unknown scenery rule ${rule.rule}`);
  }
}

function checkPieces(errors, where, pieces) {
  if (!pieces || pieces.length === 0) errors.push(`${where}: no pieces`);
  for (const piece of pieces || []) {
    for (const key of ['len', 'curve', 'grade', 'bank']) {
      if (piece[key] !== undefined && !Number.isFinite(piece[key])) errors.push(`${where}: piece ${key} is not a number`);
    }
    if (!(piece.len > 0)) errors.push(`${where}: piece without length`);
    if (piece.zone !== undefined && !ZONES[piece.zone]) errors.push(`${where}: unknown zone ${piece.zone}`);
  }
}

function checkData(track, errors) {
  const ids = new Set();
  track.sections.forEach((section, k) => {
    const where = `section ${section.id}`;
    if (ids.has(section.id)) errors.push(`${where}: duplicate id`);
    ids.add(section.id);
    if (!ZONES[section.zone]) errors.push(`${where}: unknown zone ${section.zone}`);
    if (!(section.width > 0)) errors.push(`${where}: invalid width`);
    if (!section.station) errors.push(`${where}: no station at the end`);
    const next = k + 1 < track.sections.length ? track.sections[k + 1].id : null;
    if ((section.next === undefined ? null : section.next) !== next) errors.push(`${where}: next should be ${next}`);
    checkPieces(errors, where, section.pieces);
    checkRules(errors, where, section.scenery);
    for (const type of (section.traffic || {}).types || []) if (!VEHICLES[type]) errors.push(`${where}: unknown vehicle ${type}`);
    for (const unit of section.police || []) {
      if (!(unit.radarRange > 0 && unit.limit > 0 && unit.pos >= 0)) errors.push(`${where}: invalid police unit`);
    }
    for (const branch of section.branches || []) {
      const at = `${where} branch at ${branch.at}`;
      checkPieces(errors, at, branch.pieces);
      checkRules(errors, at, branch.scenery);
      if (!SURFACES.includes(branch.surface || 'asphalt')) errors.push(`${at}: unknown surface ${branch.surface}`);
      if (!branch.rejoin || !track.sections.some((s) => s.id === branch.rejoin.section)) errors.push(`${at}: rejoins an unknown section`);
    }
  });
}

// Any two samples closer than the limit that are not neighbours along the same road.
function checkSeparation(roads, errors) {
  const cell = MIN_SEPARATION, cells = new Map(), key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  for (const road of roads) {
    for (let i = road.drawnFrom; i <= road.drawnTo; i++) {
      if (road.junction[i]) continue;
      const k = key(road.x[i], road.z[i]);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push([road, i]);
    }
  }
  const reported = new Set();
  for (const road of roads) {
    for (let i = road.drawnFrom; i <= road.drawnTo; i++) {
      if (road.junction[i]) continue;
      const cx = Math.floor(road.x[i] / cell), cz = Math.floor(road.z[i] / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const [other, j] of cells.get(`${cx + dx},${cz + dz}`) || []) {
            const d = hypot2(other.x[j] - road.x[i], other.z[j] - road.z[i]);
            const sameRoad = other === road;
            const limit = sameRoad ? MIN_SEPARATION : CONFIG.track.junctionGap - 1;
            if (d >= limit || (sameRoad && Math.abs(i - j) * road.step < 2 * d + 40)) continue;
            const id = `${road.id}/${other.id}/${Math.round(i / 20)}`;
            if (reported.has(id)) continue;
            reported.add(id);
            errors.push(`road ${road.id} at ${Math.round(i * road.step)} m comes within ${d.toFixed(0)} m of road ${other.id} at ${Math.round(j * other.step)} m`);
          }
        }
      }
    }
  }
}

/**
 * @param {Object} track track data (see data/track-main.js and CLAUDE.md section 11)
 * @returns {string[]} problems found; empty when the track is valid
 */
export function validateTrack(track) {
  const errors = [];
  if (!track.sections || track.sections.length === 0) return ['track has no sections'];
  checkData(track, errors);
  if (errors.length > 0) return errors;
  const roads = buildRoads(track);
  for (const road of roads.slice(1)) {
    const where = `branch ${road.id} (fork at ${Math.round(road.fork)} m)`;
    if (road.rejoin <= road.fork + 200) errors.push(`${where}: rejoins before it leaves`);
    if (road.closure > road.length * MAX_CLOSURE) errors.push(`${where}: misses the rejoin point by ${road.closure.toFixed(0)} m`);
    if (Math.abs(road.endAngle) > MAX_JOIN_ANGLE) errors.push(`${where}: meets the main road at ${(road.endAngle * 57.3).toFixed(0)} deg`);
    if (road.junction.reduce((n, v) => n + v, 0) / road.count > MAX_JUNCTION) errors.push(`${where}: runs along the main road for too long`);
  }
  checkSeparation(roads, errors);
  return errors;
}
