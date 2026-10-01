// SPDX-License-Identifier: AGPL-3.0-or-later
// Test primitives for the renderer scene and render tests: cube, pyramid, ground quad.

import { addBox } from './shapes.js';

export const CUBE = { name: 'cube', verts: [], faces: [] };
addBox(CUBE, [-1, -1, -1], [1, 1, 1], 'paint3', 14);

export const PYRAMID = {
  name: 'pyramid',
  verts: [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [0, 1.5, 0]],
  faces: [
    [0, 1, 2, 3, 'sand', 8, 0],
    [3, 2, 4, 'sand', 14, 0],
    [2, 1, 4, 'sand', 14, 0],
    [1, 0, 4, 'sand', 14, 0],
    [0, 3, 4, 'sand', 14, 0],
  ],
};

export const GROUND = {
  name: 'ground',
  verts: [[-40, 0, -40], [-40, 0, 40], [40, 0, 40], [40, 0, -40]],
  faces: [[0, 1, 2, 3, 'grass', 12, 0]],
};
