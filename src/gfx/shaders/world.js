// SPDX-License-Identifier: AGPL-3.0-or-later
// World shader: flat-shaded 3D geometry written as palette indices with Bayer-dithered brightness,
// rasterized (dithered) distance fog and the headlight wedge at night.

import { BAYER_GLSL } from './bayer.js';

export const WORLD = {
  vs: `#version 300 es
// Inputs: a_pos, a_normal (face normal, equal on all 3 vertices), a_ramp, a_baseLevel, a_flags;
// with INSTANCED also a_model (per-instance model matrix), otherwise the u_model uniform.
// Uniforms: u_viewProj, u_lightDir (travel direction), u_light (ambient, diffuse),
// u_bodyRamp (paint ramp replacing BODY_RAMP), u_eye (camera position), u_fog (start, end),
// u_night (draws NIGHT_ONLY faces), u_lampRel (headlight position relative to the camera).
// Outputs per face (flat): ramp, base level, lighting factor 0-1, fog start distance, whether the
// face is turned towards the headlights, world normal;
// interpolated: v_rel (position relative to the camera).
// Defines: FLAG_EMIT, FLAG_NIGHT_ONLY, FLAG_DITHER, BODY_RAMP, EMIT_FOG_START, LAMP_FACING_MIN, optional INSTANCED.
precision highp float;
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in uint a_ramp;
layout(location = 3) in uint a_baseLevel;
layout(location = 4) in uint a_flags;
#ifdef INSTANCED
layout(location = 5) in mat4 a_model;
#define MODEL a_model
#else
uniform mat4 u_model;
#define MODEL u_model
#endif
uniform mat4 u_viewProj;
uniform vec3 u_lightDir;
uniform vec2 u_light;
uniform uint u_bodyRamp;
uniform vec3 u_eye;
uniform vec2 u_fog;
uniform bool u_night;
uniform vec3 u_lampRel;
flat out uint v_ramp;
flat out float v_base;
flat out float v_lit;
flat out float v_fogStart;
flat out float v_lampFacing;
flat out vec3 v_normal;
flat out float v_screen;
out vec3 v_rel;
void main() {
  bool emit = (a_flags & FLAG_EMIT) != 0u;
  vec3 n = normalize(mat3(MODEL) * a_normal);
  v_normal = n;
  v_screen = (a_flags & FLAG_DITHER) != 0u ? 1.0 : 0.0;
  v_lit = emit ? 1.0 : min(1.0, u_light.x + u_light.y * max(0.0, dot(n, -u_lightDir)));
  v_base = float(a_baseLevel);
  v_ramp = a_ramp == BODY_RAMP ? u_bodyRamp : a_ramp;
  // Emissive faces stay clear of the fog almost to the end of the draw distance.
  v_fogStart = emit ? u_fog.y * float(EMIT_FOG_START) : u_fog.x;
  vec4 world = MODEL * vec4(a_pos, 1.0);
  v_rel = world.xyz - u_eye;
  // Faces turned away from the lamp get no headlight.
  v_lampFacing = dot(n, normalize(u_lampRel - v_rel)) > float(LAMP_FACING_MIN) ? 1.0 : 0.0;
  gl_Position = u_viewProj * world;
  // Night-only faces are clipped away during the day.
  if ((a_flags & FLAG_NIGHT_ONLY) != 0u && !u_night) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`,
  fs: `#version 300 es
// Inputs: flat v_ramp, v_base, v_lit, v_fogStart, v_lampFacing, v_normal; v_rel.
// Uniforms: u_fog (start, end distance), u_fogIndex, headlights: u_lampRel (lamp position
// relative to the camera), u_lampDir (beam direction), u_lamp (range, cos of the inner and outer
// half angle of the cone, strength; strength 0 = off), u_lampReach (reach per horizontal slice of
// the wedge: light stops at buildings and walls); street lamps: u_lights (positions relative to the
// camera), u_lightCount. Each lamp brightens faces below it within LIGHT_RADIUS. Headlights of other
// vehicles: u_carLampRel, u_carLampDir (xyz direction, w strength 0-1), u_carLampCount (same cone,
// no blocking). Police beacon: u_beacon (position relative to the camera, radius), u_beaconRamp,
// u_beaconStrength (0 = off): lit faces nearby take the beacon color, dithered by distance.
// Defines: LAMP_SECTORS, LAMP_OUTER (rad), LAMP_BLOCK_BIAS, LAMP_BLOCK_FADE, MAX_LIGHTS,
// LIGHT_RADIUS, LIGHT_STRENGTH, MAX_CAR_LAMPS, CAR_LAMP_RANGE, CAR_LAMP_STRENGTH, LAMP_FACING_MIN.
// Output: palette index (never 0, which is reserved).
// The fractional part of the brightness level is dithered with a 4x4 Bayer pattern on the index
// buffer grid, so both the fog and the edge of the headlight wedge are dithered, never smooth.
precision highp float;
flat in uint v_ramp;
flat in float v_base;
flat in float v_lit;
flat in float v_fogStart;
flat in float v_lampFacing;
flat in vec3 v_normal;
flat in float v_screen;
in vec3 v_rel;
uniform vec2 u_fog;
uniform uint u_fogIndex;
uniform vec3 u_lampRel;
uniform vec3 u_lampDir;
uniform vec4 u_lamp;
uniform float u_lampReach[LAMP_SECTORS];
uniform vec3 u_lights[MAX_LIGHTS];
uniform int u_lightCount;
uniform vec3 u_carLampRel[MAX_CAR_LAMPS];
uniform vec4 u_carLampDir[MAX_CAR_LAMPS];
uniform int u_carLampCount;
uniform vec4 u_beacon;
uniform uint u_beaconRamp;
uniform float u_beaconStrength;
layout(location = 0) out uint o_index;
${BAYER_GLSL}
void main() {
  float threshold = bayerThreshold();
  // See-through faces keep only half of their pixels (screen-door transparency).
  if (v_screen > 0.5 && threshold < 0.5) discard;
  if ((length(v_rel) - v_fogStart) / (u_fog.y - v_fogStart) > threshold) {
    o_index = u_fogIndex;
    return;
  }
  float lit = v_lit;
  if (u_lamp.w > 0.0 && lit < 1.0 && v_lampFacing > 0.5) {
    vec3 r = v_rel - u_lampRel;
    float d = max(length(r), 0.001);
    float cone = clamp((dot(r / d, u_lampDir) - u_lamp.z) / (u_lamp.y - u_lamp.z), 0.0, 1.0);
    // Reach of the light in this horizontal direction, interpolated between slices.
    float angle = atan(u_lampDir.x * r.z - u_lampDir.z * r.x, u_lampDir.x * r.x + u_lampDir.z * r.z);
    float slice = clamp(angle / float(LAMP_OUTER) * 0.5 + 0.5, 0.0, 1.0) * float(LAMP_SECTORS - 1);
    int i = int(slice);
    float reach = mix(u_lampReach[i], u_lampReach[min(i + 1, LAMP_SECTORS - 1)], fract(slice)) + float(LAMP_BLOCK_BIAS);
    float open = clamp((reach - length(r.xz)) / float(LAMP_BLOCK_FADE) + 1.0, 0.0, 1.0);
    lit = min(1.0, lit + u_lamp.w * cone * open * clamp(1.0 - d / u_lamp.x, 0.0, 1.0));
  }
  if (lit < 1.0) {
    for (int i = 0; i < u_lightCount; i++) {
      vec3 toLight = u_lights[i] - v_rel;
      float reach = 1.0 - length(toLight.xz) / float(LIGHT_RADIUS);
      if (toLight.y > 0.0 && reach > 0.0) {
        lit += float(LIGHT_STRENGTH) * reach * max(0.0, dot(v_normal, normalize(toLight)));
      }
    }
    for (int i = 0; i < u_carLampCount; i++) {
      vec3 r = v_rel - u_carLampRel[i];
      float d = max(length(r), 0.001);
      if (d > float(CAR_LAMP_RANGE) || dot(v_normal, -r / d) <= float(LAMP_FACING_MIN)) continue;
      float cone = clamp((dot(r / d, u_carLampDir[i].xyz) - u_lamp.z) / (u_lamp.y - u_lamp.z), 0.0, 1.0);
      lit += float(CAR_LAMP_STRENGTH) * u_carLampDir[i].w * cone * (1.0 - d / float(CAR_LAMP_RANGE));
    }
    lit = min(lit, 1.0);
  }
  uint ramp = v_ramp;
  if (u_beaconStrength > 0.0 && v_lit < 1.0) {
    // Colored light cannot be mixed in a palette: the face switches to the beacon ramp where the
    // light is stronger than a (shifted) Bayer threshold, so the colored pool fades out dithered.
    vec3 toBeacon = u_beacon.xyz - v_rel;
    float d = length(toBeacon);
    float glow = u_beaconStrength * max(0.0, 1.0 - d / u_beacon.w) * step(0.0, dot(v_normal, toBeacon));
    if (glow > fract(threshold + 0.5)) {
      ramp = u_beaconRamp;
      lit = min(1.0, lit + glow);
    }
  }
  float level = v_base * lit;
  float base = floor(level);
  uint index = min(uint(base) + (level - base > threshold ? 1u : 0u), 15u);
  o_index = max(ramp * 16u + index, 1u);
}`,
};
