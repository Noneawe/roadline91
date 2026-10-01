// SPDX-License-Identifier: AGPL-3.0-or-later
// The drivable world: track path, chunk meshes, background. Draws it for a given camera.

import { CONFIG } from '../config.js';
import {
  mat4Perspective, mat4LookAt, mat4Multiply, mat4FromYawPitch, mat4Identity, frustumPlanes, hypot2,
} from '../engine/math3d.js';
import { buildModel } from '../models/loader.js';
import { pathAt, mainDistance } from './track.js';
import { buildRoads } from './roads.js';
import { createChunks, drawChunks } from './chunks.js';
import { buildMountainDef } from './sky.js';
import { buildSurface, createGround, pickRoad, setRoadBounds } from './surface.js';
import { SURFACE_POINTS } from './chunks.js';
import { ROAD_POINTS } from './track.js';
import { TERRAIN_POINTS } from './terrain.js';
import { placeScenery, buildLights, selectLights, buildBeacons } from './scenery.js';
import { buildColliders, collideCar, castLight } from '../game/collision.js';
import { SCENERY } from '../models/scenery.js';
import { ZONES } from '../data/zones.js';
import { buildPalette, applyTime, applyWeather, lerpPalette, RAMP, paletteIndex } from '../gfx/palette.js';

const UP = [0, 1, 0];

export const TIMES = ['day', 'sunset', 'night'];
export const WEATHERS = ['clear', 'rain', 'fog'];
const ROAD_SEED = 977;

// Uploads one instance batch per object type and chunk; objects outside any chunk of their road
// (branch ends without geometry) go to the nearest chunk of that road.
function createScenery(renderer, roadChunks, placed) {
  const meshes = {};
  placed.forEach((byName, c) => {
    if (roadChunks.length === 0) return;
    let chunk = roadChunks[0];
    for (const candidate of roadChunks) if (Math.abs(candidate.index - c) < Math.abs(chunk.index - c)) chunk = candidate;
    for (const name of Object.keys(byName)) {
      if (!meshes[name]) meshes[name] = renderer.addMesh(buildModel(SCENERY[name]));
      const paint = SCENERY[name].paint;
      chunk.batches.push(renderer.addInstances(meshes[name], new Float32Array(byName[name]), paint ? RAMP[paint] : 0));
    }
  });
}

/**
 * @param {import('../gfx/renderer.js').Renderer} renderer
 * @param {{sections: Array}} track
 * @param {{time?: string, seed?: number, weather?: string}} [options] time of day (day, sunset,
 *   night), scenery seed, weather (clear, rain, fog)
 * @returns {Object} world state used by drawWorld, roadCamera, placeCar and constrainCar
 */
export function createWorld(renderer, track, options = {}) {
  const roads = buildRoads(track), path = roads[0];
  setRoadBounds(roads);
  const { fovDeg, displayAspect, near, far } = CONFIG.render;
  const { width, height } = CONFIG.render;
  const mirror = CONFIG.mirror;
  const mirrorTan = Math.tan((mirror.fovDeg * Math.PI) / 360);
  const mirrorAspect = (mirror.w / mirror.h) * (height / width) * displayAspect;
  const mirrorProj = mat4Perspective(new Float32Array(16), (mirror.fovDeg * Math.PI) / 180, mirrorAspect, near, far);
  mirrorProj[0] = -mirrorProj[0]; // a mirror flips left and right
  const groundY = Math.min(...roads.map((road) => Math.min(...road.y))) - CONFIG.sky.groundDrop;
  const surfaces = roads.map(buildSurface);
  const seed = options.seed === undefined ? CONFIG.scenery.seed : options.seed;
  const chunks = [], placedAll = [];
  roads.forEach((road, r) => {
    const roadChunks = createChunks(renderer, road);
    const placed = placeScenery(road, surfaces[r], seed + r * ROAD_SEED, roads);
    createScenery(renderer, roadChunks, placed);
    chunks.push(...roadChunks);
    placedAll.push(...placed);
  });
  const weatherName = WEATHERS.includes(options.weather) ? options.weather : 'clear';
  const weather = CONFIG.weather[weatherName];
  // Palettes per time of day and zone: zone colors (wet asphalt in the rain) with the time-of-day
  // and weather variants applied.
  const zonePalettes = TIMES.map((time) => {
    const byZone = {};
    for (const zone of Object.keys(ZONES)) {
      const ramps = weather.asphalt ? { ...ZONES[zone].ramps, asphalt: weather.asphalt } : ZONES[zone].ramps;
      byZone[zone] = applyWeather(applyTime(buildPalette(ramps), CONFIG.time[time]), weather);
    }
    return byZone;
  });
  const world = {
    path, roads, surfaces,
    colliders: buildColliders(placedAll),
    lights: buildLights(placedAll),
    beacons: buildBeacons(placedAll),
    lightDistances: new Float32Array(CONFIG.streetLights.max),
    time: 'day', timeIndex: 0,
    weather, weatherName,
    zonePalettes,
    palette: new Uint8Array(256 * 4),
    distance: CONFIG.draw.distance, // current draw distance (zone dependent)
    distanceScale: 1, // historical mode shortens every draw distance
    groundY, // height of the ground plane below the horizon
    groundIndex: paletteIndex(CONFIG.sky.groundRamp, CONFIG.sky.groundLevel),
    seaIndex: paletteIndex('water', CONFIG.terrain.seaLevel),
    road: 0, // road the car is on
    hints: new Int32Array(roads.length).fill(-1),
    s: 0, // distance along the current road
    progress: 0, // equivalent distance along the main road
    impact: 0, // impact speed of the last constrainCar call
    contact: { y: 0, grip: 0, rolling: 0 },
    lamp: { on: false, x: 0, y: 0, z: 0, dirX: 0, dirY: 0, dirZ: -1 },
    surface: surfaces[0],
    ground: createGround(roads, surfaces, weather.grip),
    cameraGround: createGround(roads, surfaces), // separate instance: it keeps its own position hints
    where: { index: 0, t: 0, u: 0 },
    mirrorProj,
    mirrorTanX: -mirrorTan,
    mirrorTanY: mirrorTan / mirrorAspect,
    chunks,
    mountains: renderer.addMesh(buildModel(buildMountainDef())),
    proj: mat4Perspective(new Float32Array(16), (fovDeg * Math.PI) / 180, displayAspect, near, far),
    view: new Float32Array(16),
    viewProj: new Float32Array(16),
    planes: new Float32Array(24),
    model: new Float32Array(16),
    sample: { x: 0, y: 0, z: 0, heading: 0, grade: 0, bank: 0 },
  };
  setTime(world, options.time);
  return world;
}

/**
 * @param {Object} world
 * @param {string} time 'day' | 'sunset' | 'night' (anything else means day)
 */
export function setTime(world, time) {
  world.time = TIMES.includes(time) ? time : 'day';
  world.timeIndex = TIMES.indexOf(world.time);
}

/**
 * Camera of a viewer travelling along the main road centerline.
 * @param {Object} world
 * @param {number} s distance along the main road in meters
 * @param {number[]} eye output position
 * @param {number[]} target output look-at point
 */
export function roadCamera(world, s, eye, target) {
  const { eyeHeight, lookAhead } = CONFIG.driveCam;
  world.s = world.progress = s;
  world.road = 0;
  const p = pathAt(world.path, s, world.sample);
  eye[0] = p.x; eye[1] = p.y + eyeHeight; eye[2] = p.z;
  pathAt(world.path, s + lookAhead, p);
  target[0] = p.x; target[1] = p.y + eyeHeight; target[2] = p.z;
}

// Light, night flag, headlights and the palette of the zone at world.progress (faded near zone
// borders; zones may change inside a section).
function applyEnvironment(world, renderer, eye, target) {
  const { blendLength, blendSteps } = CONFIG.zones;
  const zones = world.path.zones, lamp = world.lamp, s = world.progress;
  renderer.setLight(CONFIG.time[world.time].light);
  renderer.night = world.time === 'night';
  renderer.setLamp(lamp.on, lamp.x, lamp.y, lamp.z, lamp.dirX, lamp.dirY, lamp.dirZ);
  // At night the lamps nearest to a point ahead of the camera light the ground below them.
  renderer.lightCount = 0;
  if (renderer.night) {
    const dx = target[0] - eye[0], dz = target[2] - eye[2], ahead = CONFIG.streetLights.focusAhead / (hypot2(dx, dz) || 1);
    renderer.lightCount = selectLights(world.lights, eye[0] + dx * ahead, eye[2] + dz * ahead,
      CONFIG.streetLights.searchRadius, renderer.lights, world.lightDistances);
  }
  if (lamp.on) {
    const flat = hypot2(lamp.dirX, lamp.dirZ);
    castLight(world.colliders, lamp.x, lamp.z, lamp.dirX / flat, lamp.dirZ / flat, renderer.lampReach);
  }
  let k = 0;
  while (k < zones.length - 1 && s >= zones[k].end) k++;
  // Fade with the neighbour within half a blend length of a border.
  let other = k, t = 0;
  if (k > 0 && s - zones[k].start < blendLength / 2) {
    other = k - 1;
    t = 0.5 - (s - zones[k].start) / blendLength;
  } else if (k < zones.length - 1 && zones[k].end - s < blendLength / 2) {
    other = k + 1;
    t = 0.5 - (zones[k].end - s) / blendLength;
  }
  // Some zones (mountain haze) see less far; the draw distance fades with the palette.
  const far = (zone) => ZONES[zone].distance || CONFIG.draw.distance;
  world.distance = (far(zones[k].zone) + (far(zones[other].zone) - far(zones[k].zone)) * t) * world.weather.distance * world.distanceScale;
  // By the sea the plane below the horizon is open water at sea level; in thick fog it is fog.
  const sea = ZONES[zones[t < 0.5 ? k : other].zone].sea;
  renderer.groundIndex = world.weather.skyFlat >= 1 ? renderer.fogIndex : sea ? world.seaIndex : world.groundIndex;
  renderer.groundY = sea ? world.path.y[Math.min(world.path.count - 1, Math.round(s / world.path.step))] - CONFIG.terrain.seaDrop[2] : world.groundY;
  const step = Math.round(t * blendSteps);
  const key = 1 + step + blendSteps * (other + zones.length * (k + zones.length * world.timeIndex));
  if (key === renderer.paletteKey) return;
  const palettes = world.zonePalettes[world.timeIndex];
  renderer.setPalette(lerpPalette(world.palette, palettes[zones[k].zone], palettes[zones[other].zone], step / blendSteps), key);
}

function drawScene(world, renderer, eye, distance, sceneryDistance, tanX, tanY) {
  frustumPlanes(world.planes, world.viewProj);
  renderer.drawSky(world.view, tanX, tanY);
  if (world.weather.mountains) renderer.drawBackdrop(world.mountains, mat4FromYawPitch(world.model, 0, 0, eye[0], eye[1], eye[2]));
  drawChunks(renderer, world.chunks, world.planes, eye, distance, sceneryDistance, mat4Identity(world.model));
}

/**
 * Renders sky, background mountains and visible chunks into the index buffer.
 * @param {Object} world
 * @param {import('../gfx/renderer.js').Renderer} renderer
 * @param {number[]} eye
 * @param {number[]} target
 * @param {number[]} [up]
 */
export function drawWorld(world, renderer, eye, target, up = UP) {
  mat4LookAt(world.view, eye, target, up);
  mat4Multiply(world.viewProj, world.proj, world.view);
  applyEnvironment(world, renderer, eye, target);
  const distance = world.distance;
  renderer.setFog(distance * Math.min(CONFIG.draw.fogStart, world.weather.fogStart), distance);
  renderer.beginFrame(world.viewProj, eye);
  drawScene(world, renderer, eye, distance, Math.min(CONFIG.scenery.distance, distance));
}

/**
 * Renders the rear-view mirror into its rectangle: mirrored view, shorter draw distance.
 * Call after drawWorld; further meshes drawn before endMirror land in the mirror too.
 * @param {Object} world
 * @param {import('../gfx/renderer.js').Renderer} renderer
 * @param {number[]} eye
 * @param {number[]} target
 * @param {number[]} up
 * @param {(distance: number) => void} [drawExtra] draws further meshes (vehicles) into the mirror
 */
export function drawMirror(world, renderer, eye, target, up, drawExtra) {
  const { x, y, w, h, fogStart } = CONFIG.mirror, distance = CONFIG.mirror.distance * world.weather.distance * world.distanceScale;
  mat4LookAt(world.view, eye, target, up);
  mat4Multiply(world.viewProj, world.mirrorProj, world.view);
  renderer.setFog(distance * Math.min(fogStart, world.weather.fogStart), distance);
  renderer.beginMirror(world.viewProj, eye, x, y, w, h);
  drawScene(world, renderer, eye, distance, Math.min(CONFIG.scenery.mirrorDistance, distance), world.mirrorTanX, world.mirrorTanY);
  if (drawExtra) drawExtra(distance);
  renderer.endMirror();
}

/**
 * Puts a car on a road.
 * @param {Object} world
 * @param {Object} car physics state
 * @param {number} s distance along the road in meters
 * @param {number} u lateral offset in meters, positive right
 * @param {number} [road] road id (0 = main road)
 */
export function placeCar(world, car, s, u, road = 0) {
  const p = pathAt(world.roads[road], s, world.sample);
  car.x = p.x + Math.cos(p.heading) * u;
  car.z = p.z + Math.sin(p.heading) * u;
  car.heading = p.heading;
  car.vLat = car.yawRate = 0;
  car.pitch = car.roll = 0;
  world.road = road;
  world.hints.fill(-1);
  world.ground.reset();
  world.ground(car.x, car.z, world.contact);
  car.y = world.contact.y;
}

/**
 * Keeps a car inside the drivable area (solid scenery, bridge barriers, the outer edge of the
 * terrain) and finds the road it is on.
 * @param {Object} world
 * @param {Object} car physics state
 * @returns {number} distance along the current road in meters (see also world.road, world.progress)
 */
export function constrainCar(world, car) {
  const { where } = world;
  const { barrierMargin, barrierScrub } = CONFIG.physics;
  world.impact = collideCar(car, world.colliders);
  locateCar(world, car);
  const path = world.roads[world.road], surface = world.surfaces[world.road];
  const i = where.index, row = i * SURFACE_POINTS;
  // Bridges have parapets, canyons rock walls and lake roads a guard rail on the water side.
  const walled = path.bridge[i] > 0.5 || path.canyon[i] > 0.5;
  const open = path.lake[i] + path.cliff[i] + path.sea[i];
  const wallLeft = walled || open < -0.5, wallRight = walled || open > 0.5;
  // The terrain edge is a wall only where nothing lies beyond it (not towards a neighbouring road).
  const beyond = (extent) => extent < path.extentReach;
  const left = wallLeft ? surface.rowU[row + TERRAIN_POINTS] + barrierMargin
    : beyond(path.extentL[i]) ? -Infinity : surface.rowU[row] + barrierMargin;
  const right = wallRight ? surface.rowU[row + TERRAIN_POINTS + ROAD_POINTS - 1] - barrierMargin
    : beyond(path.extentR[i]) ? Infinity : surface.rowU[row + SURFACE_POINTS - 1] - barrierMargin;
  const push = where.u < left ? left - where.u : where.u > right ? right - where.u : 0;
  if (push !== 0) {
    car.x += Math.cos(path.heading[i]) * push;
    car.z += Math.sin(path.heading[i]) * push;
    car.vLat = 0;
    car.vLong *= barrierScrub;
  }
  return world.s;
}

/**
 * Finds the road a car is on and its distance along it, without moving it (replays).
 * @param {Object} world
 * @param {Object} car
 * @returns {number} distance along the current road (also world.s, world.road, world.progress)
 */
export function locateCar(world, car) {
  const { where } = world;
  world.road = pickRoad(world.roads, car.x, car.z, world.road, world.hints, where);
  const path = world.roads[world.road];
  world.s = (where.index + where.t) * path.step;
  world.progress = mainDistance(path, world.s);
  return world.s;
}
