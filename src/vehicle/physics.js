// SPDX-License-Identifier: AGPL-3.0-or-later
// Arcade-sim car physics: longitudinal forces plus a bicycle model with slip angles and a grip
// limit. The ground is sampled under the four wheels; no DOM or GL, runs in Node.

import { CONFIG } from '../config.js';
import { updateDrivetrain } from './drivetrain.js';

const wheel = { y: 0, grip: 0, rolling: 0 };

/**
 * @param {Object} spec car specification from cars.js
 * @returns {Object} car state; x/z position, y ground contact height, heading (0 = -Z, positive
 *   right), body-frame velocities vLong/vLat (m/s), yawRate (rad/s, positive right)
 */
export function createCar(spec) {
  return {
    spec, auto: true,
    x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0,
    vLong: 0, vLat: 0, yawRate: 0,
    gear: 1, rpm: spec.idleRpm, shiftTimer: 0,
    steerAngle: 0, accelLong: 0, accelLat: 0, grip: 1,
  };
}

// Ground contact under the 4 wheels: height, pitch and roll of the car, average surface.
function sampleContact(car, ground) {
  const spec = car.spec, front = spec.cgToFront, rear = spec.wheelbase - front, half = spec.track / 2;
  const sinH = Math.sin(car.heading), cosH = Math.cos(car.heading);
  let hFront = 0, hRear = 0, hLeft = 0, hRight = 0, grip = 0, rolling = 0;
  for (let i = 0; i < 4; i++) {
    const lon = i < 2 ? front : -rear, lat = i & 1 ? half : -half;
    ground(car.x + sinH * lon + cosH * lat, car.z - cosH * lon + sinH * lat, wheel);
    if (i < 2) hFront += wheel.y / 2; else hRear += wheel.y / 2;
    if (i & 1) hRight += wheel.y / 2; else hLeft += wheel.y / 2;
    grip += wheel.grip / 4;
    rolling += wheel.rolling / 4;
  }
  car.y = (hFront + hRear) / 2;
  car.pitch = Math.atan2(hFront - hRear, spec.wheelbase);
  car.roll = Math.atan2(hLeft - hRight, spec.track);
  car.grip = grip * spec.grip;
  return rolling;
}

// Lateral tyre force of one axle: linear in the slip angle, clamped to the friction circle.
function axleForce(stiffness, slip, load, mu, used) {
  const P = CONFIG.physics;
  const cap = Math.sqrt(Math.max((mu * load) ** 2 - used ** 2, (P.minLateralShare * mu * load) ** 2));
  return Math.max(-cap, Math.min(cap, -stiffness * slip));
}

/**
 * Advances the car by dt.
 * @param {Object} car state from createCar
 * @param {{throttle: number, brake: number, steer: number, gearUp: boolean, gearDown: boolean}} controls
 *   throttle/brake 0-1, steer -1..1 (positive right)
 * @param {number} dt seconds
 * @param {(x: number, z: number, out: {y: number, grip: number, rolling: number}) => void} ground
 */
export function stepCar(car, controls, dt, ground) {
  const spec = car.spec, P = CONFIG.physics;
  const rolling = sampleContact(car, ground);
  const weight = spec.mass * P.gravity, mu = car.grip;
  const front = spec.cgToFront, rear = spec.wheelbase - front;
  const loadFront = (weight * rear) / spec.wheelbase, loadRear = (weight * front) / spec.wheelbase;

  let throttle = controls.throttle, brake = controls.brake;
  if (car.auto) {
    // Automatic: braking at standstill selects reverse, throttle at standstill selects first.
    const stopped = Math.abs(car.vLong) < P.stopSpeed;
    if (car.gear > 0 && stopped && brake > 0 && throttle === 0) car.gear = -1;
    else if (car.gear < 0 && stopped && throttle > 0 && brake === 0) car.gear = 1;
    if (car.gear < 0) { throttle = controls.brake; brake = controls.throttle; }
  }
  const limit = mu * loadRear * spec.tractionFactor;
  const drive = Math.max(-limit, Math.min(limit, updateDrivetrain(car, throttle, controls.gearUp, controls.gearDown, dt)));
  const brakeForce = Math.min(brake * spec.brakeForce, mu * weight);

  const v = car.vLong;
  const steer = (controls.steer * spec.steerMax) / (1 + Math.abs(v) / spec.steerSpeed);
  car.steerAngle = steer;
  let forceX = drive - spec.drag * v * Math.abs(v) - weight * Math.sin(car.pitch);
  let accelLat = 0;
  if (v > P.lowSpeed) {
    const slipFront = Math.atan2(car.vLat + front * car.yawRate, v) - steer;
    const slipRear = Math.atan2(car.vLat - rear * car.yawRate, v);
    // Brakes load each axle in proportion to its weight; only part of the drive force counts
    // against the rear friction circle, so full throttle does not instantly spin the car.
    const usedFront = (brakeForce * loadFront) / weight;
    const usedRear = Math.abs(drive) * spec.powerOversteer + (brakeForce * loadRear) / weight;
    const fFront = axleForce(spec.corneringFront, slipFront, loadFront, mu * spec.frontGrip, usedFront);
    const fRear = axleForce(spec.corneringRear, slipRear, loadRear, mu, usedRear);
    // A banked road pulls the car towards its low side.
    accelLat = (fFront * Math.cos(steer) + fRear) / spec.mass + P.gravity * Math.sin(car.roll);
    forceX -= fFront * Math.sin(steer);
    car.vLat += (accelLat - v * car.yawRate) * dt;
    // Extra yaw damping keeps the car from snapping around once both axles are sliding.
    const yawTorque = front * fFront * Math.cos(steer) - rear * fRear - spec.yawDamping * car.yawRate;
    car.yawRate += (yawTorque / spec.inertia) * dt;
    forceX += spec.mass * car.vLat * car.yawRate;
  } else {
    car.yawRate = (v * Math.tan(steer)) / spec.wheelbase;
    car.vLat -= car.vLat * Math.min(1, P.latDamp * dt);
    accelLat = v * car.yawRate;
  }
  // Brakes and rolling resistance act as friction: they stop the car but never reverse it.
  let next = v + (forceX / spec.mass) * dt;
  const friction = ((brakeForce + rolling * spec.rolling * weight) / spec.mass) * dt;
  next = Math.abs(next) <= friction ? 0 : next - Math.sign(next) * friction;
  const smooth = Math.min(1, P.accelSmooth * dt);
  car.accelLong += ((next - v) / dt - car.accelLong) * smooth;
  car.accelLat += (accelLat - car.accelLat) * smooth;
  car.vLong = next;

  car.heading += car.yawRate * dt;
  const sinH = Math.sin(car.heading), cosH = Math.cos(car.heading);
  car.x += (car.vLong * sinH + car.vLat * cosH) * dt;
  car.z += (-car.vLong * cosH + car.vLat * sinH) * dt;
}
