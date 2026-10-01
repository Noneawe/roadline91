// SPDX-License-Identifier: AGPL-3.0-or-later
// Car specifications (fictional). All per-car tuning lives here; `expected` holds the design
// targets checked by the physics tests. `model` names the mesh (models/), `rainLoss` the share of
// the weather's grip loss the car suffers (below 1 = better in the rain).

export const VEKTOR_GT_SPEC = {
  name: 'Vektor GT',
  model: 'vektorGt',
  blurb: ['WEDGE COUPE, POP-UP LAMPS', 'ALL-ROUNDER'],
  paint: 'paint1',
  rainLoss: 1,
  mass: 1300, // kg
  inertia: 1900, // kg m^2 around the vertical axis
  wheelbase: 2.65, // m
  cgToFront: 1.25, // m from the center of gravity to the front axle
  track: 1.6, // m between left and right wheels
  wheelRadius: 0.3, // m
  corneringFront: 75000, // N/rad per axle
  corneringRear: 85000,
  grip: 1, // friction coefficient on asphalt
  frontGrip: 0.88, // front axle share of grip: below 1 the car understeers at the limit off throttle
  tractionFactor: 1.2, // rear load gain under acceleration
  yawDamping: 2500, // N m per rad/s, stabilises slides
  powerOversteer: 0.6, // share of the drive force that takes lateral grip from the rear axle
  drag: 0.43, // N per (m/s)^2
  rolling: 0.015, // rolling resistance coefficient on asphalt
  brakeForce: 14000, // N at full pedal
  steerMax: 0.5, // rad at standstill
  steerSpeed: 16, // m/s at which the steering lock halves
  torqueCurve: [[1000, 180], [2000, 240], [3500, 290], [4500, 300], [5500, 285], [6500, 250], [7000, 220]], // rpm -> Nm
  idleRpm: 900,
  redlineRpm: 7000, // ignition cut
  launchRpm: 3000, // clutch slip target at full throttle from standstill
  engineBrake: 60, // Nm at redline with closed throttle
  gears: [3.2, 2.0, 1.4, 1.05, 0.82],
  reverse: 3.0,
  finalDrive: 3.7,
  efficiency: 0.88,
  shiftUpRpm: 6500,
  shiftDownRpm: 2500,
  shiftTime: 0.2, // s without drive during a shift
  // Engine sound: firing frequency = rpm / 60 * cylinders / 2; FM modulator at `ratio` x firing
  // with `index`, `sub` level of the sub-octave, base low-pass cutoff in Hz.
  sound: { cylinders: 8, wave: 'sawtooth', ratio: 0.5, index: 0.8, sub: 0.5, cutoff: 500 },
  expected: {
    gearVmaxKmh: [[62, 72], [100, 114], [145, 161], [194, 214], [235, 260]],
    zeroToHundredS: [5, 7],
    brakingFrom100M: [33, 45],
  },
};

export const AURORA_MR_SPEC = {
  ...VEKTOR_GT_SPEC,
  name: 'Aurora MR',
  model: 'auroraMr',
  blurb: ['MID-ENGINE GT', 'FASTEST, NERVOUS AT THE LIMIT'],
  paint: 'paint3',
  mass: 1350,
  inertia: 1800, // low for its size: quick to rotate
  wheelbase: 2.55,
  cgToFront: 1.35, // engine behind the driver: weight on the rear axle
  corneringFront: 78000,
  corneringRear: 92000,
  grip: 1.04,
  frontGrip: 0.9,
  tractionFactor: 1.2,
  yawDamping: 2100,
  powerOversteer: 0.55,
  drag: 0.36,
  brakeForce: 15000,
  steerMax: 0.48,
  steerSpeed: 15,
  torqueCurve: [[1000, 200], [2500, 290], [4000, 360], [5500, 400], [6500, 395], [7300, 360], [7800, 320]],
  redlineRpm: 7800,
  launchRpm: 3500,
  gears: [3.1, 1.85, 1.5, 1.17, 0.95],
  finalDrive: 3.55,
  shiftUpRpm: 7300,
  shiftDownRpm: 3000,
  sound: { cylinders: 12, wave: 'sawtooth', ratio: 1.5, index: 0.6, sub: 0.25, cutoff: 900 },
  rainLoss: 1.15,
  expected: {
    gearVmaxKmh: [[75, 86], [126, 142], [156, 176], [200, 225], [250, 275]],
    zeroToHundredS: [4.3, 5.4],
    brakingFrom100M: [31, 40],
  },
};

export const BREEZE_R_SPEC = {
  ...VEKTOR_GT_SPEC,
  name: 'Breeze R',
  model: 'breezeR',
  blurb: ['LIGHT OPEN ROADSTER', 'BEST IN CORNERS, LOW TOP SPEED'],
  paint: 'paint2',
  mass: 980,
  inertia: 1150,
  wheelbase: 2.3,
  cgToFront: 1.12,
  wheelRadius: 0.28,
  corneringFront: 72000,
  corneringRear: 78000,
  grip: 1.12,
  frontGrip: 0.95,
  tractionFactor: 1.15,
  yawDamping: 2100,
  powerOversteer: 0.6,
  drag: 0.5, // open top
  brakeForce: 11500,
  steerMax: 0.52,
  steerSpeed: 18,
  torqueCurve: [[1000, 120], [2500, 160], [4000, 185], [5500, 195], [6500, 185], [7500, 165]],
  redlineRpm: 7500,
  launchRpm: 3500,
  gears: [3.4, 2.2, 1.6, 1.25, 1.0],
  finalDrive: 4.0,
  shiftUpRpm: 7100,
  shiftDownRpm: 3200,
  sound: { cylinders: 4, wave: 'square', ratio: 2, index: 0.5, sub: 0.15, cutoff: 1200 },
  rainLoss: 1,
  expected: {
    gearVmaxKmh: [[54, 62], [84, 96], [116, 132], [148, 168], [188, 208]],
    zeroToHundredS: [5.2, 6.6],
    brakingFrom100M: [28, 36],
  },
};

export const KESTREL_S_SPEC = {
  ...VEKTOR_GT_SPEC,
  name: 'Kestrel S',
  model: 'kestrelS',
  blurb: ['SPORTS SEDAN', 'STABLE, SURE-FOOTED IN THE RAIN'],
  paint: 'paint4',
  mass: 1480,
  inertia: 2500,
  wheelbase: 2.75,
  cgToFront: 1.25,
  wheelRadius: 0.31,
  corneringFront: 82000,
  corneringRear: 102000,
  grip: 0.98,
  frontGrip: 0.88, // understeers before it oversteers
  tractionFactor: 1.15,
  yawDamping: 2800,
  powerOversteer: 0.6,
  drag: 0.5,
  brakeForce: 15500,
  steerMax: 0.48,
  steerSpeed: 15,
  torqueCurve: [[1000, 200], [2000, 265], [3500, 310], [4500, 315], [5500, 295], [6500, 255]],
  redlineRpm: 6500,
  gears: [3.3, 2.05, 1.42, 1.06, 0.84],
  finalDrive: 3.6,
  shiftUpRpm: 6100,
  shiftDownRpm: 2300,
  sound: { cylinders: 6, wave: 'sawtooth', ratio: 1, index: 0.9, sub: 0.4, cutoff: 600 },
  rainLoss: 0.55,
  expected: {
    gearVmaxKmh: [[60, 68], [97, 110], [140, 158], [188, 210], [222, 246]],
    zeroToHundredS: [6.2, 7.6],
    brakingFrom100M: [33, 43],
  },
};

export const CARS = [VEKTOR_GT_SPEC, AURORA_MR_SPEC, BREEZE_R_SPEC, KESTREL_S_SPEC];
