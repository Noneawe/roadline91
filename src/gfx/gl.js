// SPDX-License-Identifier: AGPL-3.0-or-later
// WebGL2 context creation and simulated context loss (debug).

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {WebGL2RenderingContext|null} null when WebGL2 is unavailable (no WebGL1 fallback)
 */
export function createContext(canvas) {
  return canvas.getContext('webgl2', {
    antialias: false,
    depth: false,
    alpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
}

/**
 * Loses the context and restores it after a delay. No-op without WEBGL_lose_context.
 * @param {WebGL2RenderingContext} gl
 * @param {number} restoreMs
 */
export function simulateContextLoss(gl, restoreMs) {
  const ext = gl.getExtension('WEBGL_lose_context');
  if (!ext || gl.isContextLost()) return;
  ext.loseContext();
  setTimeout(() => ext.restoreContext(), restoreMs);
}
