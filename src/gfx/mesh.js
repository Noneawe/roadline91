// SPDX-License-Identifier: AGPL-3.0-or-later
// Uploads built model data (see models/loader.js) to GPU buffers and vertex arrays, including
// instance batches (one model drawn many times with per-instance matrices).

import { FLOATS_PER_VERTEX, BYTES_PER_VERTEX } from '../models/loader.js';

// Attribute locations, fixed by layout(location) in the shaders.
const ATTR_POS = 0;
const ATTR_NORMAL = 1;
const ATTR_RAMP = 2; // followed by base level and flags
const ATTR_MODEL = 5; // 4 consecutive vec4 columns (instanced)

/**
 * @typedef {Object} Mesh
 * @property {import('../models/loader.js').BuiltModel} model CPU data, kept to survive context loss
 * @property {WebGLVertexArrayObject} vao triangles
 * @property {WebGLVertexArrayObject} lineVao wireframe edges
 * @property {WebGLBuffer} floatBuffer
 * @property {WebGLBuffer} byteBuffer
 */

/**
 * @typedef {Object} InstanceBatch
 * @property {Mesh} mesh
 * @property {Float32Array} matrices 16 floats per instance, kept to survive context loss
 * @property {number} count
 * @property {WebGLVertexArrayObject} vao
 */

function bindVertexAttribs(gl, mesh) {
  const stride = FLOATS_PER_VERTEX * 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.floatBuffer);
  gl.enableVertexAttribArray(ATTR_POS);
  gl.vertexAttribPointer(ATTR_POS, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(ATTR_NORMAL);
  gl.vertexAttribPointer(ATTR_NORMAL, 3, gl.FLOAT, false, stride, 12);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.byteBuffer);
  for (let i = 0; i < 3; i++) {
    gl.enableVertexAttribArray(ATTR_RAMP + i);
    gl.vertexAttribIPointer(ATTR_RAMP + i, 1, gl.UNSIGNED_BYTE, BYTES_PER_VERTEX, i);
  }
}

/**
 * Creates (or recreates after context loss) the GPU resources of a mesh.
 * @param {WebGL2RenderingContext} gl
 * @param {Mesh} mesh
 */
export function uploadMesh(gl, mesh) {
  const { floats, bytes, lines } = mesh.model;
  mesh.floatBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.floatBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, floats, gl.STATIC_DRAW);
  mesh.byteBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.byteBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.STATIC_DRAW);
  mesh.vao = gl.createVertexArray();
  gl.bindVertexArray(mesh.vao);
  bindVertexAttribs(gl, mesh);
  mesh.lineVao = gl.createVertexArray();
  gl.bindVertexArray(mesh.lineVao);
  mesh.lineBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.lineBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(ATTR_POS);
  gl.vertexAttribPointer(ATTR_POS, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
}

/**
 * Creates (or recreates) the vertex array of an instance batch. Its mesh must be uploaded first.
 * @param {WebGL2RenderingContext} gl
 * @param {InstanceBatch} batch
 */
export function uploadInstances(gl, batch) {
  batch.vao = gl.createVertexArray();
  gl.bindVertexArray(batch.vao);
  bindVertexAttribs(gl, batch.mesh);
  batch.buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, batch.matrices, gl.STATIC_DRAW);
  for (let i = 0; i < 4; i++) {
    gl.enableVertexAttribArray(ATTR_MODEL + i);
    gl.vertexAttribPointer(ATTR_MODEL + i, 4, gl.FLOAT, false, 64, i * 16);
    gl.vertexAttribDivisor(ATTR_MODEL + i, 1);
  }
  gl.bindVertexArray(null);
}

/**
 * Frees the GPU resources of a mesh (scene change).
 * @param {WebGL2RenderingContext} gl
 * @param {Mesh} mesh
 */
export function releaseMesh(gl, mesh) {
  for (const b of [mesh.floatBuffer, mesh.byteBuffer, mesh.lineBuffer]) gl.deleteBuffer(b);
  gl.deleteVertexArray(mesh.vao);
  gl.deleteVertexArray(mesh.lineVao);
}

/**
 * Frees the GPU resources of an instance batch.
 * @param {WebGL2RenderingContext} gl
 * @param {InstanceBatch} batch
 */
export function releaseInstances(gl, batch) {
  gl.deleteBuffer(batch.buffer);
  gl.deleteVertexArray(batch.vao);
}
