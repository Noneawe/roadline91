// SPDX-License-Identifier: AGPL-3.0-or-later
// Sky shader: fullscreen pass writing sky gradient bands as palette indices, dithered at band
// edges. Below the horizon it draws an infinite ground plane that fades into the fog index with
// distance, so nothing shows through past the edge of the terrain.

import { BAYER_GLSL } from './bayer.js';

export const SKY = {
  vs: `#version 300 es
// Fullscreen triangle from gl_VertexID. Output: v_ndc.
precision highp float;
out vec2 v_ndc;
void main() {
  v_ndc = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  gl_Position = vec4(v_ndc, 0.0, 1.0);
}`,
  fs: `#version 300 es
// Uniforms: u_right, u_up (camera axes scaled by the tangent of the half FOV), u_fwd, u_fogIndex,
// u_fog (start, end distance), u_groundHeight (camera height above the ground plane).
// u_groundIndex (palette index of the ground plane).
// Defines: SKY_RAMP, SKY_HORIZON_LEVEL, SKY_ZENITH_LEVEL, SKY_RANGE, SKY_SHARPNESS.
// Output: palette index chosen from the elevation of the view ray.
precision highp float;
in vec2 v_ndc;
uniform vec3 u_right;
uniform vec3 u_up;
uniform vec3 u_fwd;
uniform uint u_fogIndex;
uniform vec2 u_fog;
uniform float u_groundHeight;
uniform uint u_groundIndex;
layout(location = 0) out uint o_index;
${BAYER_GLSL}
void main() {
  // Normalized along the screen column only, so bands stay straight lines (tilted by camera roll).
  vec3 column = u_fwd + u_up * v_ndc.y;
  float elevation = (column.y + u_right.y * v_ndc.x) / length(column);
  if (elevation < 0.0) {
    float fog = (u_groundHeight / -elevation - u_fog.x) / (u_fog.y - u_fog.x);
    o_index = fog > bayerThreshold() ? u_fogIndex : u_groundIndex;
    return;
  }
  float bands = float(SKY_HORIZON_LEVEL - SKY_ZENITH_LEVEL);
  float p = min(elevation / float(SKY_RANGE), 1.0) * bands;
  float band = min(floor(p), bands - 1.0);
  float edge = clamp((p - band - 0.5) * float(SKY_SHARPNESS) + 0.5, 0.0, 1.0);
  int level = SKY_HORIZON_LEVEL - int(band) - (edge > bayerThreshold() ? 1 : 0);
  o_index = uint(SKY_RAMP * 16 + level);
}`,
};
