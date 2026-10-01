// SPDX-License-Identifier: AGPL-3.0-or-later
// Race rules that do not depend on rendering: where to put the player back after a crash.

import { CONFIG } from '../config.js';
import { pathAt } from '../world/track.js';
import { touchesScenery } from './collision.js';

const sample = {};

/**
 * Finds a restart point at or behind `s` in the player's lane that is clear of solid scenery, has
 * no vehicle close in that lane and nothing coming the wrong way towards it. If the search fails,
 * the vehicles around the last candidate are removed so the point becomes safe.
 * @param {import('../world/track.js').TrackPath} path
 * @param {Object} colliders scenery collider grid
 * @param {Array<import('../ai/traffic.js').Agent>} agents
 * @param {number} s where the crash happened
 * @returns {number} distance along the track for the restart
 */
export function findRestart(path, colliders, agents, s) {
  const cfg = CONFIG.crash, lane = CONFIG.race.startU, tolerance = CONFIG.traffic.laneTolerance;
  const blocking = (a, at) => {
    if (!a.active || a.kind === 'player' || Math.abs(a.u - lane) >= tolerance) return false;
    const d = a.s - at;
    return (d > -cfg.clearBehind && d < cfg.clearAhead) || (a.dir < 0 && d > 0 && d < cfg.oncomingClear);
  };
  let at = s;
  for (let back = 0; back <= cfg.maxBack; back += cfg.backStep) {
    at = Math.max(CONFIG.race.startS, s - back);
    const p = pathAt(path, at, sample);
    const x = p.x + Math.cos(p.heading) * lane, z = p.z + Math.sin(p.heading) * lane;
    if (!touchesScenery(colliders, x, z, p.heading) && !agents.some((a) => blocking(a, at))) return at;
  }
  for (const a of agents) if (blocking(a, at)) a.active = false;
  return at;
}
