// SPDX-License-Identifier: AGPL-3.0-or-later
// Replay: a ring buffer of the last minute of the race, one frame per physics step. A frame holds
// the player's car pose and gauges, every AI vehicle's pose and look, the race clock and the time
// of day. Playback writes frames back into the same objects. No DOM or GL.

import { CONFIG } from '../config.js';
import { RAMP, RAMP_NAMES } from '../gfx/palette.js';

const CAR_FIELDS = ['x', 'y', 'z', 'heading', 'pitch', 'roll', 'rpm', 'vLong', 'gear', 'accelLong', 'accelLat'];
const AGENT_FIELDS = ['x', 'y', 'z', 'heading', 'pitch', 'roll'];
// Per agent after the pose: active, type, paint, lights.
const AGENT_STRIDE = AGENT_FIELDS.length + 4;
const HEADER = 2; // race time, time-of-day index

/**
 * @param {Object[]} agents AI vehicles recorded every frame (fixed list)
 * @param {string[]} types vehicle type names (mesh keys) an agent may have
 * @param {number} [steps] frames kept (default CONFIG.replay.seconds at the physics rate)
 * @param {Float32ArrayConstructor|Float64ArrayConstructor} [Store] Float64Array for exact snapshots
 * @returns {Object} replay: record(car, time, timeIndex), apply(n, car, out), clear(), count
 */
export function createReplay(agents, types, steps = Math.round(CONFIG.replay.seconds / CONFIG.loop.step), Store = Float32Array) {
  const stride = HEADER + CAR_FIELDS.length + agents.length * AGENT_STRIDE;
  const data = new Store(steps * stride);
  const typeIndex = new Map(types.map((t, i) => [t, i]));
  let head = 0, count = 0;
  // Race times are stored relative to the first recorded frame (Float32 precision).
  let base = 0;

  return {
    get count() { return count; },
    /** Drops all frames (new race). */
    clear() {
      head = count = 0;
    },
    /**
     * @param {Object} car physics state
     * @param {number} time race clock
     * @param {number} timeIndex time-of-day index
     */
    record(car, time, timeIndex) {
      if (count === 0) base = time;
      let o = head * stride;
      data[o++] = time - base;
      data[o++] = timeIndex;
      for (let i = 0; i < CAR_FIELDS.length; i++) data[o++] = car[CAR_FIELDS[i]];
      for (let a = 0; a < agents.length; a++) {
        const agent = agents[a];
        for (let i = 0; i < AGENT_FIELDS.length; i++) data[o++] = agent[AGENT_FIELDS[i]];
        data[o++] = agent.active ? 1 : 0;
        data[o++] = typeIndex.get(agent.type);
        data[o++] = RAMP[agent.paint];
        data[o++] = agent.lightsOn ? 1 : 0;
      }
      head = (head + 1) % steps;
      count = Math.min(steps, count + 1);
    },
    /**
     * Writes frame `n` (0 = oldest kept) into the car and the agents.
     * @param {number} n
     * @param {Object} car
     * @param {{time: number, timeIndex: number}} out
     * @returns {{time: number, timeIndex: number}} clock and time of day of the frame
     */
    apply(n, car, out) {
      let o = ((head - count + Math.max(0, Math.min(count - 1, n)) + steps) % steps) * stride;
      out.time = data[o++] + base;
      out.timeIndex = data[o++];
      for (let i = 0; i < CAR_FIELDS.length; i++) car[CAR_FIELDS[i]] = data[o++];
      for (let a = 0; a < agents.length; a++) {
        const agent = agents[a];
        for (let i = 0; i < AGENT_FIELDS.length; i++) agent[AGENT_FIELDS[i]] = data[o++];
        agent.active = data[o++] > 0.5;
        agent.type = types[data[o++]];
        agent.paint = RAMP_NAMES[data[o++]];
        agent.lightsOn = data[o++] > 0.5;
      }
      return out;
    },
  };
}
