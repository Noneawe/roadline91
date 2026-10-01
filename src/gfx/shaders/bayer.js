// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared GLSL snippet: 4x4 Bayer threshold in (0, 1) for the current fragment of the index buffer.

export const BAYER_GLSL = `
const float BAYER[16] = float[16](
  0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float bayerThreshold() {
  ivec2 p = ivec2(gl_FragCoord.xy) & 3;
  return (BAYER[p.y * 4 + p.x] + 0.5) / 16.0;
}`;
