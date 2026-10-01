// SPDX-License-Identifier: AGPL-3.0-or-later
// Zones: each has its own base colors for some palette ramps (terrain is drawn with the same ramp
// names everywhere, the palette gives the zone its character), hill height, default scenery and
// optionally a shorter draw distance (`distance`, m).

export const ZONES = {
  coast: {
    ramps: { grass: [80, 170, 70], forest: [40, 125, 60], sand: [225, 200, 140], rock: [150, 130, 110], sky: [90, 160, 230] },
    hills: 0.6,
    scenery: [
      { rule: 'every', spacing: 25, obj: 'palm', side: 'both', offset: [4, 14], jitter: 0.6 },
      { rule: 'every', spacing: 18, obj: 'bush', side: 'both', offset: [6, 40], jitter: 1 },
      { rule: 'every', spacing: 70, obj: 'rock', side: 'both', offset: [8, 50], jitter: 1 },
      { rule: 'every', spacing: 450, obj: 'lifeguardTower', side: 'left', offset: [25, 40] },
      { rule: 'every', spacing: 380, obj: 'picnicTable', side: 'right', offset: [10, 20] },
      { rule: 'every', spacing: 1100, obj: 'billboard', side: 'right', offset: 18 },
    ],
  },
  mountains: {
    ramps: { grass: [95, 120, 85], forest: [25, 80, 45], sand: [150, 140, 130], rock: [130, 130, 138], sky: [115, 160, 220] },
    hills: 2,
    scenery: [
      { rule: 'every', spacing: 16, obj: 'conifer', side: 'both', offset: [6, 25], jitter: 1 },
      { rule: 'every', spacing: 14, obj: 'coniferFar', side: 'both', offset: [25, 70], jitter: 1 },
      { rule: 'every', spacing: 22, obj: 'rock', side: 'both', offset: [3, 40], jitter: 1 },
      { rule: 'every', spacing: 700, obj: 'cabin', side: 'both', offset: [20, 40] },
      { rule: 'every', spacing: 450, obj: 'logPile', side: 'both', offset: [8, 20] },
    ],
  },
  forest: {
    ramps: { grass: [50, 120, 50], forest: [20, 88, 40], sand: [120, 100, 70], rock: [110, 105, 95], sky: [100, 155, 215] },
    hills: 1,
    scenery: [
      { rule: 'every', spacing: 13, obj: 'conifer', side: 'both', offset: [4, 25], jitter: 1 },
      { rule: 'every', spacing: 10, obj: 'coniferFar', side: 'both', offset: [25, 70], jitter: 1 },
      { rule: 'every', spacing: 18, obj: 'tree', side: 'both', offset: [5, 40], jitter: 1 },
      { rule: 'every', spacing: 20, obj: 'bush', side: 'both', offset: [3, 12], jitter: 1 },
      { rule: 'every', spacing: 350, obj: 'logPile', side: 'both', offset: [6, 15] },
      { rule: 'every', spacing: 55, obj: 'birch', side: 'both', offset: [6, 40], jitter: 1 },
      { rule: 'every', spacing: 900, obj: 'cabin', side: 'both', offset: [25, 45] },
    ],
  },
  suburbs: {
    ramps: { grass: [95, 165, 80], forest: [45, 115, 55], sand: [170, 170, 165], rock: [140, 135, 130], sky: [105, 165, 225] },
    hills: 0.3,
    scenery: [
      { rule: 'every', spacing: 38, obj: 'house', side: 'both', offset: 14 },
      { rule: 'every', spacing: 96, obj: 'building', side: 'left', offset: 34 },
      { rule: 'every', spacing: 30, obj: 'lamp', side: 'both', offset: 0.8 },
      { rule: 'every', spacing: 22, obj: 'tree', side: 'both', offset: [5, 8], jitter: 0.5 },
      { rule: 'every', spacing: 48, obj: 'mailbox', side: 'both', offset: 3 },
      { rule: 'every', spacing: 900, obj: 'billboard', side: 'right', offset: 20 },
      { rule: 'every', spacing: 240, obj: 'parkedWagon', side: 'both', offset: 1.5 },
    ],
  },
  highway: {
    ramps: { grass: [140, 160, 80], forest: [60, 110, 50], sand: [160, 155, 140], rock: [135, 125, 110], sky: [95, 160, 230] },
    hills: 0.4,
    scenery: [
      { rule: 'every', spacing: 40, obj: 'lamp', side: 'both', offset: 0.8 },
      { rule: 'every', spacing: 10, obj: 'barrier', side: 'both', offset: 0.3 },
      { rule: 'every', spacing: 40, obj: 'pole', side: 'left', offset: 9 },
      { rule: 'every', spacing: 30, obj: 'bush', side: 'both', offset: [8, 50], jitter: 1 },
      { rule: 'every', spacing: 1500, obj: 'gantry', side: 'center', offset: 0 },
      { rule: 'every', spacing: 700, obj: 'billboard', side: 'both', offset: [25, 35] },
      { rule: 'every', spacing: 70, obj: 'hayBale', side: 'both', offset: [30, 90], jitter: 1 },
    ],
  },
  desert: {
    ramps: { grass: [205, 165, 100], forest: [105, 140, 60], sand: [185, 145, 90], rock: [185, 110, 70], sky: [125, 178, 236] },
    hills: 1.2,
    scenery: [
      { rule: 'every', spacing: 28, obj: 'cactus', side: 'both', offset: [5, 50], jitter: 1 },
      { rule: 'every', spacing: 30, obj: 'rock', side: 'both', offset: [4, 60], jitter: 1 },
      { rule: 'every', spacing: 40, obj: 'pole', side: 'right', offset: 5 },
      { rule: 'every', spacing: 800, obj: 'windpump', side: 'both', offset: [20, 40] },
      { rule: 'every', spacing: 2000, obj: 'waterTower', side: 'left', offset: 30 },
      { rule: 'every', spacing: 70, obj: 'deadTree', side: 'both', offset: [8, 60], jitter: 1 },
      { rule: 'every', spacing: 1500, obj: 'billboard', side: 'right', offset: 22 },
    ],
  },
  // High mountains in winter.
  snow: {
    ramps: { grass: [226, 231, 238], forest: [40, 78, 62], sand: [172, 174, 182], rock: [118, 120, 132], sky: [150, 172, 205] },
    hills: 2,
    distance: 480, // winter haze: shorter view, which also keeps the stacked switchbacks in budget
    scenery: [
      { rule: 'every', spacing: 26, obj: 'snowPine', side: 'both', offset: [6, 30], jitter: 1 },
      { rule: 'every', spacing: 35, obj: 'coniferFar', side: 'both', offset: [30, 70], jitter: 1 },
      { rule: 'every', spacing: 60, obj: 'snowBank', side: 'both', offset: [1, 8], jitter: 1 },
      { rule: 'every', spacing: 60, obj: 'rock', side: 'both', offset: [5, 40], jitter: 1 },
      { rule: 'every', spacing: 800, obj: 'cabin', side: 'both', offset: [20, 40] },
    ],
  },
  // Red rock canyon: the walls come from the track's canyon pieces.
  canyon: {
    ramps: { grass: [196, 118, 72], forest: [104, 124, 62], sand: [182, 132, 92], rock: [168, 82, 52], sky: [118, 172, 232] },
    hills: 0.6,
    scenery: [
      { rule: 'every', spacing: 35, obj: 'rock', side: 'both', offset: [4, 40], jitter: 1 },
      { rule: 'every', spacing: 90, obj: 'deadTree', side: 'both', offset: [5, 40], jitter: 1 },
      { rule: 'every', spacing: 80, obj: 'cactus', side: 'both', offset: [5, 40], jitter: 1 },
    ],
  },
  // Dense forest of giant redwoods.
  redwood: {
    ramps: { grass: [62, 96, 46], forest: [28, 72, 36], sand: [112, 82, 56], rock: [100, 96, 86], sky: [110, 150, 200] },
    hills: 1,
    scenery: [
      { rule: 'every', spacing: 13, obj: 'redwood', side: 'both', offset: [4, 30], jitter: 1 },
      { rule: 'every', spacing: 12, obj: 'coniferFar', side: 'both', offset: [30, 70], jitter: 1 },
      { rule: 'every', spacing: 16, obj: 'bush', side: 'both', offset: [2, 14], jitter: 1 },
      { rule: 'every', spacing: 300, obj: 'logPile', side: 'both', offset: [6, 15] },
      { rule: 'every', spacing: 900, obj: 'cabin', side: 'both', offset: [25, 45] },
    ],
  },
  // Mountain lake: water on one side of the road, a steep wooded mountain on the other.
  lake: {
    ramps: { grass: [74, 132, 72], forest: [30, 82, 50], sand: [190, 176, 140], rock: [128, 128, 136], water: [30, 92, 170], sky: [100, 160, 225] },
    hills: 0.8,
    scenery: [
      { rule: 'every', spacing: 12, obj: 'conifer', side: 'both', offset: [4, 40], jitter: 1 },
      { rule: 'every', spacing: 25, obj: 'rock', side: 'both', offset: [3, 30], jitter: 1 },
      { rule: 'every', spacing: 400, obj: 'picnicTable', side: 'both', offset: [8, 12] },
    ],
  },
  // Cliff coast: pale rock falling straight into the sea.
  seaCliff: {
    ramps: { grass: [118, 152, 82], forest: [44, 110, 62], sand: [206, 190, 150], rock: [190, 178, 152], water: [24, 84, 164], sky: [96, 162, 232] },
    hills: 0.5,
    sea: true, // the plane below the horizon is open sea
    scenery: [
      { rule: 'every', spacing: 22, obj: 'bush', side: 'both', offset: [3, 30], jitter: 1 },
      { rule: 'every', spacing: 45, obj: 'rock', side: 'both', offset: [4, 30], jitter: 1 },
      { rule: 'every', spacing: 30, obj: 'palm', side: 'left', offset: [6, 20], jitter: 1 },
    ],
  },
};
