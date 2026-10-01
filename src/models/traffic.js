// SPDX-License-Identifier: AGPL-3.0-or-later
// Traffic vehicles (fictional, 80-200 triangles) with box LODs: sedan, wagon, van, truck.
// `cruise` is the range of cruising speeds in m/s used by the traffic AI.

import { addBox } from './shapes.js';
import { buildVehicle, addQuadZ } from './carBody.js';
import { EMIT } from './loader.js';

const LOD_DISTANCE = 120;
const WHEELS = { x0: 0.64, x1: 0.88, radius: 0.3, sides: 6 };
const BODY = ['body', 14, 'body', 13], GLASS = ['glass', 7, 'glass', 6], ROOF = ['body', 14, 'glass', 6];
// Shared front end of the passenger cars: nose, hood end, windshield base, roof front.
const CAR_FRONT = [
  [-2.2, 0.72, -0.12, 0.8, 0.3, 0.74, 0.36],
  [-1.4, 0.84, -0.14, 0.86, 0.42, 0.78, 0.48],
  [-0.7, 0.84, -0.14, 0.86, 0.46, 0.78, 0.52],
  [-0.1, 0.84, -0.14, 0.86, 0.5, 0.62, 1],
];
const CAR_LIGHTS = { front: [0.4, 0.05, 0.7, 0.2], rear: [0.36, 0.18, 0.74, 0.34] };

const SEDAN_STATIONS = [
  ...CAR_FRONT,
  [0.9, 0.84, -0.14, 0.86, 0.5, 0.62, 1],
  [1.5, 0.84, -0.14, 0.86, 0.5, 0.76, 0.56],
  [2.1, 0.82, -0.12, 0.84, 0.48, 0.76, 0.54],
  [2.2, 0.78, -0.06, 0.8, 0.42, 0.72, 0.48],
];
const SEDAN_SEGMENTS = [BODY, BODY, GLASS, ROOF, ['glass', 7, 'body', 13], BODY, BODY];
const SEDAN_LOD_BOXES = [[[-0.86, -0.14, -2.2], [0.86, 0.5, 2.2], 'body', 12], [[-0.62, 0.5, -0.4], [0.62, 1, 1.2], 'glass', 6]];

const sedan = buildVehicle({
  name: 'sedan', size: [1.72, 1.3, 4.4], lodDistance: LOD_DISTANCE,
  stations: SEDAN_STATIONS, segments: SEDAN_SEGMENTS,
  front: ['gray', 5], rear: ['body', 11],
  wheels: { ...WHEELS, axles: [-1.35, 1.35] }, lights: CAR_LIGHTS,
  lodBoxes: SEDAN_LOD_BOXES,
});

const wagon = buildVehicle({
  name: 'wagon', size: [1.72, 1.3, 4.4], lodDistance: LOD_DISTANCE,
  stations: [
    ...CAR_FRONT,
    [1.9, 0.84, -0.14, 0.86, 0.5, 0.62, 1],
    [2.15, 0.84, -0.14, 0.86, 0.5, 0.7, 0.6],
    [2.2, 0.78, -0.06, 0.8, 0.42, 0.7, 0.5],
  ],
  segments: [BODY, BODY, GLASS, ROOF, GLASS, BODY],
  front: ['gray', 5], rear: ['body', 11],
  wheels: { ...WHEELS, axles: [-1.35, 1.35] }, lights: CAR_LIGHTS,
  lodBoxes: [[[-0.86, -0.14, -2.2], [0.86, 0.5, 2.2], 'body', 12], [[-0.62, 0.5, -0.4], [0.62, 1, 2.1], 'glass', 6]],
});

const van = buildVehicle({
  name: 'van', size: [1.84, 1.85, 4.8], lodDistance: LOD_DISTANCE,
  stations: [
    [-2.4, 0.8, -0.12, 0.88, 0.45, 0.8, 0.55],
    [-1.9, 0.9, -0.14, 0.92, 0.7, 0.84, 0.8],
    [-1.3, 0.9, -0.14, 0.92, 0.8, 0.78, 1.55],
    [2.3, 0.9, -0.14, 0.92, 0.8, 0.78, 1.55],
    [2.4, 0.88, -0.1, 0.9, 0.75, 0.76, 1.5],
  ],
  segments: [BODY, GLASS, BODY, BODY],
  front: ['gray', 5], rear: ['body', 11],
  wheels: { ...WHEELS, x0: 0.7, x1: 0.94, axles: [-1.5, 1.5] },
  lights: { front: [0.45, 0.1, 0.75, 0.3], rear: [0.55, 0.2, 0.85, 0.5] },
  lodBoxes: [[[-0.92, -0.14, -2.4], [0.92, 0.8, 2.4], 'body', 12], [[-0.8, 0.8, -1.5], [0.8, 1.55, 2.35], 'body', 14]],
});

const TRUCK_REAR = 4;
const truck = buildVehicle({
  name: 'truck', size: [2.4, 3.5, 8], lodDistance: LOD_DISTANCE, rearZ: TRUCK_REAR,
  stations: [
    [-4, 1, -0.05, 1.08, 1, 1, 2.1],
    [-3.8, 1.05, -0.1, 1.1, 1, 1, 2.2],
    [-2.5, 1.05, -0.1, 1.1, 1, 1, 2.2],
  ],
  segments: [BODY, BODY],
  front: ['body', 11], rear: ['body', 11],
  extra: (def) => {
    addQuadZ(def, -0.85, 1.2, 0.85, 2, -4.08, -1, 'glass', 6, 0);
    addBox(def, [-0.9, 0, -2.5], [0.9, 0.4, TRUCK_REAR], 'gray', 4);
    addBox(def, [-1.2, 0.4, -2.3], [1.2, 3.1, TRUCK_REAR], 'paint4', 13);
  },
  wheels: { x0: 0.75, x1: 1.15, radius: 0.45, sides: 6, axles: [-3.2, 1.8, 3.1] },
  lights: { front: [0.55, 0.1, 0.9, 0.3], rear: [0.7, 0.45, 1.1, 0.7] },
  lodAxles: [-3.2, 2.5],
  lodBoxes: [
    [[-1.05, -0.1, -4], [1.05, 2.2, -2.5], 'body', 12],
    [[-1.2, 0.4, -2.3], [1.2, 3.1, TRUCK_REAR], 'paint4', 13],
    [[-0.9, 0, -2.5], [0.9, 0.4, TRUCK_REAR], 'gray', 4],
  ],
});

// Police car: the sedan with a light bar. Three variants of the bar (red lit, blue lit, off) are
// swapped while flashing.
function policeCar(name, red, blue) {
  const bar = (def) => {
    addBox(def, [-0.6, 1, 0.2], [0.6, 1.12, 0.5], 'gray', 3);
    for (const [z, facing] of [[0.15, -1], [0.55, 1]]) {
      addQuadZ(def, -0.58, 1.01, -0.02, 1.11, z, facing, 'paint1', red ? 14 : 5, red ? EMIT : 0);
      addQuadZ(def, 0.02, 1.01, 0.58, 1.11, z, facing, 'paint2', blue ? 14 : 5, blue ? EMIT : 0);
    }
  };
  const car = buildVehicle({
    name, size: [1.72, 1.3, 4.4], lodDistance: LOD_DISTANCE,
    stations: SEDAN_STATIONS, segments: SEDAN_SEGMENTS,
    front: ['gray', 5], rear: ['body', 11],
    wheels: { ...WHEELS, axles: [-1.35, 1.35] }, lights: CAR_LIGHTS,
    extra: bar,
    lodBoxes: SEDAN_LOD_BOXES,
  });
  bar(car.lod);
  return car;
}

/** Police car variants: bar off, red phase, blue phase. */
export const POLICE = {
  police: policeCar('police', false, false),
  policeRed: policeCar('policeRed', true, false),
  policeBlue: policeCar('policeBlue', false, true),
};

/** Vehicle types by name: full model, LOD model and AI parameters. */
export const VEHICLES = {
  sedan: { ...sedan, cruise: [22, 30] },
  wagon: { ...wagon, cruise: [20, 27] },
  van: { ...van, cruise: [18, 25] },
  truck: { ...truck, cruise: [15, 21] },
};
