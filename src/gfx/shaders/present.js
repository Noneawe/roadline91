// SPDX-License-Identifier: AGPL-3.0-or-later
// Present shader: index buffer + CPU overlay -> palette lookup -> screen, inside the letterbox rect.

export const PRESENT = {
  vs: `#version 300 es
// Fullscreen triangle generated from gl_VertexID, no attributes.
precision highp float;
void main() {
  gl_Position = vec4(float((gl_VertexID << 1) & 2) * 2.0 - 1.0, float(gl_VertexID & 2) * 2.0 - 1.0, 0.0, 1.0);
}`,
  fs: `#version 300 es
// Uniforms: u_index (world indices, R8UI), u_overlay (CPU overlay, R8UI, row 0 = top, 0 = transparent),
// u_palette (RGBA8 256x1), u_rect (letterbox x, y, w, h in framebuffer pixels),
// u_rawPal (show indices as grayscale). The overlay may be smaller than the index buffer
// (enhanced x2 mode); both are stretched over the rect. Output: screen color.
precision highp float;
precision highp usampler2D;
uniform usampler2D u_index;
uniform usampler2D u_overlay;
uniform sampler2D u_palette;
uniform vec4 u_rect;
uniform bool u_rawPal;
out vec4 o_color;
void main() {
  ivec2 size = textureSize(u_index, 0);
  vec2 uv = (gl_FragCoord.xy - u_rect.xy) / u_rect.zw;
  ivec2 t = clamp(ivec2(uv * vec2(size)), ivec2(0), size - 1);
  ivec2 osize = textureSize(u_overlay, 0);
  ivec2 o = clamp(ivec2(uv * vec2(osize)), ivec2(0), osize - 1);
  uint index = texelFetch(u_overlay, ivec2(o.x, osize.y - 1 - o.y), 0).r;
  if (index == 0u) index = texelFetch(u_index, t, 0).r;
  vec3 color = u_rawPal ? vec3(float(index) / 255.0) : texelFetch(u_palette, ivec2(int(index), 0), 0).rgb;
  o_color = vec4(color, 1.0);
}`,
};
