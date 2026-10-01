// SPDX-License-Identifier: AGPL-3.0-or-later
// Terrain strip on both sides of the road: columns of points per track sample, blended from the
// road edge height to rolling hills; bridges drop to a water surface. The strip is squeezed where
// another road (or another part of the same road) is near. CPU data only.

import { CONFIG } from '../config.js';

/** Terrain points per side of a cross-section. */
export const TERRAIN_POINTS = CONFIG.terrain.offsets.length;

/**
 * Hill shape in world space, roughly in [2 * bias - 1, 1].
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function hillNoise(x, z) {
  const { waves, hillBias } = CONFIG.terrain;
  let n = 0;
  for (const [fx, fz, phase] of waves) n += Math.sin(x * fx + z * fz + phase);
  return hillBias + (1 - hillBias) * (n / waves.length);
}

/**
 * Terrain points of one side at sample i, from the road outwards.
 * @param {import('./track.js').TrackPath} path
 * @param {number} i sample index
 * @param {number} side -1 left, 1 right
 * @param {number[]} edge outer shoulder point of the road row on that side
 * @returns {number[][]} TERRAIN_POINTS points [x, y, z]
 */
export function buildTerrainRow(path, i, side, edge) {
  const t = CONFIG.terrain;
  const edgeU = path.width / 2 + CONFIG.track.shoulder;
  const bridge = path.bridge[i];
  // The strip ends halfway to any other road or other part of this road (see roads.js).
  const extent = side < 0 ? path.extentL[i] : path.extentR[i];
  const flat = side < 0 ? path.flatL[i] : path.flatR[i];
  const reach = (room) => Math.max(t.minScale, Math.min(1, (room - edgeU - t.edgeMargin) / t.offsets[TERRAIN_POINTS - 1]));
  const scale = reach(extent), height = reach(flat);
  const cosH = Math.cos(path.heading[i]), sinH = Math.sin(path.heading[i]);
  // Bridges drop to water, tunnels raise a hill over the road, rest areas and stations level out.
  const tunnel = path.tunnel[i], canyon = path.canyon[i];
  // Lake and cliff roads: water or a precipice on one side, a mountain wall on the other.
  const lake = Math.max(0, path.lake[i] * side), drop = Math.max(0, path.cliff[i] * side);
  // Sea cliffs: a short rock edge, a sheer face and the open sea far below.
  const sea = Math.max(0, path.sea[i] * side);
  const mountain = Math.max(0, -path.lake[i] * side, -path.cliff[i] * side);
  const level = Math.max(bridge, tunnel, path.flat[i], canyon * 0.7, lake, drop, sea);
  const base = path.y[i] - t.bridgeDepth * bridge + t.tunnelRise * tunnel + t.canyonRise * canyon - t.lakeDepth * lake;
  // A strip squeezed by a neighbouring road (or the other leg of a hairpin) ramps to the average
  // height of both roads at the halfway line, so the two strips meet without a step or a cliff.
  const room = Math.max(extent - edgeU, 1e-3);
  const middle = ((side < 0 ? path.neighbourL[i] : path.neighbourR[i]) + path.y[i]) / 2;
  // Close to a neighbour only the ramp counts (no hills, cliffs or mountains in between); far from
  // one the strip keeps its own shape. Based on the gradually changing room, so rows blend smoothly.
  const ownShape = Math.max(0, Math.min(1, (flat - edgeU - t.rampNear) / (t.rampFar - t.rampNear)));
  return t.offsets.map((offset, c) => {
    // The first column turns into a near-vertical bridge wall, the top of a tunnel hill, the rim
    // of a canyon wall or the edge of a precipice.
    const lateral = c === 0
      ? offset + (t.wallOffset - offset) * bridge + (t.canyonWall - offset) * canyon + (t.lakeShore - offset) * lake + (t.cliffEdge - offset) * drop
      : offset;
    const across = lateral + (t.seaColumns[c] - lateral) * sea;
    const u = side * (edgeU + across * scale);
    const x = path.x[i] + cosH * u, z = path.z[i] + sinH * u;
    const blend = Math.max(c === 0 ? t.blend[0] + (1 - t.blend[0]) * Math.max(bridge, tunnel, canyon, lake) : t.blend[c], mountain, lake, drop, sea);
    const target = base + t.amplitude * path.hills[i] * (1 - level) * hillNoise(x, z)
      + t.mountainRise[c] * mountain - t.cliffDrop[c] * drop - t.seaDrop[c] * sea;
    const own = edge[1] + (target - edge[1]) * blend;
    const ramp = edge[1] + (middle - edge[1]) * Math.min(1, (across * scale) / room);
    return [x, own + (ramp - own) * (1 - ownShape), z];
  });
}

/**
 * @param {import('./track.js').TrackPath} path
 * @param {number} i sample index
 * @param {number} side -1 left, 1 right
 * @returns {boolean} true when no other road is near enough to squeeze the strip on that side
 */
export function openSide(path, i, side) {
  const edgeU = path.width / 2 + CONFIG.track.shoulder;
  return (side < 0 ? path.flatL[i] : path.flatR[i]) - edgeU > CONFIG.terrain.rampFar * 0.8;
}

export function terrainPaint(path, i, side) {
  const t = CONFIG.terrain;
  if (path.bridge[i] > 0.5) {
    return t.offsets.map((o, c) => (c === 0 ? ['gray', t.wallLevel] : ['water', t.waterLevel]));
  }
  if (path.lake[i] * side > 0.5) return t.offsets.map((o, c) => (c === 0 ? ['sand', t.levels[0]] : ['water', t.waterLevel]));
  // Cliffs and mountain walls only where the strip keeps its own shape; between the legs of a
  // switchback the slope is plain ground.
  if (openSide(path, i, side)) {
    if (path.sea[i] * side > 0.5) return t.levels.map((level, c) => (c < 2 ? ['rock', level - c] : ['water', t.seaLevel]));
    // Rock edge and cliff face, then the valley floor far below.
    if (path.cliff[i] * side > 0.5) return t.levels.map((level, c) => (c < 2 ? ['rock', level - 2 - c] : ['forest', level]));
    if (-path.lake[i] * side > 0.5 || -path.cliff[i] * side > 0.5) return t.levels.map((level, c) => (c === 0 ? ['grass', level] : ['rock', level]));
  }
  if (path.tunnel[i] > 0.3) return t.levels.map((level, c) => (c === 0 ? ['rock', t.cutLevel] : ['grass', level]));
  if (path.canyon[i] > 0.3) {
    // Alternate shades along the road hint at layered rock.
    return t.levels.map((level, c) => (c === 0 ? ['rock', t.canyonLevel - ((i >> 2) & 1)] : ['rock', level - 1]));
  }
  return t.levels.map((level) => ['grass', level]);
}
