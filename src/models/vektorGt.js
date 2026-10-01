// SPDX-License-Identifier: AGPL-3.0-or-later
// Vektor GT: fictional wedge coupe with hidden headlights. Body lofted from cross-section
// stations into plain verts/faces data. Origin: car center in XZ, y = 0 at axle height, front = -Z.

import { EMIT } from './loader.js';
import { addBox } from './shapes.js';
import { addLoft, addQuadZ, addLightPair, addWheels } from './carBody.js';

const WHEEL_RADIUS = 0.3;
const WHEEL_SIDES = 8;
const AXLES = [-1.35, 1.3];

// Half cross-sections front to back: [z, sill half width, sill y, belt half width, belt y,
// top half width, top y].
const STATIONS = [
  [-2.15, 0.70, -0.10, 0.78, 0.14, 0.70, 0.18],
  [-1.50, 0.84, -0.14, 0.88, 0.34, 0.76, 0.38],
  [-0.55, 0.86, -0.14, 0.90, 0.40, 0.78, 0.46],
  [0.15, 0.86, -0.14, 0.90, 0.44, 0.58, 0.86],
  [0.85, 0.86, -0.14, 0.90, 0.46, 0.58, 0.84],
  [1.55, 0.86, -0.14, 0.90, 0.50, 0.74, 0.58],
  [2.05, 0.84, -0.12, 0.88, 0.50, 0.74, 0.56],
  [2.15, 0.80, -0.06, 0.84, 0.44, 0.72, 0.50],
];

// Per segment between stations: [top ramp, top level, upper side ramp, upper side level].
const SEGMENTS = [
  ['body', 14, 'body', 13], // nose
  ['body', 14, 'body', 13], // hood
  ['glass', 7, 'glass', 6], // windshield
  ['body', 14, 'glass', 6], // roof and side windows
  ['glass', 7, 'body', 13], // rear window and pillars
  ['body', 14, 'body', 13], // deck
  ['body', 13, 'body', 13], // tail bevel
];

// Flat details sit this far off the body panels to avoid z-fighting.
const DETAIL_OFFSET = 0.06;
const NOSE_Z = STATIONS[0][0];
const TAIL_Z = STATIONS[STATIONS.length - 1][0];
// US-style plate, 12 x 6 in.
const PLATE_HALF_WIDTH = 0.1524;
const PLATE_HEIGHT = 0.1524;

function addDetails(def) {
  const front = NOSE_Z - DETAIL_OFFSET, rear = TAIL_Z + DETAIL_OFFSET;
  for (const side of [-1, 1]) {
    const inner = Math.min(side * 0.36, side * 0.66), outer = Math.max(side * 0.36, side * 0.66);
    addQuadZ(def, inner, 0.0, outer, 0.1, front, -1, 'lights', 14, EMIT);
    const tailInner = Math.min(side * 0.34, side * 0.78), tailOuter = Math.max(side * 0.34, side * 0.78);
    addQuadZ(def, tailInner, 0.2, tailOuter, 0.4, rear, 1, 'paint1', 12, EMIT);
  }
  addQuadZ(def, -PLATE_HALF_WIDTH, 0.22, PLATE_HALF_WIDTH, 0.22 + PLATE_HEIGHT, rear, 1, 'paint4', 14, 0);
  addBox(def, [-0.86, -0.1, 2.05], [0.86, 0.08, 2.22], 'gray', 4); // rear bumper
}

function buildDef() {
  const def = { name: 'vektorGt', verts: [], faces: [], wheelRadius: WHEEL_RADIUS, lod: [{ dist: 120, model: 'vektorGtLod' }] };
  addLoft(def, STATIONS, SEGMENTS, ['gray', 5], ['body', 11]);
  addDetails(def);
  addBox(def, [-0.8, 0.54, 1.88], [0.8, 0.68, 2.12], 'body', 14);
  addWheels(def, AXLES, 0.68, 0.92, WHEEL_RADIUS, WHEEL_SIDES);
  return def;
}

function buildLod() {
  const def = { name: 'vektorGtLod', verts: [], faces: [], wheelRadius: WHEEL_RADIUS };
  addBox(def, [-0.88, -0.14, NOSE_Z], [0.88, 0.45, TAIL_Z], 'body', 12);
  addBox(def, [-0.6, 0.45, -0.3], [0.6, 0.85, 1.2], 'glass', 6);
  addLightPair(def, TAIL_Z + DETAIL_OFFSET, 1, [0.34, 0.2, 0.78, 0.4], 'paint1', 12);
  addLightPair(def, NOSE_Z - DETAIL_OFFSET, -1, [0.36, 0, 0.66, 0.1], 'lights', 14);
  addWheels(def, AXLES, 0.68, 0.92, WHEEL_RADIUS, 4, false);
  return def;
}

export const VEKTOR_GT = buildDef();
export const VEKTOR_GT_LOD = buildLod();
