// SPDX-License-Identifier: AGPL-3.0-or-later
// Engine and gearbox: torque curve lookup, rpm from wheel speed, automatic and manual shifting.

import { CONFIG } from '../config.js';

const RAD_S_TO_RPM = 60 / (2 * Math.PI);

/**
 * @param {Object} spec car specification
 * @param {number} rpm
 * @returns {number} full-throttle torque in Nm, linearly interpolated on the curve
 */
export function engineTorque(spec, rpm) {
  const curve = spec.torqueCurve;
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i][0]) {
      const t = (rpm - curve[i - 1][0]) / (curve[i][0] - curve[i - 1][0]);
      return curve[i - 1][1] + (curve[i][1] - curve[i - 1][1]) * t;
    }
  }
  return curve[curve.length - 1][1];
}

/**
 * @param {Object} spec
 * @param {number} gear -1 (reverse) or 1..n
 * @returns {number} total ratio engine : wheel
 */
export function totalRatio(spec, gear) {
  return (gear < 0 ? spec.reverse : spec.gears[gear - 1]) * spec.finalDrive;
}

function shift(car, gear) {
  car.gear = gear;
  car.shiftTimer = car.spec.shiftTime;
}

/**
 * Advances the gearbox and engine and returns the drive force at the wheels.
 * @param {Object} car car state (gear, rpm, shiftTimer, auto, vLong)
 * @param {number} throttle 0-1
 * @param {boolean} gearUp one-shot shift request (manual gearbox)
 * @param {boolean} gearDown
 * @param {number} dt
 * @returns {number} force in N along the car, positive forwards
 */
export function updateDrivetrain(car, throttle, gearUp, gearDown, dt) {
  const spec = car.spec, P = CONFIG.physics;
  const speed = Math.abs(car.vLong);
  if (!car.auto) {
    if (gearUp) shift(car, car.gear < 0 ? 1 : Math.min(car.gear + 1, spec.gears.length));
    else if (gearDown && car.gear > 1) shift(car, car.gear - 1);
    else if (gearDown && car.gear === 1 && speed < P.stopSpeed) shift(car, -1);
  }
  let wheelRpm = (speed / spec.wheelRadius) * totalRatio(spec, car.gear) * RAD_S_TO_RPM;
  if (car.auto && car.gear > 0 && car.shiftTimer <= 0) {
    if (wheelRpm > spec.shiftUpRpm && car.gear < spec.gears.length) shift(car, car.gear + 1);
    else if (wheelRpm < spec.shiftDownRpm && car.gear > 1) shift(car, car.gear - 1);
    wheelRpm = (speed / spec.wheelRadius) * totalRatio(spec, car.gear) * RAD_S_TO_RPM;
  }
  // Below the launch rpm the clutch slips instead of stalling the engine.
  const rpm = Math.max(wheelRpm, spec.idleRpm + throttle * (spec.launchRpm - spec.idleRpm));
  car.rpm += (Math.min(rpm, spec.redlineRpm) - car.rpm) * Math.min(1, P.rpmSmooth * dt);
  const shifting = car.shiftTimer > 0;
  car.shiftTimer = Math.max(0, car.shiftTimer - dt);
  const cut = shifting || wheelRpm >= spec.redlineRpm;
  const drive = cut ? 0 : throttle * engineTorque(spec, rpm);
  const braking = (1 - throttle) * spec.engineBrake * (rpm / spec.redlineRpm) * Math.min(1, speed / P.engineBrakeSpeed);
  const toForce = (totalRatio(spec, car.gear) * spec.efficiency) / spec.wheelRadius;
  const direction = car.gear < 0 ? -1 : 1;
  return direction * drive * toForce - Math.sign(car.vLong) * braking * toForce;
}
