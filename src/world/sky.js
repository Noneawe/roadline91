// SPDX-License-Identifier: AGPL-3.0-or-later
// Background mountains: a ring of flat silhouette polygons drawn around the camera at "infinite"
// distance. Sky gradient parameters live in CONFIG.sky and are used by the sky shader.

import { CONFIG } from '../config.js';
import { createRng } from '../engine/rng.js';
import { EMIT } from '../models/loader.js';

/**
 * @returns {{name: string, verts: number[][], faces: Array}} ring facing inwards around the origin
 */
export function buildMountainDef() {
  const c = CONFIG.sky;
  const rng = createRng(c.seed);
  const n = c.mountainSegments, r = c.mountainRadius;
  const def = { name: 'mountains', verts: [], faces: [] };
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = r * Math.cos(a), z = r * Math.sin(a);
    const height = r * (c.mountainMin + (c.mountainMax - c.mountainMin) * rng());
    def.verts.push([x, r * c.mountainBase, z], [x, height, z]);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = ((i + 1) % n) * 2;
    const level = def.verts[b + 1][1] > def.verts[a + 1][1] ? c.mountainLit : c.mountainShade;
    def.faces.push([a, b, b + 1, a + 1, c.mountainRamp, level, EMIT]);
  }
  return def;
}
