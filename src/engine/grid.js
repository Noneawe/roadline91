// SPDX-License-Identifier: AGPL-3.0-or-later
// Uniform spatial grid over the ground plane for fixed-size float records (colliders, lamps).
// Queries return whole cells, so callers loop without allocating.

const KEY = 100000;

/**
 * @param {number[]} records flat list, `stride` floats per record, x at 1 and z at 2 unless given
 * @param {number} stride
 * @param {number} cell cell size in meters
 * @param {number} [xAt] offset of x inside a record
 * @param {number} [zAt] offset of z inside a record
 * @returns {{cell: number, stride: number, cells: Map<number, Float32Array>}}
 */
export function buildGrid(records, stride, cell, xAt = 1, zAt = 2) {
  const lists = new Map();
  for (let o = 0; o < records.length; o += stride) {
    const key = Math.floor(records[o + xAt] / cell) * KEY + Math.floor(records[o + zAt] / cell);
    if (!lists.has(key)) lists.set(key, []);
    lists.get(key).push(...records.slice(o, o + stride));
  }
  const cells = new Map();
  for (const [key, list] of lists) cells.set(key, new Float32Array(list));
  return { cell, stride, cells };
}

/**
 * Collects the cells overlapping a square around a point.
 * @param {{cell: number, cells: Map<number, Float32Array>}} grid
 * @param {number} x
 * @param {number} z
 * @param {number} radius
 * @param {Float32Array[]} out receives the cells
 * @returns {number} number of cells written
 */
export function queryCells(grid, x, z, radius, out) {
  const x0 = Math.floor((x - radius) / grid.cell), x1 = Math.floor((x + radius) / grid.cell);
  const z0 = Math.floor((z - radius) / grid.cell), z1 = Math.floor((z + radius) / grid.cell);
  let count = 0;
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const list = grid.cells.get(cx * KEY + cz);
      if (list && count < out.length) out[count++] = list;
    }
  }
  return count;
}
