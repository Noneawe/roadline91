// SPDX-License-Identifier: AGPL-3.0-or-later
// CPU overlay: a Uint8Array of palette indices (0 = transparent) uploaded once per frame to an R8UI texture.

import { createTexture } from './targets.js';

/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} width
 * @param {number} height
 * @returns {WebGLTexture}
 */
export function createOverlayTexture(gl, width, height) {
  return createTexture(gl, gl.R8UI, width, height);
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLTexture} tex
 * @param {Uint8Array} buf width * height indices, row 0 = top of the screen
 * @param {number} width
 * @param {number} height
 */
export function uploadOverlay(gl, tex, buf, width, height) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED_INTEGER, gl.UNSIGNED_BYTE, buf);
}
