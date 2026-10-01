// SPDX-License-Identifier: AGPL-3.0-or-later
// Cameras following the player's car: cockpit (with body sway), rear-view mirror, chase, top and
// roadside. Each writes eye, target and up vectors for a look-at view; outside cameras are kept
// out of the terrain by fitToTerrain.

import { CONFIG } from '../config.js';
import { pathAt } from '../world/track.js';
import { heightAt } from '../world/surface.js';
import { hypot2 } from '../engine/math3d.js';

// Car axes in world space from heading, pitch and roll (roll positive = left side higher).
function carAxes(car, pitch, roll, fwd, right, up) {
  const sinH = Math.sin(car.heading), cosH = Math.cos(car.heading);
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch), sinR = Math.sin(roll), cosR = Math.cos(roll);
  fwd[0] = sinH * cosP; fwd[1] = sinP; fwd[2] = -cosH * cosP;
  right[0] = cosH; right[1] = 0; right[2] = sinH;
  up[0] = cosH * sinR; up[1] = cosR; up[2] = sinH * sinR;
}

const fwd = [0, 0, 0], right = [0, 0, 0];

/**
 * Driver's eye. The body leans out of corners and dives under braking (visual only).
 * @param {Object} car physics state
 * @param {boolean} lookBack look through the rear window instead
 * @param {number[]} eye output
 * @param {number[]} target output
 * @param {number[]} up output
 */
export function cockpitCamera(car, lookBack, eye, target, up) {
  const c = CONFIG.camera.cockpit;
  const pitch = car.pitch + c.pitchGain * car.accelLong, roll = car.roll - c.rollGain * car.accelLat;
  carAxes(car, pitch, roll, fwd, right, up);
  const lat = c.x - c.swayLat * car.accelLat, lon = c.z - c.swayLong * car.accelLong;
  const dir = lookBack ? -1 : 1;
  for (let i = 0; i < 3; i++) {
    eye[i] = right[i] * lat + up[i] * c.y + fwd[i] * lon;
    target[i] = eye[i] + fwd[i] * dir;
  }
  eye[0] += car.x; eye[1] += car.y; eye[2] += car.z;
  target[0] += car.x; target[1] += car.y; target[2] += car.z;
}

/**
 * Rear-view mirror: looks straight back from the car's center line.
 * @param {Object} car physics state
 * @param {number[]} eye output
 * @param {number[]} target output
 * @param {number[]} up output
 */
export function mirrorCamera(car, eye, target, up) {
  carAxes(car, car.pitch, car.roll, fwd, right, up);
  const h = CONFIG.mirror.eyeHeight;
  eye[0] = car.x + up[0] * h; eye[1] = car.y + up[1] * h; eye[2] = car.z + up[2] * h;
  for (let i = 0; i < 3; i++) target[i] = eye[i] - fwd[i];
}

/**
 * Follows the chase camera's heading behind the car.
 * @param {{heading: number}} chase camera state
 * @param {Object} car physics state
 * @param {number} dt seconds; 0 snaps to the car
 */
export function updateChase(chase, car, dt) {
  const k = dt > 0 ? Math.min(1, CONFIG.camera.chase.lag * dt) : 1;
  chase.heading += (car.heading - chase.heading) * k;
}

/**
 * Camera behind and above the car.
 * @param {{heading: number}} chase camera state
 * @param {Object} car physics state
 * @param {number[]} eye output
 * @param {number[]} target output
 */
export function chaseCamera(chase, car, eye, target) {
  const c = CONFIG.camera.chase;
  const sinH = Math.sin(chase.heading), cosH = Math.cos(chase.heading);
  eye[0] = car.x - sinH * c.distance; eye[1] = car.y + c.height; eye[2] = car.z + cosH * c.distance;
  target[0] = car.x + sinH * c.lookAhead; target[1] = car.y + c.lookHeight; target[2] = car.z - cosH * c.lookAhead;
}

/**
 * High camera looking down at the car from behind.
 * @param {Object} car physics state
 * @param {number[]} eye output
 * @param {number[]} target output
 */
export function topCamera(car, eye, target) {
  const c = CONFIG.camera.top;
  const sinH = Math.sin(car.heading), cosH = Math.cos(car.heading);
  eye[0] = car.x - sinH * c.behind; eye[1] = car.y + c.height; eye[2] = car.z + cosH * c.behind;
  target[0] = car.x + sinH * c.lookAhead; target[1] = car.y; target[2] = car.z - cosH * c.lookAhead;
}

const spot = { x: 0, y: 0, z: 0, heading: 0, grade: 0, bank: 0 };

/**
 * Camera standing beside the road ahead of the car; it moves to a new spot once the car has
 * passed it or got too far away, alternating sides.
 * @param {{x: number, y: number, z: number, s: number, side: number, road: number, valid: boolean}} cam state
 * @param {Object} car physics state
 * @param {{roads: Array, surfaces: Array, road: number, s: number}} world
 * @param {number[]} eye output
 * @param {number[]} target output
 */
export function roadsideCamera(cam, car, world, eye, target) {
  const c = CONFIG.camera.roadside;
  const far = hypot2(cam.x - car.x, cam.z - car.z) > c.maxDistance;
  if (!cam.valid || far || cam.road !== world.road || world.s - cam.s > c.passed) {
    const road = world.roads[world.road];
    cam.valid = true;
    cam.road = world.road;
    cam.side = cam.side > 0 ? -1 : 1;
    cam.s = Math.min(road.length, world.s + c.ahead);
    const u = cam.side * (road.width / 2 + CONFIG.track.shoulder + c.side);
    pathAt(road, cam.s, spot);
    cam.x = spot.x + Math.cos(spot.heading) * u;
    cam.z = spot.z + Math.sin(spot.heading) * u;
    cam.y = heightAt(road, world.surfaces[world.road], cam.s, u) + c.height;
  }
  eye[0] = cam.x; eye[1] = cam.y; eye[2] = cam.z;
  target[0] = car.x; target[1] = car.y + c.lookHeight; target[2] = car.z;
}

const ground = { y: 0, grip: 0, rolling: 0 };

/**
 * Keeps an outside camera clear of the terrain: a hill between the car and the camera pulls the
 * camera in front of it, and the camera never goes below the ground.
 * @param {number[]} eye in/out
 * @param {number[]} target camera target (the car)
 * @param {Function} sampleGround ground function (world.cameraGround) already following the car
 */
export function fitToTerrain(eye, target, sampleGround) {
  const { clearance, losSamples } = CONFIG.camera;
  let keep = 1;
  for (let i = 1; i <= losSamples; i++) {
    const f = i / losSamples;
    sampleGround(target[0] + (eye[0] - target[0]) * f, target[2] + (eye[2] - target[2]) * f, ground);
    if (target[1] + (eye[1] - target[1]) * f < ground.y + clearance) {
      keep = Math.max(1 / losSamples, (i - 1) / losSamples);
      break;
    }
  }
  for (let k = 0; k < 3; k++) eye[k] = target[k] + (eye[k] - target[k]) * keep;
  sampleGround(eye[0], eye[2], ground);
  eye[1] = Math.max(eye[1], ground.y + clearance);
}
