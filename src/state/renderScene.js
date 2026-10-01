// SPDX-License-Identifier: AGPL-3.0-or-later
// Renderer test scene (?scene=render): rotating test models, free camera (mouse drag + WASD/arrows),
// objects the camera can fly through to exercise near-plane clipping, optional stress grid of cars.

import { CONFIG } from '../config.js';
import { mat4Perspective, mat4LookAt, mat4Multiply, mat4FromYawPitch } from '../engine/math3d.js';
import { buildModel } from '../models/loader.js';
import { CUBE, PYRAMID, GROUND } from '../models/primitives.js';
import { VEKTOR_GT } from '../models/vektorGt.js';
import { RAMP } from '../gfx/palette.js';

const UP = [0, 1, 0];
const PAINTS = [RAMP.paint1, RAMP.paint2, RAMP.paint3, RAMP.paint4];

/**
 * @param {import('../gfx/renderer.js').Renderer} renderer
 * @param {boolean} stress adds a grid of cars to reach the triangle budget
 * @returns {{update: (dt: number) => void, render: () => void}}
 */
export function createRenderScene(renderer, stress) {
  const cfg = CONFIG.renderScene;
  const fovRad = (CONFIG.render.fovDeg * Math.PI) / 180;
  const ground = renderer.addMesh(buildModel(GROUND));
  const cube = renderer.addMesh(buildModel(CUBE));
  const pyramid = renderer.addMesh(buildModel(PYRAMID));
  const car = renderer.addMesh(buildModel(VEKTOR_GT));
  const carY = VEKTOR_GT.wheelRadius;
  const proj = new Float32Array(16), view = new Float32Array(16), viewProj = new Float32Array(16);
  const model = new Float32Array(16);
  const eye = [0, 1.6, 9], target = [0, 0, 0];
  const keys = new Set();
  let yaw = 0, pitch = -0.1, time = 0;
  mat4Perspective(proj, fovRad, CONFIG.render.displayAspect, CONFIG.render.near, CONFIG.render.far);

  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousemove', (e) => {
    if (!(e.buttons & 1)) return;
    const limit = (cfg.pitchLimitDeg * Math.PI) / 180;
    yaw -= e.movementX * cfg.mouseSens;
    pitch = Math.max(-limit, Math.min(limit, pitch - e.movementY * cfg.mouseSens));
  });

  function axis(plus, plusAlt, minus, minusAlt) {
    return (keys.has(plus) || keys.has(plusAlt) ? 1 : 0) - (keys.has(minus) || keys.has(minusAlt) ? 1 : 0);
  }

  function update(dt) {
    time += dt;
    const fwd = axis('KeyW', 'ArrowUp', 'KeyS', 'ArrowDown') * cfg.moveSpeed * dt;
    const side = axis('KeyD', 'ArrowRight', 'KeyA', 'ArrowLeft') * cfg.moveSpeed * dt;
    const cp = Math.cos(pitch);
    eye[0] += -Math.sin(yaw) * cp * fwd + Math.cos(yaw) * side;
    eye[1] += Math.sin(pitch) * fwd;
    eye[2] += -Math.cos(yaw) * cp * fwd - Math.sin(yaw) * side;
  }

  function render() {
    const cp = Math.cos(pitch);
    target[0] = eye[0] - Math.sin(yaw) * cp;
    target[1] = eye[1] + Math.sin(pitch);
    target[2] = eye[2] - Math.cos(yaw) * cp;
    mat4Multiply(viewProj, proj, mat4LookAt(view, eye, target, UP));
    renderer.disableFog();
    renderer.setLamp(false, 0, 0, 0, 0, 0, -1);
    renderer.lightCount = 0;
    renderer.carLampCount = 0;
    renderer.beaconStrength = 0;
    renderer.beginFrame(viewProj, eye);
    const spin = time * cfg.spinSpeed;
    renderer.drawMesh(ground, mat4FromYawPitch(model, 0, 0, 0, 0, 0), 0);
    renderer.drawMesh(cube, mat4FromYawPitch(model, spin, spin * 0.7, -4.5, 1.8, 0), 0);
    renderer.drawMesh(pyramid, mat4FromYawPitch(model, -spin, 0, 4.5, 0, 0), 0);
    renderer.drawMesh(car, mat4FromYawPitch(model, spin * 0.5, 0, 0, carY, 0), PAINTS[0]);
    renderer.drawMesh(car, mat4FromYawPitch(model, 0.6, 0, 0, carY, 5), PAINTS[1]);
    if (!stress) return;
    for (let i = 0; i < cfg.stressCars; i++) {
      const col = i % cfg.stressColumns, row = Math.floor(i / cfg.stressColumns);
      const x = (col - (cfg.stressColumns - 1) / 2) * cfg.stressSpacing;
      renderer.drawMesh(car, mat4FromYawPitch(model, spin + i, 0, x, carY, -6 - row * cfg.stressSpacing), PAINTS[i % 4]);
    }
  }

  return { update, render };
}
