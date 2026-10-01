// SPDX-License-Identifier: AGPL-3.0-or-later
// Shader compilation and linking with error reports; uniform locations cached at link time.

/**
 * @param {WebGL2RenderingContext} gl
 * @param {{vs: string, fs: string}} source shaders starting with the #version line
 * @param {Object<string, string|number>} [defines] injected as #define after #version
 * @returns {{program: WebGLProgram, uniforms: Object<string, WebGLUniformLocation>}}
 */
export function createProgram(gl, source, defines = {}) {
  const names = Object.keys(defines);
  const header = names.map((name) => `#define ${name} ${defines[name]}\n`).join('');
  const program = gl.createProgram();
  for (const [type, label, text] of [[gl.VERTEX_SHADER, 'vertex', source.vs], [gl.FRAGMENT_SHADER, 'fragment', source.fs]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, text.replace('\n', `\n${header}`));
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      // Report line numbers of the original source, without the injected defines.
      const log = gl.getShaderInfoLog(shader).replace(/(ERROR: \d+:)(\d+)/g, (m, p, line) => p + (line - names.length));
      throw new Error(`Shader compile error (${label}):\n${log}`);
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`Shader link error:\n${gl.getProgramInfoLog(program)}`);
  }
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const { name } = gl.getActiveUniform(program, i);
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return { program, uniforms };
}
