// SPDX-License-Identifier: AGPL-3.0-or-later
// Splits the track into chunks: one model definition (road + terrain) per chunk, plus per-chunk
// frustum and distance culling when drawing.

import { CONFIG } from '../config.js';
import { sphereInFrustum, hypot3 } from '../engine/math3d.js';
import { buildModel } from '../models/loader.js';
import { buildRoadRow, roadPaint, ROAD_POINTS } from './track.js';
import { buildTerrainRow, terrainPaint, TERRAIN_POINTS } from './terrain.js';
import { clipToMain } from './roads.js';

const MIN_AREA = 1e-3; // m^2

function triangleArea(verts, [a, b, c]) {
  const p = verts[a], q = verts[b], r = verts[c];
  const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
  return hypot3(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}

/** Points per ground cross-section: left terrain, road, right terrain. */
export const SURFACE_POINTS = ROAD_POINTS + 2 * TERRAIN_POINTS;
/** Points per rendered cross-section: the ground plus a skirt below each outer edge. */
export const ROW_POINTS = SURFACE_POINTS + 2;

/**
 * Ground cross-section at sample i, left to right.
 * @param {import('./track.js').TrackPath} path
 * @param {number} i sample index
 * @returns {number[][]} SURFACE_POINTS points [x, y, z]
 */
export function buildRow(path, i) {
  const road = buildRoadRow(path, i);
  const left = buildTerrainRow(path, i, -1, road[0]).reverse();
  const row = [...left, ...road, ...buildTerrainRow(path, i, 1, road[ROAD_POINTS - 1])];
  if (path.main && path.mainIndex[i] >= 0) clipToMain(path, i, row);
  return row;
}

// Rendered row: skirts hang below both outer edges, hiding cracks where two terrain strips meet
// at different heights.
function buildMeshRow(path, i) {
  const row = buildRow(path, i), depth = CONFIG.terrain.skirtDepth;
  const first = row[0], last = row[row.length - 1];
  return [[first[0], first[1] - depth, first[2]], ...row, [last[0], last[1] - depth, last[2]]];
}

function rowPaint(path, i) {
  const skirt = ['grass', CONFIG.terrain.skirtLevel];
  return [skirt, ...terrainPaint(path, i, -1).reverse(), ...roadPaint(path, i), ...terrainPaint(path, i, 1), skirt];
}

/**
 * Model definitions of the chunks of one road, covering its drawn samples. Chunk c holds samples
 * c * perChunk .. (c + 1) * perChunk; neighbouring chunks share an identical boundary row.
 * @param {import('./track.js').TrackPath} path
 * @returns {Array<{name: string, index: number, first: number, last: number, verts: number[][], faces: Array}>}
 */
export function buildChunkDefs(path) {
  const perChunk = Math.round(CONFIG.chunk.length / path.step);
  const defs = [];
  for (let c = Math.floor(path.drawnFrom / perChunk); c * perChunk < path.drawnTo; c++) {
    const first = Math.max(c * perChunk, path.drawnFrom), last = Math.min((c + 1) * perChunk, path.drawnTo);
    if (last <= first) continue;
    const def = { name: `road${path.id}chunk${c}`, index: c, first, last, verts: [], faces: [] };
    for (let i = first; i <= last; i++) def.verts.push(...buildMeshRow(path, i));
    for (let i = first; i < last; i++) {
      const a = (i - first) * ROW_POINTS, b = a + ROW_POINTS;
      // Two triangles per strip: each gets its own exact face normal (terrain quads are rarely planar).
      rowPaint(path, i).forEach(([ramp, level], j) => {
        for (const tri of [[a + j, a + j + 1, b + j + 1], [a + j, b + j + 1, b + j]]) {
          // Clipped junction rows collapse some strips; their empty triangles are left out.
          if (triangleArea(def.verts, tri) > MIN_AREA) def.faces.push([...tri, ramp, level, 0]);
        }
      });
    }
    defs.push(def);
  }
  return defs;
}

/**
 * @typedef {Object} Chunk
 * @property {import('../gfx/mesh.js').Mesh} mesh road and terrain
 * @property {import('../gfx/mesh.js').InstanceBatch[]} batches scenery, one batch per object type
 * @property {number[]} anchor centerline point in the middle of the chunk (distance culling)
 * @property {number} road road id
 * @property {number} index chunk number along its road
 */

/**
 * @param {import('../gfx/renderer.js').Renderer} renderer
 * @param {import('./track.js').TrackPath} path
 * @returns {Chunk[]}
 */
export function createChunks(renderer, path) {
  return buildChunkDefs(path).map((def) => {
    const mid = (def.first + def.last) >> 1;
    return {
      mesh: renderer.addMesh(buildModel(def)), batches: [], road: path.id, index: def.index,
      anchor: [path.x[mid], path.y[mid], path.z[mid]],
    };
  });
}

const visible = new Uint16Array(256);

/**
 * Draws the chunks that intersect the frustum and lie within the draw distance: first all road
 * and terrain meshes, then all scenery batches (one program switch per view).
 * @param {import('../gfx/renderer.js').Renderer} renderer
 * @param {Chunk[]} chunks
 * @param {Float32Array} planes frustum planes
 * @param {ArrayLike<number>} eye camera position
 * @param {number} maxDistance terrain draw distance
 * @param {number} sceneryDistance scenery draw distance
 * @param {Float32Array} identity model matrix of the static world
 */
export function drawChunks(renderer, chunks, planes, eye, maxDistance, sceneryDistance, identity) {
  const half = CONFIG.chunk.length / 2;
  let count = 0;
  for (let i = 0; i < chunks.length && count < visible.length; i++) {
    const { center, radius } = chunks[i].mesh.model, anchor = chunks[i].anchor;
    // Distance to the nearest part of the chunk's road, not to its (much wider) bounding sphere.
    const dist = hypot3(anchor[0] - eye[0], anchor[1] - eye[1], anchor[2] - eye[2]) - half;
    if (dist > maxDistance) continue;
    if (!sphereInFrustum(planes, center[0], center[1], center[2], radius)) continue;
    renderer.drawMesh(chunks[i].mesh, identity, 0);
    if (dist <= sceneryDistance) visible[count++] = i;
  }
  for (let v = 0; v < count; v++) {
    const batches = chunks[visible[v]].batches;
    for (let b = 0; b < batches.length; b++) renderer.drawInstances(batches[b]);
  }
}
