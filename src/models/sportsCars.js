// SPDX-License-Identifier: AGPL-3.0-or-later
// Player-selectable sports cars besides the Vektor GT (fictional, original shapes): Aurora MR
// (low mid-engine GT), Breeze R (small open roadster), Kestrel S (three-box sports sedan).
// Built with the shared vehicle builder; front = -Z, y = 0 at axle height.

import { addBox } from './shapes.js';
import { buildVehicle, addQuadZ } from './carBody.js';
import { VEKTOR_GT, VEKTOR_GT_LOD } from './vektorGt.js';

const LOD_DISTANCE = 120;
const BODY = ['body', 14, 'body', 13], GLASS = ['glass', 7, 'glass', 6], ROOF = ['body', 14, 'glass', 6];
const INTERIOR = ['gray', 2, 'body', 13]; // open cockpit: dark seats seen from above
// US-style plate, 12 x 6 in, a little off the tail.
function plate(def, z, y) {
  addQuadZ(def, -0.1524, y, 0.1524, y + 0.1524, z, 1, 'paint4', 14, 0);
}

const aurora = buildVehicle({
  name: 'auroraMr', size: [1.9, 1.1, 4.4], lodDistance: LOD_DISTANCE,
  // Short nose, cab pushed forward, long flat engine deck ending in a wing.
  stations: [
    [-2.2, 0.74, -0.12, 0.84, 0.1, 0.74, 0.14],
    [-1.6, 0.9, -0.14, 0.94, 0.3, 0.8, 0.32],
    [-0.9, 0.92, -0.14, 0.96, 0.36, 0.8, 0.4],
    [-0.35, 0.92, -0.14, 0.96, 0.4, 0.56, 0.78],
    [0.45, 0.94, -0.14, 0.98, 0.42, 0.56, 0.78],
    [1.2, 0.96, -0.14, 1.0, 0.44, 0.7, 0.5],
    [2.1, 0.94, -0.12, 0.98, 0.42, 0.74, 0.46],
    [2.2, 0.9, -0.06, 0.94, 0.38, 0.72, 0.42],
  ],
  segments: [BODY, BODY, GLASS, ROOF, ['body', 13, 'body', 12], BODY, BODY],
  front: ['gray', 5], rear: ['gray', 3],
  wheels: { axles: [-1.3, 1.25], x0: 0.72, x1: 0.98, radius: 0.31, sides: 8 },
  lights: { front: [0.4, 0.02, 0.7, 0.1], rear: [0.3, 0.2, 0.86, 0.34] },
  extra(def) {
    addBox(def, [-0.92, 0.62, 1.95], [0.92, 0.68, 2.25], 'body', 14); // wing
    addBox(def, [-0.8, 0.42, 2.0], [-0.7, 0.62, 2.1], 'gray', 4);
    addBox(def, [0.7, 0.42, 2.0], [0.8, 0.62, 2.1], 'gray', 4);
    addBox(def, [0.99, 0.0, 0.5], [1.03, 0.3, 1.1], 'gray', 2); // side intakes
    addBox(def, [-1.03, 0.0, 0.5], [-0.99, 0.3, 1.1], 'gray', 2);
    addBox(def, [-0.92, -0.12, 2.18], [0.92, 0.04, 2.28], 'gray', 4); // rear bumper
    plate(def, 2.29, 0.06);
  },
  lodBoxes: [[[-0.96, -0.14, -2.2], [0.96, 0.4, 2.2], 'body', 12], [[-0.56, 0.4, -0.5], [0.56, 0.78, 0.8], 'glass', 6]],
});

const breeze = buildVehicle({
  name: 'breezeR', size: [1.68, 1.0, 3.9], lodDistance: LOD_DISTANCE,
  // Rounded nose, short windshield, open cockpit with a roll hoop, short tail.
  stations: [
    [-1.95, 0.62, -0.1, 0.72, 0.16, 0.64, 0.22],
    [-1.3, 0.8, -0.12, 0.84, 0.34, 0.72, 0.4],
    [-0.45, 0.82, -0.12, 0.86, 0.4, 0.74, 0.44],
    [-0.15, 0.82, -0.12, 0.86, 0.42, 0.66, 0.72],
    [0.1, 0.82, -0.12, 0.86, 0.42, 0.74, 0.44],
    [0.95, 0.82, -0.12, 0.86, 0.44, 0.74, 0.46],
    [1.85, 0.8, -0.1, 0.84, 0.46, 0.72, 0.48],
    [1.95, 0.76, -0.04, 0.8, 0.4, 0.68, 0.42],
  ],
  segments: [BODY, BODY, GLASS, GLASS, INTERIOR, BODY, BODY],
  front: ['gray', 5], rear: ['body', 11],
  wheels: { axles: [-1.15, 1.15], x0: 0.62, x1: 0.84, radius: 0.28, sides: 8 },
  lights: { front: [0.36, 0.06, 0.62, 0.2], rear: [0.32, 0.22, 0.7, 0.36] },
  extra(def) {
    addBox(def, [-0.62, 0.44, 0.9], [-0.52, 0.86, 1.0], 'gray', 4); // roll hoop
    addBox(def, [0.52, 0.44, 0.9], [0.62, 0.86, 1.0], 'gray', 4);
    addBox(def, [-0.62, 0.8, 0.9], [0.62, 0.9, 1.0], 'gray', 4);
    addBox(def, [-0.8, -0.1, 1.9], [0.8, 0.06, 2.02], 'gray', 4); // rear bumper
    plate(def, 2.03, 0.08);
  },
  lodBoxes: [[[-0.84, -0.12, -1.95], [0.84, 0.46, 1.95], 'body', 12], [[-0.62, 0.44, -0.45], [0.62, 0.72, -0.15], 'glass', 6]],
});

const kestrel = buildVehicle({
  name: 'kestrelS', size: [1.78, 1.36, 4.6], lodDistance: LOD_DISTANCE,
  // Square three-box sedan: long hood, upright cabin with four side windows, short trunk.
  stations: [
    [-2.3, 0.8, -0.12, 0.86, 0.3, 0.82, 0.36],
    [-1.55, 0.88, -0.14, 0.9, 0.44, 0.84, 0.48],
    [-0.75, 0.88, -0.14, 0.9, 0.48, 0.84, 0.52],
    [-0.15, 0.88, -0.14, 0.9, 0.52, 0.68, 1.06],
    [1.05, 0.88, -0.14, 0.9, 0.52, 0.68, 1.06],
    [1.6, 0.88, -0.14, 0.9, 0.54, 0.82, 0.6],
    [2.2, 0.86, -0.12, 0.88, 0.54, 0.82, 0.58],
    [2.3, 0.82, -0.06, 0.84, 0.48, 0.78, 0.52],
  ],
  segments: [BODY, BODY, GLASS, ROOF, GLASS, BODY, BODY],
  front: ['gray', 4], rear: ['body', 11],
  wheels: { axles: [-1.4, 1.35], x0: 0.66, x1: 0.9, radius: 0.31, sides: 8 },
  lights: { front: [0.3, 0.12, 0.78, 0.28], rear: [0.3, 0.24, 0.82, 0.4] },
  extra(def) {
    addBox(def, [-0.9, -0.12, -2.4], [0.9, 0.06, -2.28], 'gray', 4); // bumpers
    addBox(def, [-0.88, -0.1, 2.28], [0.88, 0.08, 2.4], 'gray', 4);
    addBox(def, [-0.12, 0.08, -2.34], [0.12, 0.28, -2.31], 'gray', 9); // grille bar
    plate(def, 2.41, 0.1);
  },
  lodBoxes: [[[-0.9, -0.14, -2.3], [0.9, 0.54, 2.3], 'body', 12], [[-0.68, 0.54, -0.3], [0.68, 1.06, 1.3], 'glass', 6]],
});

export const AURORA_MR = aurora.def;
export const AURORA_MR_LOD = aurora.lod;
export const BREEZE_R = breeze.def;
export const BREEZE_R_LOD = breeze.lod;
export const KESTREL_S = kestrel.def;
export const KESTREL_S_LOD = kestrel.lod;

/** Full and LOD model of every player car by model name (see vehicle/cars.js `model`). */
export const CAR_MODELS = {
  vektorGt: [VEKTOR_GT, VEKTOR_GT_LOD],
  auroraMr: [AURORA_MR, AURORA_MR_LOD],
  breezeR: [BREEZE_R, BREEZE_R_LOD],
  kestrelS: [KESTREL_S, KESTREL_S_LOD],
};
