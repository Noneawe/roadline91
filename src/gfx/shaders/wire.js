// SPDX-License-Identifier: AGPL-3.0-or-later
// Wireframe shader: model edges as lines with a constant palette index.

export const WIRE = {
  vs: `#version 300 es
// Inputs: a_pos. Uniforms: u_viewProj, u_model.
precision highp float;
layout(location = 0) in vec3 a_pos;
uniform mat4 u_viewProj;
uniform mat4 u_model;
void main() {
  gl_Position = u_viewProj * u_model * vec4(a_pos, 1.0);
}`,
  fs: `#version 300 es
// Uniform: u_index (palette index of the lines). Output: palette index.
precision highp float;
uniform uint u_index;
layout(location = 0) out uint o_index;
void main() {
  o_index = u_index;
}`,
};
