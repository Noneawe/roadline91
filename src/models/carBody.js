// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared car body builders: a loft through cross-section stations, wheels, light quads and a
// box-based low-detail (LOD) model. Front of every vehicle is -Z, y = 0 at axle height.

import { EMIT } from './loader.js';
import { addBox, addPrismX } from './shapes.js';

const RING = 6;
const DETAIL = 0.06; // m flat lights stand off the body

/**
 * Appends a body lofted through stations [z, sill half width, sill y, belt half width, belt y,
 * top half width, top y] (front to back), closed by a front and a rear cap.
 * @param {{verts: number[][], faces: Array}} def
 * @param {number[][]} stations
 * @param {Array<[string, number, string, number]>} segments per segment between stations:
 *   top ramp, top level, upper side ramp, upper side level
 * @param {[string, number]} front ramp and level of the front cap
 * @param {[string, number]} rear ramp and level of the rear cap
 */
export function addLoft(def, stations, segments, front, rear) {
  const base = def.verts.length;
  for (const [z, w0, y0, w1, y1, w2, y2] of stations) {
    def.verts.push([w0, y0, z], [w1, y1, z], [w2, y2, z], [-w2, y2, z], [-w1, y1, z], [-w0, y0, z]);
  }
  segments.forEach(([topRamp, topLevel, sideRamp, sideLevel], s) => {
    const paint = [
      ['body', 12], [sideRamp, sideLevel], [topRamp, topLevel],
      [sideRamp, sideLevel], ['body', 12], ['gray', 3],
    ];
    for (let k = 0; k < RING; k++) {
      const a = base + s * RING + k, b = base + s * RING + ((k + 1) % RING);
      def.faces.push([a, b, b + RING, a + RING, paint[k][0], paint[k][1], 0]);
    }
  });
  const last = base + (stations.length - 1) * RING;
  def.faces.push([base + 5, base + 4, base + 3, base + 2, base + 1, base, front[0], front[1], 0]);
  def.faces.push([last, last + 1, last + 2, last + 3, last + 4, last + 5, rear[0], rear[1], 0]);
}

/**
 * Appends a quad in a plane of constant z, facing +Z (facing = 1) or -Z (facing = -1).
 * @param {{verts: number[][], faces: Array}} def
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} z
 * @param {number} facing
 * @param {string} ramp
 * @param {number} level
 * @param {number} flags
 */
export function addQuadZ(def, x0, y0, x1, y1, z, facing, ramp, level, flags) {
  const b = def.verts.length;
  def.verts.push([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]);
  def.faces.push(facing > 0 ? [b, b + 1, b + 2, b + 3, ramp, level, flags] : [b + 3, b + 2, b + 1, b, ramp, level, flags]);
}

/**
 * Appends a pair of emissive light quads, mirrored left and right.
 * @param {{verts: number[][], faces: Array}} def
 * @param {number} z plane of the lights
 * @param {number} facing 1 = rear (+Z), -1 = front (-Z)
 * @param {number[]} rect [inner x, y0, outer x, y1]
 * @param {string} ramp
 * @param {number} level
 */
export function addLightPair(def, z, facing, rect, ramp, level) {
  addQuadZ(def, rect[0], rect[1], rect[2], rect[3], z, facing, ramp, level, EMIT);
  addQuadZ(def, -rect[2], rect[1], -rect[0], rect[3], z, facing, ramp, level, EMIT);
}

/**
 * Appends wheels on both sides for each axle.
 * @param {{verts: number[][], faces: Array}} def
 * @param {number[]} axles z of each axle
 * @param {number} x0 inner x of the right wheel
 * @param {number} x1 outer x of the right wheel
 * @param {number} radius
 * @param {number} sides
 * @param {boolean} [caps]
 */
export function addWheels(def, axles, x0, x1, radius, sides, caps = true) {
  for (const z of axles) {
    addPrismX(def, x0, x1, 0, z, radius, sides, ['gray', 4], ['gray', 10], caps);
    addPrismX(def, -x1, -x0, 0, z, radius, sides, ['gray', 4], ['gray', 10], caps);
  }
}

/**
 * Builds a full vehicle and its box LOD from one description.
 * @param {Object} c name, stations, segments, front/rear cap paints, wheels {axles, x0, x1,
 *   radius, sides}, lights {front: rect, rear: rect}, rearZ (plane of the rear lights), extra(def),
 *   lodBoxes [[min, max, ramp, level]], lodAxles, lodDistance, collider size
 * @returns {{def: Object, lod: Object}} model definitions
 */
export function buildVehicle(c) {
  const frontZ = c.stations[0][0], rearZ = c.rearZ === undefined ? c.stations[c.stations.length - 1][0] : c.rearZ;
  const common = { wheelRadius: c.wheels.radius, solid: true, collider: { type: 'box', size: c.size } };
  const def = { name: c.name, verts: [], faces: [], lod: [{ dist: c.lodDistance, model: `${c.name}Lod` }], ...common };
  addLoft(def, c.stations, c.segments, c.front, c.rear);
  if (c.extra) c.extra(def);
  addLightPair(def, frontZ - DETAIL, -1, c.lights.front, 'lights', 14);
  addLightPair(def, rearZ + DETAIL, 1, c.lights.rear, 'paint1', 12);
  addWheels(def, c.wheels.axles, c.wheels.x0, c.wheels.x1, c.wheels.radius, c.wheels.sides);
  const lod = { name: `${c.name}Lod`, verts: [], faces: [], ...common };
  for (const [min, max, ramp, level] of c.lodBoxes) addBox(lod, min, max, ramp, level);
  addLightPair(lod, rearZ + DETAIL, 1, c.lights.rear, 'paint1', 12);
  addLightPair(lod, frontZ - DETAIL, -1, c.lights.front, 'lights', 14);
  addWheels(lod, c.lodAxles || c.wheels.axles, c.wheels.x0, c.wheels.x1, c.wheels.radius, 4, false);
  return { def, lod };
}
