// SPDX-License-Identifier: AGPL-3.0-or-later
// Police: patrol cars parked along the track (from section data) with a radar. A car passing
// faster than the limit is chased: the patrol car follows, overtakes, cuts in and slows down until
// the player stops (ticket) or gets far enough ahead (escape). No DOM or GL.

import { CONFIG } from '../config.js';
import { createAgent, poseAgent, laneFree, leadOf } from './traffic.js';
import { cornerSpeed } from './rival.js';
import { POLICE } from '../models/traffic.js';

/**
 * @param {import('../world/track.js').TrackPath} path
 * @param {{rowU: Float32Array, rowY: Float32Array}} surface
 * @returns {{agents: Array, update: Function, detector: Function, reset: Function}}
 */
export function createPolice(path, surface) {
  const cfg = CONFIG.police, lane = CONFIG.traffic.lane, half = path.width / 2;
  const size = POLICE.police.def.collider.size;
  const units = [];
  for (const section of path.sections) {
    for (const unit of section.police) {
      const agent = createAgent('police');
      Object.assign(agent, { type: 'police', paint: 'paint4', halfWidth: size[0] / 2, halfLength: size[2] / 2 });
      units.push({
        agent, s: section.start + unit.pos, radarRange: unit.radarRange, limit: unit.limit,
        u: (unit.side === 'left' ? -1 : 1) * (half + CONFIG.track.shoulder * cfg.parkOffset),
        // idle (not placed) | parked | chase | done
        state: 'idle', phase: 'follow', side: 0, caughtKmh: 0,
      });
    }
  }
  const agents = units.map((unit) => unit.agent);

  function drive(unit, all, player, dt) {
    const a = unit.agent, gap = player.s - a.s - a.halfLength - player.halfLength;
    let target = cornerSpeed(path, a.s, cfg.topSpeed, cfg.latAccel, cfg.brake, cfg.lookAhead, cfg.lookStep);
    let wantU = Math.max(-lane, Math.min(lane, player.u));
    if (unit.state === 'done' || unit.phase === 'wait') {
      // Parked cars wait on the shoulder until the speeder has passed them; after a chase the
      // car pulls over to the shoulder so it never blocks the road.
      target = 0;
      wantU = unit.state === 'done' ? Math.sign(unit.u) * Math.abs(unit.u) : a.u;
      if (unit.phase === 'wait' && gap > 0) unit.phase = 'follow';
    } else if (unit.phase === 'follow') {
      if (gap < cfg.followGap) target = Math.min(target, Math.max(0, player.v));
      if (gap < cfg.passGap && a.v > player.v - cfg.blockSlow) {
        const side = player.u > 0 ? -lane : lane;
        if (laneFree(all, a.s, side, cfg.followGap, side < 0 ? cfg.passClear : cfg.passGap * 2, a, 1)) {
          unit.phase = 'pass';
          unit.side = side;
        }
      }
    } else if (unit.phase === 'pass') {
      wantU = unit.side;
      if (!laneFree(all, a.s, unit.side, 0, cfg.passGap * 2, a, 1)) unit.phase = 'follow';
      if (gap < -cfg.passAhead) unit.phase = 'block';
    } else {
      // Blocking: in front of the player, slower than the player, waiting if left behind.
      target = Math.min(target, gap < -cfg.waitDistance ? 0 : Math.max(0, player.v - cfg.blockSlow));
      if (gap > 0) unit.phase = 'follow';
    }
    // Never drive into other vehicles in the lane being used.
    const lead = leadOf(all, a, wantU, CONFIG.traffic.laneTolerance);
    if (lead.agent && lead.agent.kind !== 'player' && lead.gap < cfg.followGap + a.v) {
      target = Math.min(target, Math.max(0, lead.agent.v * lead.agent.dir));
    }
    if (a.stun > 0) {
      a.stun -= dt;
      target = 0;
    }
    const push = cfg.accel * (1 - (a.v / cfg.topSpeed) ** 2) * dt;
    a.v += Math.max(-cfg.brake * dt, Math.min(push, target - a.v));
    a.s = Math.min(a.s + a.v * dt, path.length);
    a.u += Math.max(-cfg.latSpeed * dt, Math.min(cfg.latSpeed * dt, wantU - a.u));
  }

  /**
   * @param {number} dt
   * @param {Array} all every agent (for traffic avoidance)
   * @param {import('./traffic.js').Agent} player stand-in of the player's car
   * @param {number} playerKmh the player's speed shown on the speedometer
   * @returns {Object|null} the unit that stopped the player (ticket), otherwise null
   */
  function update(dt, all, player, playerKmh) {
    let ticket = null;
    for (const unit of units) {
      const a = unit.agent, ahead = unit.s - player.s;
      if (unit.state === 'idle') {
        if (ahead < cfg.activateDistance && ahead > -cfg.stopDistance) {
          unit.state = 'parked';
          Object.assign(a, { active: true, s: unit.s, u: unit.u, v: 0, dir: 1, stun: 0 });
        }
      } else if (unit.state === 'parked') {
        if (ahead > -CONFIG.traffic.edgeMargin && ahead <= unit.radarRange && playerKmh > unit.limit) {
          unit.state = 'chase';
          unit.phase = 'wait';
          unit.caughtKmh = playerKmh;
        } else if (ahead < -cfg.activateDistance) {
          unit.state = 'done';
        }
      } else {
        drive(unit, all, player, dt);
        const behind = player.s - a.s;
        if (unit.state === 'chase' && behind > cfg.escapeDistance) unit.state = 'done';
        if (unit.state === 'chase' && player.v < cfg.stopSpeed && Math.abs(behind) < cfg.stopDistance) {
          unit.state = 'done';
          ticket = unit;
        }
        if (unit.state === 'done' && Math.abs(behind) > cfg.activateDistance) a.active = false;
      }
      a.lightsOn = unit.state === 'chase';
      a.sirenOn = a.lightsOn; // used by the audio from stage 8
      if (a.active) poseAgent(a, path, surface);
    }
    return ticket;
  }

  /**
   * Radar detector reading: 0 = nothing, rising towards 1 as a working radar gets near, 1 inside
   * its range or during a chase.
   * @param {number} s the player's distance along the track
   * @returns {number}
   */
  function detector(s) {
    let signal = 0;
    for (const unit of units) {
      if (unit.state === 'chase') return 1;
      if (unit.state !== 'parked' && unit.state !== 'idle') continue;
      const ahead = unit.s - s;
      if (ahead < -CONFIG.traffic.edgeMargin || ahead > unit.radarRange + cfg.detectorExtra) continue;
      signal = Math.max(signal, Math.min(1, 1 - (ahead - unit.radarRange) / cfg.detectorExtra));
    }
    return signal;
  }

  function reset() {
    for (const unit of units) {
      unit.state = 'idle';
      unit.agent.active = false;
      unit.agent.lightsOn = unit.agent.sirenOn = false;
    }
  }

  return { agents, units, update, detector, reset };
}
