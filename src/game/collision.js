// SPDX-License-Identifier: AGPL-3.0-or-later
// Collisions of a car with solid scenery. Colliders are 2D shapes on the ground plane (circles
// and oriented boxes) built from the placed scenery; the car is two circles. No DOM or GL.

import { CONFIG } from '../config.js';
import { SCENERY } from '../models/scenery.js';
import { buildGrid, queryCells } from '../engine/grid.js';
import { hypot2 } from '../engine/math3d.js';

const STRIDE = 8; // kind, x, z, radius | half x, half z, axis x, axis z, blocks light
const CIRCLE = 0, BOX = 1;
const hit = { nx: 0, nz: 0, depth: 0 };

const GRID_CELL = 50; // m
const cells = new Array(64);

/**
 * @param {Array<Object<string, number[]>>} placed scenery matrices per chunk (see placeScenery);
 *   chunks of several roads may simply be concatenated
 * @returns {{cell: number, stride: number, cells: Map<number, Float32Array>}} spatial grid of colliders
 */
export function buildColliders(placed) {
  const out = [];
  for (const byName of placed) {
    for (const name of Object.keys(byName)) {
      const def = SCENERY[name], m = byName[name];
      if (!def.solid) continue;
      for (const shape of [].concat(def.collider)) {
        for (let i = 0; i < m.length; i += 16) {
          const scale = hypot2(m[i], m[i + 2]);
          const cx = shape.center ? shape.center[0] : 0, cz = shape.center ? shape.center[1] : 0;
          const x = m[i] * cx + m[i + 8] * cz + m[i + 12], z = m[i + 2] * cx + m[i + 10] * cz + m[i + 14];
          if (shape.type === 'cylinder') out.push(CIRCLE, x, z, shape.radius * scale, 0, 0, 0, 0);
          else out.push(BOX, x, z, (shape.size[0] / 2) * scale, (shape.size[2] / 2) * scale, m[i] / scale, m[i + 2] / scale, def.blocksLight ? 1 : 0);
        }
      }
    }
  }
  return buildGrid(out, STRIDE, GRID_CELL);
}

// Reach of a query around the car: colliders are small except the long segments (10 m).
const QUERY_RADIUS = 12;

// Overlap of a circle with one collider; fills `hit` with the push-out normal and depth.
function overlap(c, o, x, z, radius) {
  const dx = x - c[o + 1], dz = z - c[o + 2];
  if (c[o] === CIRCLE) {
    const dist = hypot2(dx, dz), depth = radius + c[o + 3] - dist;
    if (depth <= 0) return false;
    hit.nx = dist > 0 ? dx / dist : 1; hit.nz = dist > 0 ? dz / dist : 0; hit.depth = depth;
    return true;
  }
  // Box: work in its local frame (local X axis = (ax, az), local Z axis = (-az, ax)).
  const ax = c[o + 5], az = c[o + 6], hx = c[o + 3], hz = c[o + 4];
  const lx = dx * ax + dz * az, lz = -dx * az + dz * ax;
  const px = Math.max(-hx, Math.min(hx, lx)), pz = Math.max(-hz, Math.min(hz, lz));
  let nx = lx - px, nz = lz - pz;
  const dist = hypot2(nx, nz);
  if (dist >= radius) return false;
  if (dist > 0) {
    nx /= dist; nz /= dist; hit.depth = radius - dist;
  } else if (hx - Math.abs(lx) < hz - Math.abs(lz)) {
    // Center inside the box: leave through the nearest side.
    nx = Math.sign(lx) || 1; nz = 0; hit.depth = radius + hx - Math.abs(lx);
  } else {
    nx = 0; nz = Math.sign(lz) || 1; hit.depth = radius + hz - Math.abs(lz);
  }
  hit.nx = nx * ax - nz * az;
  hit.nz = nx * az + nz * ax;
  return true;
}

// Applies one contact (normal and depth in `hit`) to the car; the obstacle moves with (ovx, ovz).
// Returns the impact speed.
function respond(car, sinH, cosH, ovx, ovz) {
  const cfg = CONFIG.collision;
  car.x += hit.nx * hit.depth;
  car.z += hit.nz * hit.depth;
  const vx = car.vLong * sinH + car.vLat * cosH - ovx, vz = -car.vLong * cosH + car.vLat * sinH - ovz;
  const into = -(vx * hit.nx + vz * hit.nz);
  if (into <= 0) return 0;
  // Bounce slightly off the obstacle; friction takes speed along it in proportion to the hit.
  const tx = -hit.nz, tz = hit.nx;
  const along = vx * tx + vz * tz;
  const slide = along - Math.sign(along) * Math.min(Math.abs(along), cfg.friction * into);
  const bx = ovx + hit.nx * into * cfg.restitution + tx * slide, bz = ovz + hit.nz * into * cfg.restitution + tz * slide;
  car.vLong = bx * sinH - bz * cosH;
  car.vLat = bx * cosH + bz * sinH;
  car.yawRate *= 1 - Math.min(1, into / cfg.spinStopSpeed);
  return into;
}

// Tests both circles of the car against one collider and resolves the contacts.
function collideOne(car, c, o, ovx, ovz) {
  const cfg = CONFIG.collision;
  let impact = 0;
  for (let end = -1; end <= 1; end += 2) {
    const sinH = Math.sin(car.heading), cosH = Math.cos(car.heading);
    const x = car.x + sinH * cfg.carOffset * end, z = car.z - cosH * cfg.carOffset * end;
    if (overlap(c, o, x, z, cfg.carRadius)) impact = Math.max(impact, respond(car, sinH, cosH, ovx, ovz));
  }
  return impact;
}

/**
 * Pushes the car out of solid scenery and takes away the velocity into the obstacle.
 * @param {Object} car physics state
 * @param {{cell: number, cells: Map<number, Float32Array>}} grid from buildColliders
 * @returns {number} strongest impact speed in m/s (0 when nothing was hit)
 */
export function collideCar(car, grid) {
  let impact = 0;
  const count = queryCells(grid, car.x, car.z, QUERY_RADIUS, cells);
  for (let k = 0; k < count; k++) {
    const c = cells[k];
    for (let o = 0; o < c.length; o += STRIDE) impact = Math.max(impact, collideOne(car, c, o, 0, 0));
  }
  return impact;
}

/**
 * @param {{cell: number, cells: Map<number, Float32Array>}} grid from buildColliders
 * @param {number} x car center
 * @param {number} z
 * @param {number} heading
 * @returns {boolean} true when a car standing there would touch solid scenery
 */
export function touchesScenery(grid, x, z, heading) {
  const cfg = CONFIG.collision, sinH = Math.sin(heading), cosH = Math.cos(heading);
  const count = queryCells(grid, x, z, QUERY_RADIUS, cells);
  for (let k = 0; k < count; k++) {
    const c = cells[k];
    for (let o = 0; o < c.length; o += STRIDE) {
      for (let end = -1; end <= 1; end += 2) {
        if (overlap(c, o, x + sinH * cfg.carOffset * end, z - cosH * cfg.carOffset * end, cfg.carRadius)) return true;
      }
    }
  }
  return false;
}

const box = new Float32Array(STRIDE);

/**
 * Collides the car with AI vehicles (oriented boxes moving with their own velocity). Vehicles that
 * are hit slow down and stop for a moment.
 * @param {Object} car physics state
 * @param {Array<import('../ai/traffic.js').Agent>} agents
 * @returns {number} strongest impact speed in m/s
 */
export function collideCarWithAgents(car, agents) {
  const cfg = CONFIG.collision, traffic = CONFIG.traffic;
  let impact = 0;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a.active || a.kind === 'player') continue;
    if (Math.abs(a.x - car.x) > cfg.vehicleRange || Math.abs(a.z - car.z) > cfg.vehicleRange) continue;
    const sinA = Math.sin(a.heading), cosA = Math.cos(a.heading);
    box[0] = BOX; box[1] = a.x; box[2] = a.z; box[3] = a.halfWidth; box[4] = a.halfLength; box[5] = cosA; box[6] = sinA;
    const hitSpeed = collideOne(car, box, 0, sinA * a.v, -cosA * a.v);
    // Only a real knock stops the vehicle; a gentle push must not keep it stunned forever.
    if (hitSpeed > cfg.stunSpeed) {
      a.v *= traffic.hitSlowdown;
      a.stun = traffic.stunTime;
    }
    impact = Math.max(impact, hitSpeed);
  }
  return impact;
}

/**
 * How far headlights reach in each angular slice of their wedge before a light-blocking box
 * (building, tunnel wall) stops them. A 1D shadow map computed on the CPU.
 * @param {{cell: number, cells: Map<number, Float32Array>}} grid from buildColliders
 * @param {number} x lamp position
 * @param {number} z
 * @param {number} dirX horizontal unit direction of the beam
 * @param {number} dirZ
 * @param {Float32Array} out reach in meters per slice, from -outer to +outer half angle
 */
export function castLight(grid, x, z, dirX, dirZ, out) {
  const { range, outerDeg } = CONFIG.headlights;
  const count = queryCells(grid, x, z, range, cells);
  const outer = (outerDeg * Math.PI) / 180;
  for (let ray = 0; ray < out.length; ray++) {
    const a = -outer + (ray / (out.length - 1)) * 2 * outer, cosA = Math.cos(a), sinA = Math.sin(a);
    const rx = dirX * cosA - dirZ * sinA, rz = dirX * sinA + dirZ * cosA;
    let reach = range;
    for (let k = 0; k < count; k++) {
      const c = cells[k];
      for (let o = 0; o < c.length; o += STRIDE) {
        if (c[o + 7] === 0) continue;
        // Ray against the box in its local frame (slab test).
        const ax = c[o + 5], az = c[o + 6], dx = x - c[o + 1], dz = z - c[o + 2];
        const ox = dx * ax + dz * az, oz = -dx * az + dz * ax;
        const lx = rx * ax + rz * az, lz = -rx * az + rz * ax;
        const tx1 = (-c[o + 3] - ox) / lx, tx2 = (c[o + 3] - ox) / lx;
        const tz1 = (-c[o + 4] - oz) / lz, tz2 = (c[o + 4] - oz) / lz;
        const near = Math.max(Math.min(tx1, tx2), Math.min(tz1, tz2));
        const far = Math.min(Math.max(tx1, tx2), Math.max(tz1, tz2));
        if (near <= far && far > 0 && near < reach) reach = Math.max(near, 0);
      }
    }
    out[ray] = reach;
  }
}
