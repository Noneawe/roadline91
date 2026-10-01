// SPDX-License-Identifier: AGPL-3.0-or-later
// Model loader: turns model definitions (verts + polygon faces) into non-indexed vertex arrays
// in the layout of the world shader. No GL, testable in Node.

import { RAMP } from '../gfx/palette.js';
import { hypot3 } from '../engine/math3d.js';

/** Face flag: ignore lighting, use the base level as is. */
export const EMIT = 1;
/** Face flag: drawn only at night (lamps, lit windows). */
export const NIGHT_ONLY = 2;
/** Face flag: see-through, every other pixel left out in a Bayer pattern (light beams). */
export const DITHER = 4;
/** Ramp value of the `body` placeholder, replaced by the paint ramp uniform. */
export const BODY_RAMP = 255;
/** Float layout per vertex: position xyz, face normal xyz. */
export const FLOATS_PER_VERTEX = 6;
/** Byte layout per vertex: ramp, base level, flags, padding. */
export const BYTES_PER_VERTEX = 4;

const MIN_NORMAL_LENGTH = 1e-9;

/**
 * @typedef {Object} BuiltModel
 * @property {string} name
 * @property {number} triCount
 * @property {number} vertexCount
 * @property {Float32Array} floats position + normal per vertex
 * @property {Uint8Array} bytes ramp, base level, flags, pad per vertex
 * @property {Float32Array} lines unique polygon edges as position pairs (wireframe)
 * @property {number[]} center bounding sphere center
 * @property {number} radius bounding sphere radius
 */

/**
 * Validates and builds a model. Faces are convex polygons, CCW seen from outside:
 * [...vertexIndices, rampName, baseLevel, flags].
 * @param {{name: string, verts: number[][], faces: Array<Array<number|string>>}} def
 * @returns {BuiltModel}
 */
export function buildModel(def) {
  const { name, verts, faces } = def;
  let triCount = 0;
  faces.forEach((face, f) => {
    validateFace(name, f, face, verts.length);
    triCount += face.length - 5;
  });
  const floats = new Float32Array(triCount * 3 * FLOATS_PER_VERTEX);
  const bytes = new Uint8Array(triCount * 3 * BYTES_PER_VERTEX);
  const edges = new Set();
  const normal = [0, 0, 0];
  let v = 0;
  faces.forEach((face, f) => {
    const n = face.length - 3;
    const rampName = face[n], level = face[n + 1], flags = face[n + 2];
    const ramp = rampName === 'body' ? BODY_RAMP : RAMP[rampName];
    faceNormal(normal, verts, face, n);
    const len = hypot3(normal[0], normal[1], normal[2]);
    if (len < MIN_NORMAL_LENGTH) throw new Error(`model ${name}: face ${f} is degenerate`);
    for (let i = 1; i < n - 1; i++) {
      for (const k of [0, i, i + 1]) {
        const p = verts[face[k]];
        floats.set(p, v * FLOATS_PER_VERTEX);
        floats.set([normal[0] / len, normal[1] / len, normal[2] / len], v * FLOATS_PER_VERTEX + 3);
        bytes.set([ramp, level, flags], v * BYTES_PER_VERTEX);
        v++;
      }
    }
    for (let i = 0; i < n; i++) {
      const a = face[i], b = face[(i + 1) % n];
      edges.add(Math.min(a, b) * verts.length + Math.max(a, b));
    }
  });
  const lines = new Float32Array(edges.size * 6);
  let l = 0;
  for (const key of edges) {
    lines.set(verts[Math.floor(key / verts.length)], l);
    lines.set(verts[key % verts.length], l + 3);
    l += 6;
  }
  const { center, radius } = boundingSphere(verts);
  return { name, triCount, vertexCount: v, floats, bytes, lines, center, radius };
}

function validateFace(name, f, face, vertCount) {
  const n = face.length - 3;
  const where = `model ${name}: face ${f}`;
  if (n < 3) throw new Error(`${where} has fewer than 3 vertices`);
  for (let i = 0; i < n; i++) {
    if (!Number.isInteger(face[i]) || face[i] < 0 || face[i] >= vertCount) {
      throw new Error(`${where} has invalid vertex index ${face[i]}`);
    }
  }
  if (face[n] !== 'body' && RAMP[face[n]] === undefined) throw new Error(`${where} has unknown ramp ${face[n]}`);
  if (!Number.isInteger(face[n + 1]) || face[n + 1] < 0 || face[n + 1] > 15) {
    throw new Error(`${where} has invalid level ${face[n + 1]}`);
  }
  if (!Number.isInteger(face[n + 2]) || face[n + 2] < 0 || face[n + 2] > 255) {
    throw new Error(`${where} has invalid flags ${face[n + 2]}`);
  }
}

// Newell's method: robust for slightly non-planar polygons.
function faceNormal(out, verts, face, n) {
  out[0] = out[1] = out[2] = 0;
  for (let i = 0; i < n; i++) {
    const a = verts[face[i]], b = verts[face[(i + 1) % n]];
    out[0] += (a[1] - b[1]) * (a[2] + b[2]);
    out[1] += (a[2] - b[2]) * (a[0] + b[0]);
    out[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
}

function boundingSphere(verts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of verts) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  }
  const center = min.map((m, i) => (m + max[i]) / 2);
  let radius = 0;
  for (const p of verts) {
    radius = Math.max(radius, hypot3(p[0] - center[0], p[1] - center[1], p[2] - center[2]));
  }
  return { center, radius };
}
