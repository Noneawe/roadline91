// SPDX-License-Identifier: AGPL-3.0-or-later
// Helpers that append simple solids (box, prism) to a model definition as plain verts/faces data.

// Corner index bits: 1 = max x, 2 = max y, 4 = max z. Faces CCW seen from outside.
const BOX_FACES = [
  [4, 5, 7, 6], [1, 0, 2, 3], [5, 1, 3, 7], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4],
];

/**
 * Appends an axis-aligned box.
 * @param {{verts: number[][], faces: Array}} def
 * @param {number[]} min [x, y, z]
 * @param {number[]} max [x, y, z]
 * @param {string} ramp
 * @param {number} level
 * @param {number} [flags]
 */
export function addBox(def, min, max, ramp, level, flags = 0) {
  const base = def.verts.length;
  for (let i = 0; i < 8; i++) {
    def.verts.push([i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);
  }
  for (const q of BOX_FACES) def.faces.push([...q.map((i) => base + i), ramp, level, flags]);
}

/**
 * Appends a closed regular prism with its axis along X (a wheel).
 * @param {{verts: number[][], faces: Array}} def
 * @param {number} x0 lower x of the axis
 * @param {number} x1 upper x of the axis
 * @param {number} cy axis y
 * @param {number} cz axis z
 * @param {number} radius
 * @param {number} sides
 * @param {[string, number]} side ramp and level of the side faces
 * @param {[string, number]} cap ramp and level of both caps
 * @param {boolean} [caps] false leaves the ends open
 */
export function addPrismX(def, x0, x1, cy, cz, radius, sides, side, cap, caps = true) {
  const base = def.verts.length;
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2;
    const y = cy + radius * Math.cos(a), z = cz + radius * Math.sin(a);
    def.verts.push([x0, y, z], [x1, y, z]);
  }
  const low = [], high = [];
  for (let k = 0; k < sides; k++) {
    const a = base + k * 2, b = base + ((k + 1) % sides) * 2;
    def.faces.push([a, b, b + 1, a + 1, side[0], side[1], 0]);
    low.unshift(a);
    high.push(a + 1);
  }
  if (caps) def.faces.push([...low, cap[0], cap[1], 0], [...high, cap[0], cap[1], 0]);
}

/**
 * Appends a vertical frustum (trunk, pole), cone (r1 = 0) or inverted cone (r0 = 0).
 * @param {{verts: number[][], faces: Array}} def
 * @param {number} cx axis x
 * @param {number} cz axis z
 * @param {number} y0 bottom
 * @param {number} y1 top
 * @param {number} r0 bottom radius
 * @param {number} r1 top radius
 * @param {number} sides
 * @param {string} ramp
 * @param {number} level
 * @param {{top?: boolean, bottom?: boolean, flags?: number}} [caps] which end caps to add
 */
export function addFrustumY(def, cx, cz, y0, y1, r0, r1, sides, ramp, level, caps = {}) {
  const flags = caps.flags || 0;
  const ring = (y, r) => {
    const base = def.verts.length;
    if (r === 0) {
      def.verts.push([cx, y, cz]);
      return () => base;
    }
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      def.verts.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]);
    }
    return (k) => base + (k % sides);
  };
  const bottom = ring(y0, r0), top = ring(y1, r1);
  for (let k = 0; k < sides; k++) {
    if (r1 === 0) def.faces.push([bottom(k), top(0), bottom(k + 1), ramp, level, flags]);
    else if (r0 === 0) def.faces.push([bottom(0), top(k), top(k + 1), ramp, level, flags]);
    else def.faces.push([bottom(k), top(k), top(k + 1), bottom(k + 1), ramp, level, flags]);
  }
  const indices = Array.from({ length: sides }, (unused, k) => k);
  if (caps.top && r1 > 0) def.faces.push([...indices.map(top).reverse(), ramp, level, flags]);
  if (caps.bottom && r0 > 0) def.faces.push([...indices.map(bottom), ramp, level, flags]);
}

/**
 * Appends a polygon given by its points (CCW seen from the front).
 * @param {{verts: number[][], faces: Array}} def
 * @param {number[][]} points
 * @param {string} ramp
 * @param {number} level
 * @param {number} [flags]
 * @param {boolean} [twoSided] also adds the reversed face
 */
export function addPolygon(def, points, ramp, level, flags = 0, twoSided = false) {
  const base = def.verts.length;
  def.verts.push(...points);
  const indices = points.map((p, i) => base + i);
  def.faces.push([...indices, ramp, level, flags]);
  if (twoSided) def.faces.push([...indices.reverse(), ramp, level, flags]);
}
