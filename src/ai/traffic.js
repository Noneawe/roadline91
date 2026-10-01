// SPDX-License-Identifier: AGPL-3.0-or-later
// Traffic: a pool of vehicles driving in both directions around the player. Vehicles live in
// track space (distance s, lateral offset u), keep their lane, slow down for curves and for
// whatever is ahead, and occasionally overtake. No DOM or GL.

import { CONFIG } from '../config.js';
import { createRng } from '../engine/rng.js';
import { pathAt } from '../world/track.js';
import { heightAt } from '../world/surface.js';
import { VEHICLES } from '../models/traffic.js';

/**
 * @typedef {Object} Agent a vehicle in track space (traffic, rival or the player's stand-in)
 * @property {boolean} active
 * @property {string} kind 'traffic' | 'rival' | 'player'
 * @property {string} type model name
 * @property {string} paint ramp name
 * @property {number} s distance along the track in meters
 * @property {number} u lateral offset in meters, positive right
 * @property {number} v speed in m/s along its own direction
 * @property {number} dir 1 = with the track, -1 = oncoming
 * @property {number} halfLength
 * @property {number} halfWidth
 */

/**
 * @param {string} kind
 * @returns {Agent} inactive agent with all fields present
 */
export function createAgent(kind) {
  return {
    active: false, kind, type: 'sedan', paint: 'paint1',
    s: 0, u: 0, targetU: 0, lane: 0, v: 0, dir: 1, cruise: 0,
    stuck: 0, overtaking: false, stun: 0, idle: 0, wait: 0,
    glow: 0, // 0-1 headlight strength ramp at night
    halfLength: 2.2, halfWidth: 0.9, wheelRadius: 0.3,
    x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0,
  };
}

const sample = {};

/**
 * World pose of an agent from its track position.
 * @param {Agent} a
 * @param {import('../world/track.js').TrackPath} path
 * @param {{rowU: Float32Array, rowY: Float32Array}} surface
 */
export function poseAgent(a, path, surface) {
  const p = pathAt(path, a.s, sample);
  a.x = p.x + Math.cos(p.heading) * a.u;
  a.z = p.z + Math.sin(p.heading) * a.u;
  a.y = heightAt(path, surface, a.s, a.u);
  a.heading = p.heading + (a.dir < 0 ? Math.PI : 0);
  a.pitch = Math.atan(p.grade) * a.dir;
  a.roll = p.bank * a.dir;
}

/**
 * @param {Agent[]} all
 * @param {number} s
 * @param {number} u lane center to check
 * @param {number} behind meters that must be free behind s (along dir)
 * @param {number} ahead meters that must be free ahead
 * @param {Agent} self agent to ignore
 * @param {number} dir direction "ahead" refers to
 * @returns {boolean}
 */
export function laneFree(all, s, u, behind, ahead, self, dir) {
  const tolerance = CONFIG.traffic.laneTolerance;
  for (let i = 0; i < all.length; i++) {
    const b = all[i];
    if (!b.active || b === self || Math.abs(b.u - u) >= tolerance) continue;
    const d = (b.s - s) * dir;
    if (d > -behind && d < ahead) return false;
  }
  return true;
}

const found = { agent: null, gap: 0 };

/**
 * Nearest vehicle ahead of `a` within a lateral band around `u`.
 * @param {Agent[]} all
 * @param {Agent} a
 * @param {number} u
 * @param {number} band
 * @returns {{agent: Agent|null, gap: number}} shared result object; gap is bumper to bumper
 */
export function leadOf(all, a, u, band) {
  found.agent = null;
  found.gap = Infinity;
  for (let i = 0; i < all.length; i++) {
    const b = all[i];
    if (!b.active || b === a || Math.abs(b.u - u) >= band) continue;
    const gap = (b.s - a.s) * a.dir - a.halfLength - b.halfLength;
    if (gap > -a.halfLength && gap < found.gap) {
      found.agent = b;
      found.gap = gap;
    }
  }
  return found;
}

/**
 * Keeps AI vehicles from overlapping: the one behind is held back, head-on pairs stop.
 * @param {Agent[]} all
 */
export function separateAgents(all) {
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    if (!a.active || a.kind === 'player') continue;
    for (let j = i + 1; j < all.length; j++) {
      const b = all[j];
      if (!b.active || b.kind === 'player') continue;
      const reach = a.halfLength + b.halfLength + 0.5;
      if (Math.abs(a.u - b.u) >= a.halfWidth + b.halfWidth + 0.2 || Math.abs(a.s - b.s) >= reach) continue;
      const overlap = reach - Math.abs(a.s - b.s);
      if (a.dir === b.dir) {
        const rear = (b.s - a.s) * a.dir > 0 ? a : b, front = rear === a ? b : a;
        rear.s -= overlap * rear.dir;
        rear.v = Math.min(rear.v, front.v);
      } else {
        const sign = a.s < b.s ? -1 : 1;
        a.s += (sign * overlap) / 2;
        b.s -= (sign * overlap) / 2;
        a.v = b.v = 0;
      }
    }
  }
}

/**
 * @param {import('../world/track.js').TrackPath} path
 * @param {{rowU: Float32Array, rowY: Float32Array}} surface
 * @param {number} seed
 * @returns {{agents: Agent[], update: (dt: number, all: Agent[], player: Agent) => void, reset: () => void}}
 */
export function createTraffic(path, surface, seed) {
  const cfg = CONFIG.traffic;
  let rng = createRng(seed), filling = true;
  const agents = Array.from({ length: cfg.pool }, () => createAgent('traffic'));

  function sectionAt(s) {
    let k = 0;
    while (k < path.sections.length - 1 && s >= path.sections[k].end) k++;
    return path.sections[k];
  }

  function spawn(a, index, all, player) {
    a.active = false;
    a.wait = cfg.wait;
    const { density, types } = sectionAt(player.s).traffic;
    if (index >= Math.round(cfg.pool * density) || types.length === 0) return;
    const dir = rng() < cfg.oncomingShare ? -1 : 1;
    let s = player.s + cfg.spawnAhead + rng() * cfg.spawnSpread;
    if (filling) s = player.s + cfg.spawnBehind / 2 + rng() * cfg.spawnAhead;
    else if (dir > 0 && rng() < cfg.behindShare) s = player.s - cfg.spawnBehind;
    const lane = dir * cfg.lane;
    if (s < cfg.edgeMargin || s > path.length - cfg.edgeMargin) return;
    if (!laneFree(all, s, lane, cfg.minSpawnGap, cfg.minSpawnGap, a, 1)) return;
    const type = types[Math.floor(rng() * types.length)], vehicle = VEHICLES[type];
    const size = vehicle.def.collider.size;
    a.type = type;
    a.paint = cfg.paints[Math.floor(rng() * cfg.paints.length)];
    a.halfWidth = size[0] / 2;
    a.halfLength = size[2] / 2;
    a.wheelRadius = vehicle.def.wheelRadius;
    a.cruise = vehicle.cruise[0] + (vehicle.cruise[1] - vehicle.cruise[0]) * rng();
    a.s = s; a.u = a.targetU = a.lane = lane; a.dir = dir; a.v = a.cruise;
    a.stuck = a.stun = a.idle = 0;
    a.overtaking = false;
    a.active = true;
  }

  function drive(a, all, dt) {
    const i = Math.min(Math.round(a.s / path.step), path.count - 1);
    const curve = Math.abs(path.curvature[i]);
    let target = Math.min(a.cruise * (a.overtaking ? cfg.overtakeBoost : 1), Math.sqrt(cfg.latAccel / Math.max(curve, 1e-4)));
    const lead = leadOf(all, a, a.u, cfg.laneTolerance);
    let blocked = false;
    if (lead.agent) {
      const leadSpeed = lead.agent.v * lead.agent.dir * a.dir;
      // Headway plus the distance needed to brake down to the speed of the vehicle ahead.
      const closing = Math.max(0, a.v * a.v - Math.max(0, leadSpeed) ** 2) / (2 * cfg.brake * cfg.brakeReserve);
      const safe = cfg.followMin + a.v * cfg.followTime + closing;
      if (lead.gap < safe) target = Math.min(target, Math.max(0, leadSpeed - (safe - lead.gap) * cfg.followGain));
      blocked = lead.gap < safe * 2 && leadSpeed < a.cruise - cfg.overtakeSlower;
    }
    a.stuck = blocked && !a.overtaking ? a.stuck + dt : 0;
    if (a.overtaking) {
      const oncoming = !laneFree(all, a.s, -a.lane, 0, cfg.overtakeAbort, a, a.dir);
      if (oncoming || laneFree(all, a.s, a.lane, cfg.passMargin, cfg.passMargin * 2, a, a.dir)) {
        a.overtaking = false;
        a.targetU = a.lane;
      }
    } else if (a.stuck > cfg.overtakePatience && rng() < cfg.overtakeChance * dt && curve < cfg.overtakeMaxCurve
      && laneFree(all, a.s, -a.lane, cfg.passMargin, cfg.overtakeClear, a, a.dir)) {
      a.overtaking = true;
      a.targetU = -a.lane;
    }
    if (a.stun > 0) {
      a.stun -= dt;
      target = 0;
    }
    a.v += Math.max(-cfg.brake * dt, Math.min(cfg.accel * dt, target - a.v));
    a.s += a.dir * a.v * dt;
    a.u += Math.max(-cfg.latSpeed * dt, Math.min(cfg.latSpeed * dt, a.targetU - a.u));
    a.idle = a.v < 1 ? a.idle + dt : 0;
  }

  function update(dt, all, player) {
    for (let k = 0; k < agents.length; k++) {
      const a = agents[k];
      if (!a.active) {
        a.wait -= dt;
        if (a.wait <= 0) spawn(a, k, all, player);
        continue;
      }
      drive(a, all, dt);
      const d = a.s - player.s;
      const gone = d > cfg.spawnAhead + cfg.spawnSpread + cfg.despawnMargin || d < -cfg.spawnBehind - cfg.despawnMargin;
      const offTrack = a.s < cfg.edgeMargin || a.s > path.length - cfg.edgeMargin;
      if (gone || offTrack || (a.idle > cfg.idleTime && Math.abs(d) > cfg.idleDistance)) a.active = false;
    }
    filling = false;
    separateAgents(all);
    for (let k = 0; k < agents.length; k++) if (agents[k].active) poseAgent(agents[k], path, surface);
  }

  function reset() {
    rng = createRng(seed);
    filling = true;
    for (const a of agents) { a.active = false; a.wait = 0; }
  }

  return { agents, update, reset };
}
