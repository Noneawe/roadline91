// SPDX-License-Identifier: AGPL-3.0-or-later
// Rival: an AI car racing the player along the track. It plans its speed from the curves ahead
// (braking in time), follows a racing line inside the asphalt and passes traffic where the other
// lane is free. No DOM or GL.

import { CONFIG } from '../config.js';
import { createAgent, poseAgent, laneFree, leadOf } from './traffic.js';

/**
 * Highest speed at s that still allows braking for every curve within the look-ahead.
 * @param {import('../world/track.js').TrackPath} path
 * @param {number} s
 * @param {number} top top speed in m/s
 * @param {number} latAccel lateral acceleration allowed in curves, m/s^2
 * @param {number} brake deceleration used for planning, m/s^2
 * @param {number} lookAhead m
 * @param {number} step m
 * @returns {number} m/s
 */
export function cornerSpeed(path, s, top, latAccel, brake, lookAhead, step) {
  let target = top;
  for (let d = 0; d <= lookAhead; d += step) {
    const i = Math.max(0, Math.min(path.count - 1, Math.round((s + d) / path.step)));
    const corner = Math.min(top, Math.sqrt(latAccel / Math.max(Math.abs(path.curvature[i]), 1e-4)));
    target = Math.min(target, Math.sqrt(corner * corner + 2 * brake * d));
  }
  return target;
}

/**
 * @param {import('../world/track.js').TrackPath} path
 * @param {{rowU: Float32Array, rowY: Float32Array}} surface
 * @param {string} [difficulty] key of CONFIG.rival.levels
 * @param {number} [grip] weather grip factor: the rival corners and brakes softer in the rain
 * @returns {{agent: import('./traffic.js').Agent, update: (dt: number, all: Array) => void,
 *   reset: (s: number) => void}}
 */
export function createRival(path, surface, difficulty = CONFIG.rival.difficulty, grip = 1) {
  const cfg = CONFIG.rival, level = cfg.levels[difficulty] || cfg.levels.normal;
  const latAccel = level.latAccel * grip, brake = cfg.brake * grip;
  const agent = createAgent('rival');
  agent.type = 'vektorGt';
  agent.paint = cfg.paint;
  agent.halfLength = 2.15;
  // The rival stops at every station like the player does (the player restarts from standstill
  // after each station screen) and then drives on.
  const stops = path.sections.filter((section) => section.station).map((section) => section.end - CONFIG.station.stop);
  let nextStop = 0;
  const curvature = (s) => path.curvature[Math.max(0, Math.min(path.count - 1, Math.round(s / path.step)))];

  function plannedSpeed() {
    if (agent.s > path.length - cfg.finishMargin) return 0;
    let target = cornerSpeed(path, agent.s, level.topSpeed, latAccel, brake, cfg.lookAhead, cfg.lookStep);
    if (nextStop < stops.length) {
      const d = stops[nextStop] - agent.s;
      // Brake to a stop at the station; once standing there, the stop is done.
      if (d <= cfg.stopReach && agent.v < cfg.stopSpeed) nextStop++;
      else target = Math.min(target, Math.sqrt(2 * brake * Math.max(0, d)));
    }
    return target;
  }

  function update(dt, all) {
    if (!agent.active) return;
    let target = plannedSpeed();
    // Racing line: right lane on straights, inside of the coming curve otherwise.
    const k = curvature(agent.s + cfg.lineLook), w = Math.min(1, Math.abs(k) / cfg.lineCurve);
    let wantU = cfg.straightU * (1 - w) + Math.sign(k) * (path.width / 2 - cfg.lineMargin) * w;
    const lead = leadOf(all, agent, wantU, cfg.avoidBand);
    if (lead.agent && lead.gap < cfg.avoidGap + agent.v) {
      const lane = CONFIG.traffic.lane, side = lead.agent.u > 0 ? -lane : lane;
      if (laneFree(all, agent.s, side, cfg.avoidBehind, side < 0 ? cfg.avoidClear : cfg.avoidGap + agent.v, agent, 1)) {
        wantU = side;
      } else {
        wantU = agent.u;
        const current = leadOf(all, agent, agent.u, cfg.avoidBand);
        if (current.agent && current.gap < cfg.avoidGap + agent.v) {
          target = Math.min(target, Math.max(0, current.agent.v * current.agent.dir - (cfg.avoidGap - current.gap) * 0.5));
        }
      }
    }
    if (agent.stun > 0) {
      agent.stun -= dt;
      target = 0;
    }
    const push = level.accel * (1 - (agent.v / level.topSpeed) ** 2) * dt;
    agent.v += Math.max(-brake * dt, Math.min(push, target - agent.v));
    const limit = nextStop < stops.length ? stops[nextStop] : path.length;
    agent.s = Math.min(agent.s + agent.v * dt, Math.max(agent.s, limit));
    agent.u += Math.max(-cfg.latSpeed * dt, Math.min(cfg.latSpeed * dt, wantU - agent.u));
    poseAgent(agent, path, surface);
  }

  function reset(s) {
    agent.active = true;
    agent.s = s; agent.u = cfg.startU; agent.v = 0; agent.stun = 0;
    nextStop = stops.findIndex((stop) => stop > s + cfg.stopReach);
    if (nextStop < 0) nextStop = stops.length;
    poseAgent(agent, path, surface);
  }

  return { agent, update, reset };
}
