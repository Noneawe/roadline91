// SPDX-License-Identifier: AGPL-3.0-or-later
// Render targets: unfiltered textures and the palette index framebuffer (R8UI + 24-bit depth).

/**
 * Immutable texture with NEAREST filtering, no mipmaps, CLAMP_TO_EDGE.
 * @param {WebGL2RenderingContext} gl
 * @param {number} internalFormat e.g. gl.R8UI, gl.RGBA8
 * @param {number} width
 * @param {number} height
 * @returns {WebGLTexture}
 */
export function createTexture(gl, internalFormat, width, height) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} width
 * @param {number} height
 * @returns {{fbo: WebGLFramebuffer, tex: WebGLTexture, depth: WebGLRenderbuffer}}
 */
export function createIndexTarget(gl, width, height) {
  const tex = createTexture(gl, gl.R8UI, width, height);
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
    throw new Error(`Index framebuffer incomplete: 0x${status.toString(16)}`);
  }
  return { fbo, tex, depth };
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {{fbo: WebGLFramebuffer, tex: WebGLTexture, depth: WebGLRenderbuffer}} target
 */
export function deleteIndexTarget(gl, target) {
  gl.deleteFramebuffer(target.fbo);
  gl.deleteTexture(target.tex);
  gl.deleteRenderbuffer(target.depth);
}
