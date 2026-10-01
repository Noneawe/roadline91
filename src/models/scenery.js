// SPDX-License-Identifier: AGPL-3.0-or-later
// Roadside object library (4-40 triangles each), y = 0 on the ground. Road-aligned models are
// designed for the right side of the road: travel direction is -Z, the road lies towards -X.
// Extra fields: align ('road' | 'random' yaw), mirrorLeft (turned 180 degrees on the left side),
// scale ([min, max] random uniform scale), solid + collider: { type: 'cylinder', radius } or
// { type: 'box', size: [x, y, z], center?: [x, z] } in model space, or a list of those;
// blocksLight (headlights do not pass the model's box colliders), light ([x, y, z] of a lamp that
// lights its surroundings at night).

import { EMIT, NIGHT_ONLY, DITHER } from './loader.js';
import { addBox, addFrustumY, addPolygon, addPrismX } from './shapes.js';
import { VEHICLES } from './traffic.js';
import { CONFIG } from '../config.js';

const GLOW = EMIT | NIGHT_ONLY;
// Distance of flat details (windows, doors, sign faces) in front of their surface; large enough
// for the depth buffer to keep them apart even far away.
const DECAL = 0.1;
const SIGN_Z = 0.07; // sign plate in front of its post
// Half width of the hill over a tunnel: shoulder edge plus the first terrain column.
const HILL_HALF = 4 + 1.5 + 12;

/** Spacing the pole wires are modelled for; use it as the rule spacing. */
export const POLE_SPACING = 40;
/** Length of the barrier, truss and tunnel segments along the road. */
export const SEGMENT_LENGTH = 10;

function model(name, props, build) {
  const def = { name, verts: [], faces: [], align: 'road', mirrorLeft: false, solid: false, ...props };
  build(def);
  return def;
}

const natural = (radius, height) => ({ align: 'random', scale: [0.8, 1.25], solid: true, collider: { type: 'cylinder', radius, height } });

// Gable roof with the ridge along Z over a box footprint.
function addGableRoof(def, halfX, halfZ, eaveY, ridgeY, ramp, level) {
  const r = [0, ridgeY, 0];
  addPolygon(def, [[halfX, eaveY, halfZ], [halfX, eaveY, -halfZ], [r[0], ridgeY, -halfZ], [r[0], ridgeY, halfZ]], ramp, level);
  addPolygon(def, [[-halfX, eaveY, -halfZ], [-halfX, eaveY, halfZ], [r[0], ridgeY, halfZ], [r[0], ridgeY, -halfZ]], ramp, level);
  addPolygon(def, [[-halfX, eaveY, halfZ], [halfX, eaveY, halfZ], [0, ridgeY, halfZ]], ramp, level - 2);
  addPolygon(def, [[halfX, eaveY, -halfZ], [-halfX, eaveY, -halfZ], [0, ridgeY, -halfZ]], ramp, level - 2);
}

// Rectangle on the road-facing wall (plane x = const, normal -X).
function addWallPanel(def, x, z0, z1, y0, y1, ramp, level, flags = 0) {
  addPolygon(def, [[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], ramp, level, flags);
}

function sign(name, build) {
  return model(name, { solid: true, collider: { type: 'cylinder', radius: 0.1, height: 3 } }, (def) => {
    addFrustumY(def, 0, 0, 0, 2.2, 0.05, 0.05, 3, 'gray', 8);
    build(def);
  });
}

function curveSign(name, dir) {
  return sign(name, (def) => {
    const plate = [[0, 2.15, SIGN_Z], [0.45, 2.6, SIGN_Z], [0, 3.05, SIGN_Z], [-0.45, 2.6, SIGN_Z]];
    addPolygon(def, plate, 'paint3', 13);
    addPolygon(def, plate.map(([x, y]) => [x, y, SIGN_Z]).reverse(), 'gray', 6);
    const arrow = [[-0.18 * dir, 2.42, SIGN_Z + 0.05], [0.22 * dir, 2.6, SIGN_Z + 0.05], [-0.18 * dir, 2.78, SIGN_Z + 0.05]];
    addPolygon(def, dir > 0 ? arrow : arrow.reverse(), 'gray', 1);
  });
}

export const SCENERY = {
  conifer: model('conifer', natural(0.3, 6), (def) => {
    addFrustumY(def, 0, 0, 0, 1.2, 0.18, 0.14, 3, 'brick', 6);
    addFrustumY(def, 0, 0, 1, 4.2, 1.6, 0, 4, 'forest', 12, { bottom: true });
    addFrustumY(def, 0, 0, 3.2, 6.5, 1.1, 0, 4, 'forest', 13, { bottom: true });
  }),
  // Cheap stand-in for back rows that are only ever seen from the road, far away.
  coniferFar: model('coniferFar', { align: 'random', scale: [0.8, 1.4] }, (def) => {
    addFrustumY(def, 0, 0, 0.6, 6.5, 1.6, 0, 4, 'forest', 12);
  }),
  tree: model('tree', natural(0.3, 5), (def) => {
    addFrustumY(def, 0, 0, 0, 2, 0.2, 0.15, 3, 'brick', 6);
    addFrustumY(def, 0, 0, 1.8, 3.4, 0, 1.8, 6, 'grass', 9);
    addFrustumY(def, 0, 0, 3.4, 5.6, 1.8, 0, 6, 'grass', 12);
  }),
  palm: model('palm', natural(0.25, 5), (def) => {
    addFrustumY(def, 0, 0, 0, 5, 0.16, 0.1, 3, 'sand', 7);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const at = (r, da, y) => [r * Math.cos(a + da), y, r * Math.sin(a + da)];
      // Each frond is folded along its spine: two triangles, visible from both sides.
      addPolygon(def, [[0, 5, 0], at(1.2, 0.4, 5.3), at(2.6, 0, 4.2)], 'forest', 12, 0, true);
      addPolygon(def, [[0, 5, 0], at(2.6, 0, 4.2), at(1.2, -0.4, 5.3)], 'forest', 11, 0, true);
    }
  }),
  bush: model('bush', { align: 'random', scale: [0.7, 1.4] }, (def) => {
    addFrustumY(def, 0, 0, 0, 1.1, 0.9, 0, 5, 'forest', 11);
  }),
  cactus: model('cactus', { ...natural(0.35, 3), scale: [0.8, 1.3] }, (def) => {
    addFrustumY(def, 0, 0, 0, 3.2, 0.28, 0.24, 4, 'forest', 10, { top: true });
    addBox(def, [0.2, 1.4, -0.15], [0.9, 1.7, 0.15], 'forest', 10);
    addBox(def, [0.62, 1.7, -0.15], [0.9, 2.5, 0.15], 'forest', 10);
  }),
  rock: model('rock', { align: 'random', scale: [0.6, 1.8], solid: true, collider: { type: 'cylinder', radius: 1.1, height: 1.2 } }, (def) => {
    addFrustumY(def, 0, 0, 0, 1.2, 1.3, 0.7, 5, 'rock', 11, { top: true });
  }),
  pole: model('pole', { solid: true, collider: { type: 'cylinder', radius: 0.15, height: 7 } }, (def) => {
    addFrustumY(def, 0, 0, 0, 7, 0.12, 0.09, 3, 'brick', 5);
    addBox(def, [-1, 6.3, -0.06], [1, 6.45, 0.06], 'brick', 5);
    for (const x of [-0.9, 0.9]) {
      addPolygon(def, [[x, 6.45, 0], [x, 6.45, -POLE_SPACING], [x, 6.53, -POLE_SPACING], [x, 6.53, 0]], 'gray', 2, 0, true);
    }
  }),
  signCurveLeft: curveSign('signCurveLeft', -1),
  signCurveRight: curveSign('signCurveRight', 1),
  // Fork ahead: a blue plate with a split arrow.
  signFork: sign('signFork', (def) => {
    const plate = [[-0.4, 2.15, SIGN_Z], [0.4, 2.15, SIGN_Z], [0.4, 3.05, SIGN_Z], [-0.4, 3.05, SIGN_Z]];
    addPolygon(def, plate, 'paint2', 12);
    addPolygon(def, plate.map(([x, y]) => [x, y, SIGN_Z]).reverse(), 'gray', 6);
    addPolygon(def, [[-0.05, 2.25, SIGN_Z + 0.05], [0.05, 2.25, SIGN_Z + 0.05], [0.05, 2.6, SIGN_Z + 0.05], [-0.05, 2.6, SIGN_Z + 0.05]], 'paint4', 14);
    addPolygon(def, [[-0.3, 2.6, SIGN_Z + 0.05], [-0.05, 2.6, SIGN_Z + 0.05], [-0.18, 2.9, SIGN_Z + 0.05]], 'paint4', 14);
    addPolygon(def, [[0.05, 2.6, SIGN_Z + 0.05], [0.3, 2.6, SIGN_Z + 0.05], [0.18, 2.9, SIGN_Z + 0.05]], 'paint4', 14);
  }),
  signLimit: sign('signLimit', (def) => {
    const plate = [[-0.35, 2.15, SIGN_Z], [0.35, 2.15, SIGN_Z], [0.35, 3.05, SIGN_Z], [-0.35, 3.05, SIGN_Z]];
    addPolygon(def, plate, 'paint4', 14);
    addPolygon(def, plate.map(([x, y]) => [x, y, SIGN_Z]).reverse(), 'gray', 6);
    addPolygon(def, [[-0.25, 2.5, SIGN_Z + 0.05], [0.25, 2.5, SIGN_Z + 0.05], [0.25, 2.66, SIGN_Z + 0.05], [-0.25, 2.66, SIGN_Z + 0.05]], 'paint1', 12);
  }),
  barrier: model('barrier', { mirrorLeft: true, solid: true, collider: { type: 'box', size: [0.2, 0.75, SEGMENT_LENGTH], center: [0, -SEGMENT_LENGTH / 2] } }, (def) => {
    addBox(def, [-0.06, 0.45, -SEGMENT_LENGTH], [0.06, 0.75, 0], 'gray', 11);
    addFrustumY(def, 0, -SEGMENT_LENGTH / 2, 0, 0.45, 0.09, 0.09, 3, 'gray', 7);
  }),
  lamp: model('lamp', { light: [-1.7, 5.7, 0], mirrorLeft: true, solid: true, collider: { type: 'cylinder', radius: 0.12, height: 6 } }, (def) => {
    addFrustumY(def, 0, 0, 0, 6, 0.1, 0.07, 3, 'gray', 7);
    addPolygon(def, [[-1.8, 5.88, 0], [0, 5.88, 0], [0, 6, 0], [-1.8, 6, 0]], 'gray', 7, 0, true);
    addBox(def, [-2, 5.75, -0.2], [-1.4, 5.9, 0.2], 'gray', 9);
    addPolygon(def, [[-2, 5.68, -0.2], [-1.4, 5.68, -0.2], [-1.4, 5.68, 0.2], [-2, 5.68, 0.2]], 'lights', 15, GLOW);
    addPolygon(def, [[-2, 5.75, 0.26], [-1.4, 5.75, 0.26], [-1.4, 5.9, 0.26], [-2, 5.9, 0.26]], 'lights', 15, GLOW);
    addPolygon(def, [[-1.4, 5.75, -0.26], [-2, 5.75, -0.26], [-2, 5.9, -0.26], [-1.4, 5.9, -0.26]], 'lights', 15, GLOW);
  }),
  house: model('house', { mirrorLeft: true, blocksLight: true, solid: true, collider: { type: 'box', size: [8, 5, 7] } }, (def) => {
    addBox(def, [-4, 0, -3.5], [4, 3, 3.5], 'paint4', 12);
    addGableRoof(def, 4.4, 3.8, 2.9, 4.8, 'brick', 10);
    addWallPanel(def, -4 - DECAL, -0.5, 0.5, 0, 2, 'brick', 5);
    for (const z of [-2.8, 1.5]) {
      addWallPanel(def, -4 - DECAL, z, z + 1.3, 1.2, 2.2, 'glass', 5);
      addWallPanel(def, -4 - 2 * DECAL, z, z + 1.3, 1.2, 2.2, 'lights', 12, GLOW);
    }
  }),
  building: model('building', { mirrorLeft: true, blocksLight: true, solid: true, collider: { type: 'box', size: [12, 9, 10] } }, (def) => {
    addBox(def, [-6, 0, -5], [6, 9, 5], 'gray', 12);
    for (const y of [2.2, 5.6]) {
      addWallPanel(def, -6 - DECAL, -4, 4, y, y + 1.6, 'glass', 5);
      addWallPanel(def, -6 - 2 * DECAL, -4, 1, y, y + 1.6, 'lights', 11, GLOW);
    }
  }),
  barn: model('barn', { mirrorLeft: true, blocksLight: true, solid: true, collider: { type: 'box', size: [10, 7, 14] } }, (def) => {
    addBox(def, [-5, 0, -7], [5, 4, 7], 'paint1', 9);
    addGableRoof(def, 5.4, 7.3, 3.9, 6.8, 'gray', 9);
    addWallPanel(def, -5 - DECAL, -1.6, 1.6, 0, 3.2, 'paint4', 12);
  }),
  gasStation: model('gasStation', { light: [-1, 4.1, 0], mirrorLeft: true, solid: true, collider: { type: 'box', size: [0.8, 4.6, 5.6], center: [-1, 0] } }, (def) => {
    addBox(def, [-5, 4.2, -4], [3, 4.6, 4], 'paint4', 13);
    for (const z of [-2.5, 2.5]) addFrustumY(def, -1, z, 0, 4.2, 0.15, 0.15, 3, 'gray', 9);
    addBox(def, [-1.3, 0, -0.4], [-0.7, 1.5, 0.4], 'paint1', 11);
    addPolygon(def, [[-4, 4.2 - DECAL, -3], [2, 4.2 - DECAL, -3], [2, 4.2 - DECAL, 3], [-4, 4.2 - DECAL, 3]], 'lights', 14, GLOW);
  }),
  shop: model('shop', { mirrorLeft: true, blocksLight: true, solid: true, collider: { type: 'box', size: [8, 3.5, 12] } }, (def) => {
    addBox(def, [-4, 0, -6], [4, 3.5, 6], 'paint4', 11);
    addWallPanel(def, -4 - DECAL, -5, 5, 0.8, 2.6, 'glass', 5);
    addWallPanel(def, -4 - 2 * DECAL, -5, 5, 0.8, 2.6, 'lights', 12, GLOW);
  }),
  // Tunnel segment: walls and ceiling inside, and the top of the hill above (it meets the first
  // terrain column, which the track raises to the same height over a tunnel).
  tunnel: model('tunnel', { solid: true, collider: [-6.3, 6.3].map((x) => ({ type: 'box', size: [0.6, 5, SEGMENT_LENGTH], center: [x, -SEGMENT_LENGTH / 2] })) }, (def) => {
    const L = -SEGMENT_LENGTH, top = CONFIG.terrain.tunnelRise, half = HILL_HALF;
    addWallPanel(def, 6, L, 0, 0, 5, 'gray', 8);
    addPolygon(def, [[-6, 0, 0], [-6, 0, L], [-6, 5, L], [-6, 5, 0]], 'gray', 8);
    addPolygon(def, [[-6, 5, L], [6, 5, L], [6, 5, 0], [-6, 5, 0]], 'gray', 6);
    addPolygon(def, [[-half, top, 0], [half, top, 0], [half, top, L], [-half, top, L]], 'grass', 12);
  }),
  // Portal: a concrete face around the opening, facing the approaching driver (+Z).
  tunnelPortal: model('tunnelPortal', { solid: false }, (def) => {
    const top = CONFIG.terrain.tunnelRise + 0.4, half = HILL_HALF;
    addPolygon(def, [[-half, 0, 0], [-6, 0, 0], [-6, top, 0], [-half, top, 0]], 'gray', 9);
    addPolygon(def, [[6, 0, 0], [half, 0, 0], [half, top, 0], [6, top, 0]], 'gray', 9);
    addPolygon(def, [[-6, 5, 0], [6, 5, 0], [6, top, 0], [-6, top, 0]], 'gray', 10);
  }),
  bridgeRail: model('bridgeRail', { mirrorLeft: true, solid: true, collider: { type: 'box', size: [0.3, 0.8, SEGMENT_LENGTH], center: [0, -SEGMENT_LENGTH / 2] } }, (def) => {
    addBox(def, [-0.15, 0, -SEGMENT_LENGTH], [0.15, 0.8, 0], 'gray', 12);
  }),
  // Pier standing out of the bridge side wall down into the water.
  bridgePier: model('bridgePier', {}, (def) => {
    addBox(def, [-0.8, -CONFIG.terrain.bridgeDepth - 1, -1], [0.8, -0.2, 1], 'gray', 9);
  }),
  // Paved lot beside the road; the slab is thick enough to sit on uneven ground.
  parkingLot: model('parkingLot', {}, (def) => {
    addBox(def, [-12, -0.5, -8], [12, 0.12, 8], 'asphalt', 9);
    for (let k = 0; k <= 5; k++) {
      const z = -8 + 1 + k * 2.8;
      addPolygon(def, [[-10, 0.16, z + 0.08], [-4, 0.16, z + 0.08], [-4, 0.16, z - 0.08], [-10, 0.16, z - 0.08]], 'roadLine', 13);
    }
  }),
  fence: model('fence', { solid: true, collider: { type: 'box', size: [0.2, 1.2, SEGMENT_LENGTH], center: [0, -SEGMENT_LENGTH / 2] } }, (def) => {
    for (const z of [0, -5, -SEGMENT_LENGTH + 0.2]) addFrustumY(def, 0, z, 0, 1.2, 0.08, 0.07, 3, 'brick', 7);
    for (const y of [0.5, 1]) addPolygon(def, [[0, y, 0], [0, y, -SEGMENT_LENGTH], [0, y + 0.15, -SEGMENT_LENGTH], [0, y + 0.15, 0]], 'brick', 9, 0, true);
  }),
  hayBale: model('hayBale', { align: 'random', scale: [0.9, 1.2] }, (def) => {
    addPrismX(def, -0.7, 0.7, 0.7, 0, 0.7, 6, ['paint3', 9], ['paint3', 11]);
  }),
  billboard: model('billboard', { solid: true, collider: [-3, 3].map((x) => ({ type: 'box', size: [0.3, 6, 0.3], center: [x, 0] })) }, (def) => {
    for (const x of [-3, 3]) addFrustumY(def, x, 0, 0, 3.2, 0.15, 0.15, 4, 'gray', 7);
    addBox(def, [-4, 3, -0.1], [4, 6, 0.1], 'paint4', 13);
    addPolygon(def, [[-3.6, 4.6, 0.1 + DECAL], [3.6, 4.6, 0.1 + DECAL], [3.6, 5.6, 0.1 + DECAL], [-3.6, 5.6, 0.1 + DECAL]], 'paint1', 12);
    addPolygon(def, [[-3.6, 3.4, 0.1 + DECAL], [1, 3.4, 0.1 + DECAL], [1, 4.2, 0.1 + DECAL], [-3.6, 4.2, 0.1 + DECAL]], 'paint2', 12);
  }),
  // Overhead sign spanning the road (placed on the centerline).
  gantry: model('gantry', { solid: true, collider: [-7.5, 7.5].map((x) => ({ type: 'box', size: [0.5, 7, 0.5], center: [x, 0] })) }, (def) => {
    for (const x of [-7.5, 7.5]) addFrustumY(def, x, 0, 0, 7, 0.25, 0.2, 4, 'gray', 8);
    addBox(def, [-7.5, 6.5, -0.3], [7.5, 7.1, 0.3], 'gray', 9);
    addPolygon(def, [[-3, 5.1, 0.3 + DECAL], [3, 5.1, 0.3 + DECAL], [3, 6.5, 0.3 + DECAL], [-3, 6.5, 0.3 + DECAL]], 'paint2', 11);
    addPolygon(def, [[-2.4, 5.6, 0.3 + 2 * DECAL], [2.4, 5.6, 0.3 + 2 * DECAL], [2.4, 5.9, 0.3 + 2 * DECAL], [-2.4, 5.9, 0.3 + 2 * DECAL]], 'paint4', 14);
  }),
  waterTower: model('waterTower', { solid: true, collider: { type: 'cylinder', radius: 0.6, height: 13 } }, (def) => {
    addFrustumY(def, 0, 0, 0, 10, 0.5, 0.4, 3, 'gray', 8);
    addFrustumY(def, 0, 0, 10, 13, 3, 3, 6, 'paint4', 12, { bottom: true });
    addFrustumY(def, 0, 0, 13, 14.5, 3.2, 0, 6, 'brick', 9);
  }),
  windpump: model('windpump', { solid: true, collider: { type: 'cylinder', radius: 0.8, height: 9 } }, (def) => {
    addFrustumY(def, 0, 0, 0, 9, 1.2, 0.2, 4, 'gray', 8);
    const wheel = Array.from({ length: 8 }, (unused, k) => [1.5 * Math.cos((k / 8) * Math.PI * 2), 9 + 1.5 * Math.sin((k / 8) * Math.PI * 2), 0.3]);
    addPolygon(def, wheel, 'gray', 11, 0, true);
    addPolygon(def, [[0, 8.8, -0.2], [0, 8.8, -2.2], [0, 9.6, -2.2], [0, 9.6, -0.2]], 'paint1', 10, 0, true);
  }),
  deadTree: model('deadTree', natural(0.25, 4), (def) => {
    addFrustumY(def, 0, 0, 0, 3.5, 0.2, 0.08, 3, 'brick', 5);
    for (const [x, z, y] of [[0.9, 0.3, 2.2], [-0.7, 0.5, 2.8], [0.2, -0.9, 3.1]]) {
      const b = def.verts.length;
      def.verts.push([0.05, y - 0.6, 0.05], [-0.05, y - 0.6, -0.05], [0.07, y - 0.6, -0.07], [x, y + 0.6, z]);
      def.faces.push([b, b + 1, b + 3, 'brick', 4, 0], [b + 1, b + 2, b + 3, 'brick', 5, 0], [b + 2, b, b + 3, 'brick', 6, 0]);
    }
  }),
  logPile: model('logPile', { align: 'road', solid: true, collider: { type: 'box', size: [5, 1.2, 1.6] } }, (def) => {
    addPrismX(def, -2.5, 2.5, 0.35, -0.38, 0.35, 6, ['brick', 7], ['sand', 11]);
    addPrismX(def, -2.3, 2.3, 0.35, 0.38, 0.35, 6, ['brick', 7], ['sand', 11]);
  }),
  lifeguardTower: model('lifeguardTower', { solid: true, collider: { type: 'box', size: [2, 4, 2] } }, (def) => {
    for (const x of [-0.8, 0.8]) addFrustumY(def, x, 0, 0, 2.2, 0.1, 0.1, 3, 'paint4', 11);
    addBox(def, [-1, 2.2, -1], [1, 3.6, 1], 'paint4', 13);
    addFrustumY(def, 0, 0, 3.6, 4.4, 1.5, 0, 4, 'paint1', 11);
  }),
  picnicTable: model('picnicTable', { solid: true, collider: { type: 'box', size: [2, 1, 1.6] } }, (def) => {
    addBox(def, [-1, 0.7, -0.4], [1, 0.8, 0.4], 'brick', 9);
    for (const z of [-0.75, 0.75]) addBox(def, [-1, 0.4, z - 0.15], [1, 0.48, z + 0.15], 'brick', 8);
  }),
  mailbox: model('mailbox', { solid: true, collider: { type: 'cylinder', radius: 0.15, height: 1.3 } }, (def) => {
    addFrustumY(def, 0, 0, 0, 1, 0.05, 0.05, 3, 'brick', 6);
    addBox(def, [-0.2, 1, -0.3], [0.2, 1.3, 0.3], 'paint2', 10);
  }),
  cabin: model('cabin', { mirrorLeft: true, solid: true, collider: { type: 'box', size: [5, 4, 6] } }, (def) => {
    addBox(def, [-2.5, 0, -3], [2.5, 2.6, 3], 'brick', 8);
    addGableRoof(def, 2.9, 3.3, 2.5, 4, 'gray', 7);
    addWallPanel(def, -2.5 - DECAL, -0.5, 0.5, 0, 1.9, 'brick', 4);
  }),
  // Spruce with snow on its top cone.
  snowPine: model('snowPine', natural(0.3, 6), (def) => {
    addFrustumY(def, 0, 0, 0, 1.2, 0.18, 0.14, 3, 'brick', 5);
    addFrustumY(def, 0, 0, 1, 4.4, 1.7, 0, 4, 'forest', 11, { bottom: true });
    addFrustumY(def, 0, 0, 3.4, 6.8, 1.1, 0, 4, 'paint4', 13, { bottom: true });
  }),
  snowBank: model('snowBank', { align: 'random', scale: [0.8, 2] }, (def) => {
    addFrustumY(def, 0, 0, -0.2, 0.8, 1.6, 0.5, 5, 'paint4', 13, { top: true });
  }),
  // Giant redwood: a tall red trunk with a narrow crown high up.
  redwood: model('redwood', { ...natural(1, 24), scale: [0.85, 1.25] }, (def) => {
    addFrustumY(def, 0, 0, 0, 16, 1.1, 0.55, 4, 'brick', 7);
    addFrustumY(def, 0, 0, 9, 18, 4.2, 0, 5, 'forest', 10, { bottom: true });
    addFrustumY(def, 0, 0, 15, 27, 3.2, 0, 5, 'forest', 12, { bottom: true });
  }),
  // Lighthouse: white and red tower, lantern room glowing at night; `beacon` is where the
  // rotating beam turns (drawn by the race scene).
  lighthouse: model('lighthouse', { solid: true, collider: { type: 'cylinder', radius: 2, height: 18 }, beacon: [0, 17, 0] }, (def) => {
    addFrustumY(def, 0, 0, 0, 9, 2, 1.7, 5, 'paint4', 13);
    addFrustumY(def, 0, 0, 9, 16, 1.7, 1.4, 5, 'paint1', 11);
    addFrustumY(def, 0, 0, 16, 18, 1.1, 1.1, 4, 'glass', 6, { top: true });
    addFrustumY(def, 0, 0, 16.05, 17.9, 1.15, 1.15, 4, 'lights', 15, { flags: GLOW });
  }),
  birch: model('birch', natural(0.2, 6), (def) => {
    addFrustumY(def, 0, 0, 0, 3, 0.13, 0.1, 3, 'paint4', 12);
    addFrustumY(def, 0, 0, 2.5, 4.2, 0, 1.3, 5, 'grass', 11);
    addFrustumY(def, 0, 0, 4.2, 6.5, 1.3, 0, 5, 'grass', 13);
  }),
  truss: model('truss', { mirrorLeft: true, solid: true, collider: { type: 'box', size: [0.3, 4.8, SEGMENT_LENGTH], center: [0, -SEGMENT_LENGTH / 2] } }, (def) => {
    const half = SEGMENT_LENGTH / 2;
    addBox(def, [-0.15, 4.5, -SEGMENT_LENGTH], [0.15, 4.8, 0], 'brick', 9);
    addPolygon(def, [[0, 0.6, 0], [0, 0.6, -0.5], [0, 4.5, -half - 0.25], [0, 4.5, -half + 0.25]], 'brick', 8, 0, true);
    addPolygon(def, [[0, 4.5, -half + 0.25], [0, 4.5, -half - 0.25], [0, 0.6, -SEGMENT_LENGTH], [0, 0.6, -SEGMENT_LENGTH + 0.5]], 'brick', 8, 0, true);
  }),
};

// Parked cars: the low-detail traffic models standing still, one paint each.
for (const [name, type, paint] of [['parkedSedan', 'sedan', 'paint2'], ['parkedWagon', 'wagon', 'paint3'], ['parkedVan', 'van', 'paint4'], ['parkedRed', 'sedan', 'paint1']]) {
  const vehicle = VEHICLES[type];
  SCENERY[name] = {
    ...vehicle.lod, name, align: 'road', mirrorLeft: false, solid: true, collider: vehicle.def.collider,
    paint, lift: vehicle.def.wheelRadius, yawOffset: Math.PI / 2,
  };
}

/** Lighthouse beam: two long flat rays, turned around the lantern at night. */
export const LIGHTHOUSE_BEAM = { name: 'lighthouseBeam', verts: [], faces: [] };
for (const dir of [-1, 1]) {
  addPolygon(LIGHTHOUSE_BEAM, [[0, -0.3, 0], [dir * 90, -2, -3], [dir * 90, 2, 3], [0, 0.3, 0]], 'lights', 11, GLOW | DITHER, true);
}
