// SPDX-License-Identifier: AGPL-3.0-or-later
// Showroom used by the title and setup screens: one of the player cars turning on a dark floor
// under a sunset sky, plus the palette with color cycling (the sunset ramp rotates over time).

import { CONFIG } from '../config.js';
import { mat4Perspective, mat4LookAt, mat4Multiply, mat4FromYawPitch } from '../engine/math3d.js';
import { buildModel } from '../models/loader.js';
import { CAR_MODELS } from '../models/sportsCars.js';
import { CARS } from '../vehicle/cars.js';
import { buildPalette, applyTime, paletteIndex, RAMP } from '../gfx/palette.js';

const FLOOR = {
  name: 'showroomFloor',
  verts: [[-6, 0, -6], [-6, 0, 6], [6, 0, 6], [6, 0, -6]],
  faces: [[0, 1, 2, 3, 'asphalt', 7, 0]],
};

/**
 * @param {import('../gfx/renderer.js').Renderer} renderer
 * @returns {{draw: (carIndex: number, angle: number, lift: number) => void, cycle: (time: number) => void}}
 */
export function createShowroom(renderer) {
  const S = CONFIG.showroom;
  const cars = CARS.map((spec) => renderer.addMesh(buildModel(CAR_MODELS[spec.model][0])));
  const floor = renderer.addMesh(buildModel(FLOOR));
  const proj = mat4Perspective(new Float32Array(16), (S.fovDeg * Math.PI) / 180, CONFIG.render.displayAspect, CONFIG.render.near, CONFIG.render.far);
  const view = new Float32Array(16), viewProj = new Float32Array(16), model = new Float32Array(16);
  const eye = new Float32Array(S.eye), target = new Float32Array(3), up = [0, 1, 0];
  const base = applyTime(buildPalette(), CONFIG.time[S.time]);
  const palette = new Uint8Array(base);
  const ramp = RAMP[S.cycleRamp];
  let shift = -1;

  return {
    /**
     * Color cycling: the entries of one ramp rotate by one level every `cycleStep` seconds.
     * @param {number} time seconds
     */
    cycle(time) {
      const next = Math.floor(time / S.cycleStep) % 16;
      if (next === shift) return;
      shift = next;
      for (let l = 0; l < 16; l++) {
        const from = (ramp * 16 + ((l + shift) % 16)) * 4, to = (ramp * 16 + l) * 4;
        for (let c = 0; c < 4; c++) palette[to + c] = base[from + c];
      }
      renderer.setPalette(palette, S.paletteKey + shift);
    },
    /**
     * @param {number} carIndex into CARS
     * @param {number} angle car rotation in radians
     * @param {number} lift moves the car down on screen (m the camera aims above it)
     */
    draw(carIndex, angle, lift) {
      renderer.setLight(CONFIG.time[S.time].light);
      renderer.night = false;
      renderer.setLamp(false, 0, 0, 0, 0, 0, -1);
      renderer.lightCount = renderer.carLampCount = 0;
      renderer.beaconStrength = 0;
      renderer.groundY = 0;
      renderer.groundIndex = paletteIndex('asphalt', S.groundLevel);
      renderer.disableFog();
      target[0] = 0; target[1] = S.targetY + lift; target[2] = 0;
      mat4LookAt(view, eye, target, up);
      mat4Multiply(viewProj, proj, view);
      renderer.beginFrame(viewProj, eye);
      renderer.drawSky(view);
      renderer.drawMesh(floor, mat4FromYawPitch(model, 0, 0, 0, 0, 0), 0);
      const spec = CARS[carIndex], def = CAR_MODELS[spec.model][0];
      renderer.drawMesh(cars[carIndex], mat4FromYawPitch(model, angle, 0, 0, def.wheelRadius, 0), RAMP[spec.paint]);
    },
  };
}
