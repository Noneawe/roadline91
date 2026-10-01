// SPDX-License-Identifier: AGPL-3.0-or-later
// Logic tests: node tools/test.mjs. Built-in modules only.

import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import * as m from '../src/engine/math3d.js';
import { buildModel, BODY_RAMP, EMIT, FLOATS_PER_VERTEX, BYTES_PER_VERTEX } from '../src/models/loader.js';
import { CUBE, PYRAMID, GROUND } from '../src/models/primitives.js';
import { VEKTOR_GT } from '../src/models/vektorGt.js';
import { buildBasePalette, buildPalette, applyTime, lerpPalette, RAMP, RAMP_NAMES, paletteIndex } from '../src/gfx/palette.js';
import { ZONES } from '../src/data/zones.js';
import { SCENERY } from '../src/models/scenery.js';
import { placeScenery, buildLights, selectLights } from '../src/world/scenery.js';
import { buildColliders, collideCar, castLight } from '../src/game/collision.js';
import { drawText, GLYPH_ART } from '../src/gfx/font.js';
import { fillRect } from '../src/gfx/draw2d.js';
import { createRng } from '../src/engine/rng.js';
import { buildPath, pathAt } from '../src/world/track.js';
import { buildRoads } from '../src/world/roads.js';
import { validateTrack } from '../src/world/validate.js';
import { pickRoad, setRoadBounds } from '../src/world/surface.js';
import { mainDistance } from '../src/world/track.js';
import { cornerSpeed } from '../src/ai/rival.js';
import { buildChunkDefs, ROW_POINTS, SURFACE_POINTS } from '../src/world/chunks.js';
import { buildMountainDef } from '../src/world/sky.js';
import { TRACK } from '../src/data/track-main.js';
import { createStepper } from '../src/engine/loop.js';
import { buildSurface, createGround, locate } from '../src/world/surface.js';
import { buildRow } from '../src/world/chunks.js';
import { createCar, stepCar } from '../src/vehicle/physics.js';
import { engineTorque } from '../src/vehicle/drivetrain.js';
import { noteFreq } from '../src/audio/fm.js';
import { CAR_MODELS } from '../src/models/sportsCars.js';
import { recordRank, insertRecord, load, save } from '../src/storage.js';
import { resultLines } from '../src/state/results.js';
import { carRatings } from '../src/state/setup.js';
import { createMenu, step } from '../src/state/menu.js';
import { bind, keyLabel, padLabel, DEFAULT_KEYS, BINDABLE } from '../src/engine/input.js';
import { defaultBindings } from '../src/state/controls.js';
import { applyWeather } from '../src/gfx/palette.js';
import { createReplay } from '../src/game/replay.js';
import { createRain, wiperAngle } from '../src/game/weather.js';
import { fitToTerrain, roadsideCamera, topCamera } from '../src/camera/cameras.js';
import { compileSong, createCursor, advance } from '../src/audio/sequencer.js';
import { SONGS, VOICES } from '../src/audio/songs.js';
import { dopplerCents, distanceGain } from '../src/audio/sfx.js';
import { CARS } from '../src/vehicle/cars.js';
import { VEHICLES } from '../src/models/traffic.js';
import { VEKTOR_GT_LOD } from '../src/models/vektorGt.js';
import { createTraffic, createAgent, separateAgents } from '../src/ai/traffic.js';
import { createRival } from '../src/ai/rival.js';
import { createPolice } from '../src/ai/police.js';
import { POLICE } from '../src/models/traffic.js';
import { createRaceScene } from '../src/state/race.js';
import { collideCarWithAgents, touchesScenery } from '../src/game/collision.js';
import { findRestart } from '../src/game/race.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const near = (a, b, eps = 1e-5) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('math: multiply by identity', () => {
  const a = m.mat4FromYawPitch(new Float32Array(16), 0.7, 0.3, 1, 2, 3);
  const out = m.mat4Multiply(new Float32Array(16), a, m.mat4Identity(new Float32Array(16)));
  out.forEach((v, i) => near(v, a[i]));
});

test('math: inverse', () => {
  const proj = m.mat4Perspective(new Float32Array(16), 1.2, 4 / 3, 0.1, 100);
  const a = m.mat4Multiply(new Float32Array(16), proj, m.mat4FromYawPitch(new Float32Array(16), 0.7, 0.3, 1, 2, 3));
  const inv = m.mat4Invert(new Float32Array(16), a);
  const id = m.mat4Multiply(new Float32Array(16), a, inv);
  m.mat4Identity(new Float32Array(16)).forEach((v, i) => near(id[i], v, 1e-3));
  assert.equal(m.mat4Invert(new Float32Array(16), new Float32Array(16)), null);
});

test('math: lookAt', () => {
  const view = m.mat4LookAt(new Float32Array(16), [0, 0, 5], [0, 0, 0], [0, 1, 0]);
  const p = m.mat4TransformPoint([0, 0, 0], view, [1, 2, 0]);
  near(p[0], 1); near(p[1], 2); near(p[2], -5);
  const side = m.mat4LookAt(new Float32Array(16), [5, 0, 0], [0, 0, 0], [0, 1, 0]);
  const q = m.mat4TransformPoint([0, 0, 0], side, [0, 0, -1]);
  near(q[0], 1); near(q[2], -5);
});

test('math: projection uses horizontal FOV with 4:3 aspect', () => {
  const fov = (CONFIG.render.fovDeg * Math.PI) / 180, aspect = CONFIG.render.displayAspect;
  assert.equal(aspect, 4 / 3);
  const proj = m.mat4Perspective(new Float32Array(16), fov, aspect, 0.1, 100);
  const t = Math.tan(fov / 2);
  const p = m.mat4TransformPoint([0, 0, 0], proj, [10 * t, (10 * t) / aspect, -10]);
  near(p[0], 1); near(p[1], 1);
  near(m.mat4TransformPoint([0, 0, 0], proj, [0, 0, -0.1])[2], -1);
  near(m.mat4TransformPoint([0, 0, 0], proj, [0, 0, -100])[2], 1, 1e-4);
});

test('math: yaw turns -Z forward to the left', () => {
  const p = m.mat4TransformPoint([0, 0, 0], m.mat4FromYawPitch(new Float32Array(16), Math.PI / 2, 0, 0, 0, 0), [0, 0, -1]);
  near(p[0], -1); near(p[2], 0);
});

// Every triangle: shared unit normal matching its winding; returns the triangle count.
function checkTriangles(model, outwardFrom) {
  const f = model.floats;
  for (let t = 0; t < model.triCount; t++) {
    const v = (k) => Array.from(f.subarray((t * 3 + k) * FLOATS_PER_VERTEX, (t * 3 + k + 1) * FLOATS_PER_VERTEX));
    const [a, b, c] = [v(0), v(1), v(2)];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const area = Math.hypot(...n);
    assert.ok(area > 1e-7, `${model.name}: degenerate triangle ${t}`);
    for (let i = 3; i < 6; i++) { near(a[i], b[i]); near(a[i], c[i]); }
    near(Math.hypot(a[3], a[4], a[5]), 1);
    assert.ok((n[0] * a[3] + n[1] * a[4] + n[2] * a[5]) / area > 0.7, `${model.name}: normal against winding in triangle ${t}`);
    if (outwardFrom) {
      const d = [0, 1, 2].map((i) => (a[i] + b[i] + c[i]) / 3 - outwardFrom[i]);
      assert.ok(d[0] * a[3] + d[1] * a[4] + d[2] * a[5] > 0, `${model.name}: triangle ${t} faces inward`);
    }
  }
}

test('loader: cube layout, triangulation, normals', () => {
  const cube = buildModel(CUBE);
  assert.equal(cube.triCount, 12);
  assert.equal(cube.vertexCount, 36);
  assert.equal(cube.floats.length, 36 * FLOATS_PER_VERTEX);
  assert.equal(cube.bytes.length, 36 * BYTES_PER_VERTEX);
  assert.equal(cube.lines.length, 12 * 6);
  checkTriangles(cube, [0, 0, 0]);
  assert.deepEqual(Array.from(cube.bytes.subarray(0, 4)), [RAMP.paint3, 14, 0, 0]);
  near(cube.radius, Math.sqrt(3));
  assert.deepEqual(cube.center, [0, 0, 0]);
});

test('loader: pyramid and ground face outward', () => {
  const pyramid = buildModel(PYRAMID);
  assert.equal(pyramid.triCount, 6);
  checkTriangles(pyramid, [0, 0.5, 0]);
  const ground = buildModel(GROUND);
  assert.equal(ground.floats[4], 1);
});

test('loader: body placeholder, flags, validation', () => {
  const tri = (face) => ({ name: 't', verts: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [2, 0, 0]], faces: [face] });
  const built = buildModel(tri([0, 1, 2, 'body', 9, EMIT]));
  assert.deepEqual(Array.from(built.bytes.subarray(0, 3)), [BODY_RAMP, 9, EMIT]);
  assert.deepEqual(Array.from(built.floats.subarray(3, 6)), [0, 0, 1]);
  assert.throws(() => buildModel(tri([0, 1, 7, 'gray', 9, 0])), /invalid vertex index/);
  assert.throws(() => buildModel(tri([0, 1, 2, 'nope', 9, 0])), /unknown ramp/);
  assert.throws(() => buildModel(tri([0, 1, 2, 'gray', 16, 0])), /invalid level/);
  assert.throws(() => buildModel(tri([0, 1, 'gray', 9, 0])), /fewer than 3/);
  assert.throws(() => buildModel(tri([0, 1, 3, 'gray', 9, 0])), /degenerate/);
});

test('model: Vektor GT within budget, valid, symmetric', () => {
  const car = buildModel(VEKTOR_GT);
  assert.ok(car.triCount >= 150 && car.triCount <= 250, `triangles: ${car.triCount}`);
  checkTriangles(car, null);
  assert.ok(car.floats.every(Number.isFinite));
  near(car.center[0], 0);
  const mirrored = new Set(VEKTOR_GT.verts.map((p) => p.map((v) => v.toFixed(4)).join()));
  for (const [x, y, z] of VEKTOR_GT.verts) assert.ok(mirrored.has([-x, y, z].map((v) => v.toFixed(4)).join()));
});

test('palette: 256 entries, ramps, monotonic brightness', () => {
  const pal = buildBasePalette();
  assert.equal(pal.length, 256 * 4);
  assert.equal(RAMP_NAMES.length, 16);
  assert.deepEqual(Array.from(pal.subarray(0, 4)), [0, 0, 0, 255]);
  assert.equal(paletteIndex('lights', 15), 255);
  for (let ramp = 0; ramp < 16; ramp++) {
    let prev = -1;
    for (let level = 0; level < 16; level++) {
      const o = (ramp * 16 + level) * 4;
      const luma = 0.299 * pal[o] + 0.587 * pal[o + 1] + 0.114 * pal[o + 2];
      assert.ok(luma > prev, `ramp ${RAMP_NAMES[ramp]} level ${level} not brighter`);
      assert.equal(pal[o + 3], 255);
      prev = luma;
    }
  }
});

test('font and draw2d: glyph data, clipping', () => {
  for (const [ch, art] of Object.entries(GLYPH_ART)) {
    assert.ok(/^([.#]{5} ){6}[.#]{5}$/.test(art), `glyph ${ch}`);
  }
  const { width, height } = CONFIG.render;
  const buf = new Uint8Array(width * height);
  drawText(buf, 0, 0, 'a', 7);
  assert.equal(buf[1], 7); // top row of A: .###.
  assert.equal(buf[0], 0);
  const count = buf.reduce((n, v) => n + (v ? 1 : 0), 0);
  drawText(buf, width - 2, height - 3, 'W~', 9);
  drawText(buf, -100, -100, 'X', 9);
  assert.equal(buf.length, width * height);
  assert.ok(buf.reduce((n, v) => n + (v ? 1 : 0), 0) > count);
  buf.fill(0);
  fillRect(buf, -5, -5, 10, 10, 3);
  assert.equal(buf.reduce((n, v) => n + (v ? 1 : 0), 0), 25);
  fillRect(buf, width - 1, height - 1, 50, 50, 4);
  assert.equal(buf[width * height - 1], 4);
});

test('model: Vektor GT wheels stay below the body belt line', () => {
  // Wheel verts are the ones at |x| beyond the widest body station; the belt is ring point 1.
  const belt = (z) => {
    const ring = VEKTOR_GT.verts.filter((p, i) => i < 48 && i % 6 === 1);
    const b = ring.findIndex((p) => p[2] >= z);
    const p0 = ring[b - 1], p1 = ring[b];
    return p0[1] + ((z - p0[2]) / (p1[2] - p0[2])) * (p1[1] - p0[1]);
  };
  const wheelVerts = VEKTOR_GT.verts.filter((p) => Math.abs(p[0]) > 0.9);
  assert.ok(wheelVerts.length > 0);
  for (const p of wheelVerts) assert.ok(p[1] < belt(p[2]), `wheel vertex above belt at z=${p[2]}`);
});

test('rng: deterministic per seed, values in [0, 1)', () => {
  const a = createRng(1234), b = createRng(1234), c = createRng(1235);
  const seq = Array.from({ length: 100 }, () => a());
  assert.deepEqual(seq, Array.from({ length: 100 }, () => b()));
  assert.notDeepEqual(seq, Array.from({ length: 100 }, () => c()));
  assert.ok(seq.every((v) => v >= 0 && v < 1));
});

test('math: frustum culling', () => {
  const proj = m.mat4Perspective(new Float32Array(16), 1.2, 4 / 3, 0.1, 100);
  const view = m.mat4LookAt(new Float32Array(16), [0, 0, 0], [0, 0, -1], [0, 1, 0]);
  const planes = m.frustumPlanes(new Float32Array(24), m.mat4Multiply(new Float32Array(16), proj, view));
  assert.ok(m.sphereInFrustum(planes, 0, 0, -10, 1));
  assert.ok(!m.sphereInFrustum(planes, 0, 0, 10, 1));
  assert.ok(!m.sphereInFrustum(planes, 50, 0, -10, 1));
  assert.ok(m.sphereInFrustum(planes, 50, 0, -10, 60));
  assert.ok(!m.sphereInFrustum(planes, 0, 0, -200, 1));
});

const roads = buildRoads(TRACK);
const path = roads[0];

test('track: path is continuous and 35-42 km long', () => {
  assert.ok(path.length > 35000 && path.length < 42000, `length ${path.length}`);
  for (let i = 1; i < path.count; i++) {
    const d = Math.hypot(path.x[i] - path.x[i - 1], path.z[i] - path.z[i - 1]);
    near(d, path.step, 0.01);
    assert.ok(Math.abs(path.heading[i] - path.heading[i - 1]) < 0.13, `heading jump at ${i}`);
    assert.ok(Math.abs(path.grade[i] - path.grade[i - 1]) < 0.01, `grade jump at ${i}`);
    assert.ok(Math.abs(path.bank[i] - path.bank[i - 1]) < 0.03, `bank jump at ${i}`);
  }
  assert.ok(path.bridge.some((b) => b > 0.99));
  const again = buildRoads(TRACK)[0];
  assert.deepEqual(again.x, path.x);
  const p = pathAt(path, 10 * path.step, {});
  near(p.x, path.x[10]); near(p.y, path.y[10]); near(p.z, path.z[10]);
  const mid = pathAt(path, 10.5 * path.step, {});
  near(mid.z, (path.z[10] + path.z[11]) / 2);
});

test('chunks: shared boundary rows, valid upward geometry, triangle budget', () => {
  const defs = buildChunkDefs(path);
  assert.ok(defs.length >= 20);
  let maxTris = 0;
  defs.forEach((def, c) => {
    if (c > 0) {
      const prev = defs[c - 1].verts;
      assert.deepEqual(def.verts.slice(0, ROW_POINTS), prev.slice(prev.length - ROW_POINTS), `gap before chunk ${c}`);
    }
    const built = buildModel(def); // throws on degenerate faces
    checkTriangles(built, null);
    // Road and terrain faces look up (only the skirts under the strip edges are walls): no folds.
    for (let v = 0; v < built.vertexCount; v += 3) {
      assert.ok(built.floats[v * FLOATS_PER_VERTEX + 4] > -0.2, `${def.name}: folded face`);
    }
    maxTris = Math.max(maxTris, built.triCount);
  });
  const visible = Math.ceil(CONFIG.draw.distance / CONFIG.chunk.length) + 2;
  assert.ok(maxTris * visible * 2 <= 20000, `visible triangles with mirror: ${maxTris * visible * 2}`);
});

test('sky: mountain ring is valid, deterministic and within the far plane', () => {
  const def = buildMountainDef();
  const built = buildModel(def);
  assert.equal(built.triCount, CONFIG.sky.mountainSegments * 2);
  assert.deepEqual(buildMountainDef(), def);
  assert.ok(built.radius < CONFIG.render.far);
  // Faces point towards the camera in the middle of the ring.
  for (let v = 0; v < built.vertexCount; v++) {
    const o = v * FLOATS_PER_VERTEX;
    assert.ok(built.floats[o] * built.floats[o + 3] + built.floats[o + 2] * built.floats[o + 5] < 0);
  }
});

test('loop: fixed steps, backlog dropped at the step limit', () => {
  let calls = 0;
  const step = createStepper(0.01, 5, (dt) => { assert.equal(dt, 0.01); calls++; });
  assert.equal(step(0.035), 3);
  assert.equal(step(0.006), 1); // 0.005 left over + 0.006
  assert.equal(step(10), 5);
  assert.equal(step(0.009), 0); // backlog was dropped
  assert.equal(calls, 9);
});

test('surface: heights match the rendered rows, surface types, locate', () => {
  const surface = buildSurface(path), ground = createGround([path], [surface]);
  const out = {}, asphalt = CONFIG.physics.surfaces.asphalt, grass = CONFIG.physics.surfaces.grass;
  for (const i of [3, 120, 310, 700]) {
    buildRow(path, i).forEach((p, j) => {
      ground.reset();
      ground(p[0], p[2], out);
      const T = CONFIG.terrain.offsets.length;
      const onRoad = j >= T + 2 && j <= T + 5, offRoad = j < T - 1 || j > T + 8;
      // Far from the road the nearest track segment is ambiguous in curves, so allow more there.
      near(out.y, p[1], j >= T && j <= T + 7 ? 0.02 : 0.5);
      if (onRoad) assert.equal(out.grip, asphalt.grip);
      if (offRoad) assert.equal(out.grip, grass.grip);
    });
  }
  const where = locate(path, path.x[50] + 3 * Math.cos(path.heading[50]), path.z[50] + 3 * Math.sin(path.heading[50]), -1, {});
  near((where.index + where.t) * path.step, 50 * path.step, 0.01);
  near(where.u, 3, 0.01);
});

const DT = CONFIG.loop.step;
const flat = (x, z, out) => { out.y = 0; out.grip = 1; out.rolling = 1; };
const slope = (grade) => (x, z, out) => { out.y = -z * grade; out.grip = 1; out.rolling = 1; };
const pedal = (throttle, brake = 0, steer = 0) => ({ throttle, brake, steer, gearUp: false, gearDown: false });
const run = (car, controls, seconds, ground = flat) => {
  for (let i = 0; i < seconds / DT; i++) stepCar(car, controls, DT, ground);
};
const within = (value, [min, max], what) => assert.ok(value >= min && value <= max, `${what}: ${value.toFixed(2)} not in ${min}-${max}`);

for (const spec of CARS) {
  test(`physics ${spec.name}: top speed in every gear`, () => {
    spec.expected.gearVmaxKmh.forEach((range, g) => {
      const car = createCar(spec);
      car.auto = false;
      car.gear = g + 1;
      run(car, pedal(1), 150);
      within(car.vLong * 3.6, range, `gear ${g + 1} km/h`);
    });
  });

  test(`physics ${spec.name}: 0-100 km/h and braking distance`, () => {
    const car = createCar(spec);
    let t = 0;
    while (car.vLong < 100 / 3.6 && t < 60) { stepCar(car, pedal(1), DT, flat); t += DT; }
    within(t, spec.expected.zeroToHundredS, '0-100 s');
    const start = car.z;
    car.auto = false; // keep the automatic from selecting reverse at the end
    while (car.vLong > 0) stepCar(car, pedal(0, 1), DT, flat);
    within(start - car.z, spec.expected.brakingFrom100M, 'braking m');
    assert.equal(car.vLong, 0);
    run(car, pedal(0, 1), 1);
    assert.equal(car.vLong, 0);
  });

  test(`physics ${spec.name}: slower uphill, faster downhill`, () => {
    const speedAfter = (grade) => {
      const car = createCar(spec);
      car.vLong = 20;
      run(car, pedal(1), 6, slope(grade));
      return car.vLong;
    };
    const up = speedAfter(0.08), level = speedAfter(0), down = speedAfter(-0.08);
    assert.ok(up < level - 1 && level < down - 1, `${up} ${level} ${down}`);
    const coast = createCar(spec);
    coast.auto = false; coast.gear = 5; coast.vLong = 20;
    run(coast, pedal(0), 5, slope(-0.08));
    assert.ok(coast.vLong > 20, 'coasting downhill gains speed');
  });

  test(`physics ${spec.name}: corner entered too fast slides, slide can be countered`, () => {
    const slip = (car) => Math.atan2(car.vLat, car.vLong);
    const counter = (car) => {
      const lock = spec.steerMax / (1 + car.vLong / spec.steerSpeed);
      return Math.max(-1, Math.min(1, (2 * slip(car)) / lock));
    };
    // Too fast for the steering demand: the front slides and the car runs wide (grip-limited).
    const wide = createCar(spec);
    wide.vLong = 40; wide.gear = 4;
    run(wide, pedal(0.5, 0, 1), 2);
    const lock = spec.steerMax / (1 + wide.vLong / spec.steerSpeed);
    const demanded = (wide.vLong * wide.vLong * lock) / spec.wheelbase;
    assert.ok(wide.vLong * wide.yawRate < 1.05 * spec.grip * CONFIG.physics.gravity && demanded > 3 * CONFIG.physics.gravity);
    // A left-right flick throws the tail out; steering into the slide brings the car back.
    const car = createCar(spec);
    car.vLong = 35; car.gear = 4;
    let worst = 0;
    for (let i = 0; i < 2 / DT; i++) {
      const t = i * DT;
      stepCar(car, pedal(0.6, 0, t < 0.7 ? 1 : t < 1.4 ? -1 : counter(car)), DT, flat);
      worst = Math.max(worst, Math.abs(slip(car)));
    }
    assert.ok(worst > 0.1, `slide develops: ${worst}`);
    for (let i = 0; i < 2 / DT; i++) stepCar(car, pedal(0.6, 0, counter(car)), DT, flat);
    assert.ok(Math.abs(slip(car)) < 0.02 && Math.abs(car.yawRate) < 0.05, `straight again: ${slip(car)} ${car.yawRate}`);
    assert.ok(car.vLong > 25, 'without spinning to a stop');
    // The same flick on asphalt never turns into a spin by itself (no easy spins).
    const calm = createCar(spec);
    calm.vLong = 35; calm.gear = 4;
    for (let i = 0; i < 4 / DT; i++) {
      const t = i * DT;
      stepCar(calm, pedal(0.6, 0, t < 0.7 ? 1 : t < 1.4 ? -1 : 0), DT, flat);
      assert.ok(Math.abs(slip(calm)) < 0.35, `no spin: ${slip(calm)}`);
    }
    // Full throttle and full lock in a low gear stays controllable on asphalt...
    const power = createCar(spec);
    power.vLong = 20; power.gear = 2;
    run(power, pedal(1, 0, 1), 4);
    assert.ok(Math.abs(slip(power)) < 0.2, `no power spin: ${slip(power)}`);
    // ...the car stays steerable under full braking...
    const braking = createCar(spec);
    braking.vLong = 30; braking.gear = 3;
    run(braking, pedal(0, 1, 1), 1);
    assert.ok(braking.yawRate > 0.12, `steers while braking: ${braking.yawRate}`);
    // ...and on grass the same abuse does end in a slide.
    const grass = (x, z, out) => { out.y = 0; out.grip = CONFIG.physics.surfaces.grass.grip; out.rolling = 1; };
    const loose = createCar(spec);
    loose.vLong = 25; loose.gear = 3;
    run(loose, pedal(1, 0, 1), 4, grass);
    assert.ok(Math.abs(slip(loose)) > 0.4, `slides on grass: ${slip(loose)}`);
  });

  test(`physics ${spec.name}: banking helps, grass grips less, deterministic`, () => {
    const lateralG = (ground) => {
      const car = createCar(spec);
      car.vLong = 35; car.gear = 4;
      run(car, pedal(0.3, 0, 1), 3, ground);
      return Math.abs(car.vLong * car.yawRate);
    };
    const banked = (x, z, out) => { out.y = 0; out.grip = 1; out.rolling = 1; };
    const grass = (x, z, out) => { out.y = 0; out.grip = 0.55; out.rolling = 7; };
    assert.ok(lateralG(grass) < lateralG(banked) * 0.75);
    const a = createCar(spec), b = createCar(spec);
    run(a, pedal(1, 0, 0.3), 5); run(b, pedal(1, 0, 0.3), 5);
    assert.deepEqual({ ...a }, { ...b });
    assert.equal(engineTorque(spec, 0), spec.torqueCurve[0][1]);
    const [[r0, t0], [r1, t1]] = spec.torqueCurve.slice(1, 3);
    assert.equal(engineTorque(spec, (r0 + r1) / 2), (t0 + t1) / 2);
  });

  test(`physics ${spec.name}: automatic shifts through the gears, reverse works`, () => {
    const car = createCar(spec);
    const seen = new Set();
    for (let i = 0; i < 40 / DT; i++) { stepCar(car, pedal(1), DT, flat); seen.add(car.gear); }
    assert.deepEqual([...seen], [1, 2, 3, 4, 5]);
    const back = createCar(spec);
    run(back, pedal(0, 1), 2);
    assert.equal(back.gear, -1);
    assert.ok(back.vLong < -1);
    run(back, pedal(1, 0), 4);
    assert.ok(back.gear >= 1 && back.vLong > 1);
    const manual = createCar(spec);
    manual.auto = false;
    stepCar(manual, { ...pedal(0), gearUp: true }, DT, flat);
    assert.equal(manual.gear, 2);
    stepCar(manual, { ...pedal(0), gearDown: true }, DT, flat);
    stepCar(manual, { ...pedal(0), gearDown: true }, DT, flat);
    assert.equal(manual.gear, -1);
  });
}

test('palette: zone and time-of-day variants keep ramps unbroken', () => {
  const luma = (pal, i) => 0.299 * pal[i * 4] + 0.587 * pal[i * 4 + 1] + 0.114 * pal[i * 4 + 2];
  for (const [zone, def] of Object.entries(ZONES)) {
    for (const name of Object.keys(def.ramps)) assert.ok(RAMP[name] !== undefined, `${zone}: ramp ${name}`);
    const day = buildPalette(def.ramps);
    for (const [time, cfg] of Object.entries(CONFIG.time)) {
      const pal = applyTime(day, cfg);
      assert.equal(pal.length, 1024);
      for (let ramp = 0; ramp < 16; ramp++) {
        for (let level = 1; level < 16; level++) {
          const i = ramp * 16 + level;
          assert.ok(luma(pal, i) >= luma(pal, i - 1), `${zone} ${time}: ${RAMP_NAMES[ramp]} level ${level} darker than ${level - 1}`);
          assert.equal(pal[i * 4 + 3], 255);
        }
      }
      // Emissive colors do not change with the time of day.
      for (let i = RAMP.lights * 64; i < RAMP.lights * 64 + 64; i++) assert.equal(pal[i], day[i]);
    }
    assert.deepEqual(applyTime(day, CONFIG.time.day), day);
  }
  const a = buildPalette(ZONES.coast.ramps), b = buildPalette(ZONES.desert.ramps);
  assert.deepEqual(lerpPalette(new Uint8Array(1024), a, b, 0), a);
  assert.deepEqual(lerpPalette(new Uint8Array(1024), a, b, 1), b);
  const mid = lerpPalette(new Uint8Array(1024), a, b, 0.5);
  for (let i = 0; i < 1024; i++) assert.ok(Math.abs(mid[i] - (a[i] + b[i]) / 2) <= 0.5);
});

test('scenery: models valid and within the triangle budget', () => {
  for (const [name, def] of Object.entries(SCENERY)) {
    const built = buildModel(def);
    checkTriangles(built, null);
    const limit = def.lift ? 100 : 40; // parked cars are traffic LOD models
    assert.ok(built.triCount >= 4 && built.triCount <= limit, `${name}: ${built.triCount} triangles`);
    assert.equal(def.name, name);
    if (def.solid) assert.ok(def.collider, `${name}: solid without collider`);
  }
});

const ROAD_STRUCTURES = ['tunnel', 'tunnelPortal', 'truss', 'bridgeRail', 'gantry'];

test('scenery: placement is deterministic, on the terrain, off the road, within budgets', () => {
  const surface = buildSurface(path);
  const placed = placeScenery(path, surface, 1234);
  assert.deepEqual(placeScenery(path, surface, 1234), placed);
  assert.notDeepEqual(placeScenery(path, surface, 1235), placed);
  const where = {}, edge = path.width / 2 + CONFIG.track.shoulder;
  const used = new Set();
  const chunkTris = buildChunkDefs(path).map((def) => def.faces.reduce((sum, f) => sum + f.length - 5, 0));
  const chunkDraws = placed.map((byName) => 1 + Object.keys(byName).length);
  placed.forEach((byName, c) => {
    for (const [name, matrices] of Object.entries(byName)) {
      used.add(name);
      chunkTris[c] += (matrices.length / 16) * buildModel(SCENERY[name]).triCount;
      for (let i = 0; i < matrices.length; i += 16) {
        locate(path, matrices[i + 12], matrices[i + 14], -1, where);
        if (!ROAD_STRUCTURES.includes(name)) assert.ok(Math.abs(where.u) > edge, `${name} on the road`);
        assert.ok(Math.abs(where.u) < 170, `${name} off the terrain`);
        assert.ok(Number.isFinite(matrices[i + 13]));
      }
    }
  });
  for (const zone of Object.values(ZONES)) for (const rule of zone.scenery) assert.ok(SCENERY[rule.obj], rule.obj);
  assert.ok(used.size >= 15, `object types in use: ${used.size}`);
  // Worst case in view (no frustum culling): terrain and scenery within their draw distances
  // ahead, plus the same behind for the mirror.
  const sceneryTris = chunkTris.map((tris, c) => tris - buildChunkDefs(path)[c].faces.length * 2);
  const reach = (distance) => Math.ceil(distance / CONFIG.chunk.length) + 1;
  const sum = (list, from, to) => list.slice(Math.max(0, from), Math.max(0, to + 1)).reduce((a, b) => a + b, 0);
  let worstTris = 0, worstDraws = 0;
  for (let c = 0; c < chunkTris.length; c++) {
    const terrain = chunkTris.map((tris, k) => tris - sceneryTris[k]);
    const tris = sum(terrain, c, c + reach(CONFIG.draw.distance) - 1) + sum(sceneryTris, c, c + reach(CONFIG.scenery.distance) - 1)
      + sum(terrain, c - reach(CONFIG.mirror.distance) + 1, c) + sum(sceneryTris, c - reach(CONFIG.scenery.mirrorDistance) + 1, c);
    const draws = 6 + sum(chunkDraws, c - reach(CONFIG.mirror.distance) + 1, c + reach(CONFIG.draw.distance) - 1) + chunkDraws[c];
    worstTris = Math.max(worstTris, tris);
    worstDraws = Math.max(worstDraws, draws);
  }
  assert.ok(worstTris <= 20000, `worst-case triangles: ${worstTris}`);
  assert.ok(worstDraws <= 300, `worst-case draw calls: ${worstDraws}`);
  console.log(`     (worst case ${worstTris} triangles, ${worstDraws} draw calls)`);
});

test('collision: trees, rocks and barriers stop the car', () => {
  const spec = CARS[0], level = (x, z, out) => { out.y = 0; out.grip = 1; out.rolling = 1; };
  const controls = { throttle: 1, brake: 0, steer: 0, gearUp: false, gearDown: false };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  const drive = (placedChunk, car, seconds) => {
    const colliders = buildColliders([placedChunk]);
    let impact = 0;
    for (let i = 0; i < seconds * 60; i++) {
      stepCar(car, controls, 1 / 60, level);
      impact = Math.max(impact, collideCar(car, colliders));
    }
    return impact;
  };
  // Head-on into a tree 30 m ahead (the car drives towards -Z).
  const car = createCar(spec);
  car.vLong = 20;
  assert.ok(drive({ tree: [...identity, 0, 0, -30, 1] }, car, 4) > 15);
  assert.ok(car.z > -30 + CONFIG.collision.carRadius, `car went through the tree: z ${car.z}`);
  // Non-solid objects do nothing.
  const free = createCar(spec);
  free.vLong = 20;
  assert.equal(drive({ bush: [...identity, 0, 0, -30, 1] }, free, 4), 0);
  assert.ok(free.z < -60);
  // A barrier along the road 2 m to the right: steering into it never crosses it, the car keeps moving.
  const rail = [];
  for (let k = 0; k < 40; k++) rail.push(...identity, 2, 0, -k * 10, 1);
  const slider = createCar(spec);
  slider.vLong = 25;
  const colliders = buildColliders([{ barrier: rail }]);
  for (let i = 0; i < 180; i++) {
    stepCar(slider, { ...controls, steer: 0.3 }, 1 / 60, level);
    collideCar(slider, colliders);
    assert.ok(slider.x < 2, `car crossed the barrier: x ${slider.x}`);
  }
  assert.ok(slider.z < -30 && slider.vLong > 5, 'car slides along the barrier');
  // Real placement: every solid object type yields colliders, scaled and rotated boxes stay finite.
  const all = buildColliders(placeScenery(path, buildSurface(path), 1));
  const records = [...all.cells.values()];
  assert.ok(records.reduce((n, c) => n + c.length / 8, 0) > 500);
  assert.ok(records.every((c) => c.every(Number.isFinite)));
  assert.equal([...buildColliders([{ tunnel: [...identity, 0, 0, 0, 1] }]).cells.values()].reduce((n, c) => n + c.length, 0), 16);
});

test('headlights: buildings block the light, trees and barriers do not', () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  const reach = new Float32Array(CONFIG.headlights.sectors), range = CONFIG.headlights.range;
  // House (8 x 7 m) centered 30 m ahead of a lamp shining towards -Z: front wall at 26.5 m.
  castLight(buildColliders([{ house: [...identity, 0, 0, -30, 1] }]), 0, 0, 0, -1, reach);
  const mid = reach.length >> 1;
  near(reach[mid], 26.5, 0.2);
  assert.equal(reach[0], range); // the edges of the wedge pass beside the house
  assert.equal(reach[reach.length - 1], range);
  // House to the right only shortens the right-hand slices (positive angles turn right).
  castLight(buildColliders([{ house: [...identity, 9, 0, -30, 1] }]), 0, 0, 0, -1, reach);
  assert.ok(reach[reach.length - 2] < 40 && reach[1] === range);
  castLight(buildColliders([{ tree: [...identity, 0, 0, -30, 1], barrier: [...identity, 0, 0, -20, 1] }]), 0, 0, 0, -1, reach);
  assert.ok(reach.every((r) => r === range));
  // Behind the lamp nothing blocks.
  castLight(buildColliders([{ house: [...identity, 0, 0, 30, 1] }]), 0, 0, 0, -1, reach);
  assert.ok(reach.every((r) => r === range));
});

test('street lights: lamp positions and nearest selection', () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  const lamps = [];
  for (let k = 0; k < 12; k++) lamps.push(...identity, 5, 0, -k * 30, 1);
  const lights = buildLights([{ lamp: lamps, tree: [...identity, 0, 0, 0, 1] }]);
  const flat = [...lights.cells.values()].flatMap((c) => Array.from(c)).sort((a, b) => 0);
  assert.equal(flat.length, 12 * 3);
  const head = SCENERY.lamp.light;
  const first = [...lights.cells.values()].map((c) => Array.from(c)).flat();
  assert.ok(first.some((v, k) => k % 3 === 0 && Math.abs(v - (5 + head[0])) < 1e-4));
  assert.ok(first.some((v, k) => k % 3 === 1 && Math.abs(v - head[1]) < 1e-4));
  const out = new Float32Array(4 * 3), distances = new Float32Array(4);
  assert.equal(selectLights(lights, 3, -95, 150, out, distances), 4);
  // Nearest to z = -95: lamps at -90, -120, -60, -150 in that order.
  assert.deepEqual([out[2], out[5], out[8], out[11]], [-90, -120, -60, -150]);
  assert.equal(selectLights(buildLights([]), 0, 0, 150, out, distances), 0);
  const real = buildLights(placeScenery(path, buildSurface(path), 1));
  assert.ok([...real.cells.values()].reduce((n, l) => n + l.length / 3, 0) > 30);
});

test('traffic models: triangle budgets and LODs', () => {
  for (const [name, vehicle] of Object.entries(VEHICLES)) {
    const full = buildModel(vehicle.def), lod = buildModel(vehicle.lod);
    checkTriangles(full, null);
    checkTriangles(lod, null);
    assert.ok(full.triCount >= 80 && full.triCount <= 200, `${name}: ${full.triCount}`);
    assert.ok(lod.triCount <= full.triCount / 2, `${name} LOD: ${lod.triCount}`);
    assert.equal(vehicle.def.lod[0].model, vehicle.lod.name);
  }
  assert.ok(buildModel(VEKTOR_GT_LOD).triCount <= buildModel(VEKTOR_GT).triCount / 2);
  // Player cars: 150-400 triangles, LOD at most half, every spec has its model.
  for (const spec of CARS) {
    const [def, lodDef] = CAR_MODELS[spec.model];
    const full = buildModel(def), lod = buildModel(lodDef);
    checkTriangles(full, null);
    assert.ok(full.triCount >= 150 && full.triCount <= 400, `${spec.name}: ${full.triCount}`);
    assert.ok(lod.triCount <= full.triCount / 2, `${spec.name} LOD: ${lod.triCount}`);
  }
});

// Runs traffic (and optionally the rival) around a player stand-in; checks invariants every step.
function runTraffic(seconds, playerSpeed, withRival) {
  const surface = buildSurface(path), traffic = createTraffic(path, surface, 7);
  const rival = createRival(path, surface), player = createAgent('player');
  player.active = true; player.s = 3300; player.u = CONFIG.traffic.lane; player.v = playerSpeed; player.halfLength = 2.15;
  if (withRival) rival.reset(3300);
  const all = [...traffic.agents, rival.agent, player];
  const seen = { oncoming: 0, same: 0, overtakes: 0, maxActive: 0 }, half = path.width / 2;
  for (let i = 0; i < seconds * 60; i++) {
    player.s = Math.min(player.s + player.v * DT, path.length - 200);
    traffic.update(DT, all, player);
    rival.update(DT, all);
    if (withRival) separateAgents(all);
    const active = all.filter((a) => a.active);
    seen.maxActive = Math.max(seen.maxActive, active.length);
    for (const a of active) {
      if (a.kind === 'traffic') { seen[a.dir < 0 ? 'oncoming' : 'same']++; if (a.overtaking) seen.overtakes++; }
      assert.ok(Math.abs(a.u) <= half, `${a.kind} left the road: u ${a.u}`);
      assert.ok(a.v >= 0 && Number.isFinite(a.s));
      for (const b of active) {
        // A moving stand-in player does not brake, so only a standing one must never be touched.
        if (a === b || ((a.kind === 'player' || b.kind === 'player') && playerSpeed > 0)) continue;
        const overlapS = a.halfLength + b.halfLength - Math.abs(a.s - b.s);
        const overlapU = a.halfWidth + b.halfWidth - Math.abs(a.u - b.u);
        assert.ok(overlapS <= 0.01 || overlapU <= 0.01, `${a.kind} overlaps ${b.kind} at s ${a.s.toFixed(0)} (step ${i})`);
      }
    }
  }
  return { seen, all, rival };
}

test('traffic: both directions, lanes kept, no overlapping vehicles, deterministic', () => {
  const { seen, all } = runTraffic(180, 25, false);
  assert.ok(seen.oncoming > 1000 && seen.same > 1000, JSON.stringify(seen));
  assert.ok(seen.maxActive >= 6, `active vehicles: ${seen.maxActive}`);
  const again = runTraffic(180, 25, false).all;
  assert.deepEqual(again.map((a) => [a.active, a.s, a.u, a.v]), all.map((a) => [a.active, a.s, a.u, a.v]));
});

test('traffic: nobody drives into a standing player', () => {
  const { seen } = runTraffic(120, 0, false);
  assert.ok(seen.same > 500);
});

test('rival: stays on the asphalt, brakes for curves, finishes; difficulty orders lap times', () => {
  const surface = buildSurface(path);
  const lap = (difficulty) => {
    const rival = createRival(path, surface, difficulty), level = CONFIG.rival.levels[difficulty];
    rival.reset(CONFIG.race.startS);
    const all = [rival.agent];
    let t = 0, maxLat = 0, top = 0;
    while (rival.agent.s < path.length - CONFIG.rival.finishMargin - 5 && t < 1500) {
      rival.update(DT, all);
      t += DT;
      const a = rival.agent, k = Math.abs(path.curvature[Math.round(a.s / path.step)]);
      maxLat = Math.max(maxLat, a.v * a.v * k);
      top = Math.max(top, a.v);
      assert.ok(Math.abs(a.u) <= path.width / 2 - 1, `rival off line: u ${a.u}`);
    }
    assert.ok(t < 1500, 'rival finishes');
    assert.ok(maxLat <= level.latAccel * 1.2, `${difficulty}: lateral ${maxLat}`);
    assert.ok(top <= level.topSpeed + 0.01 && top > level.topSpeed * 0.8, `${difficulty}: top ${top}`);
    return t;
  };
  const easy = lap('easy'), normal = lap('normal'), hard = lap('hard');
  assert.ok(easy > normal && normal > hard, `${easy} ${normal} ${hard}`);
  // Beatable: on normal the rival is slower than the player's car can be, in corners and flat out.
  const spec = CARS[0], level = CONFIG.rival.levels.normal;
  assert.ok(level.latAccel < spec.grip * spec.frontGrip * CONFIG.physics.gravity * 0.9);
  assert.ok(level.topSpeed * 3.6 < spec.expected.gearVmaxKmh[4][0]);
  console.log(`     (rival times: easy ${easy.toFixed(0)} s, normal ${normal.toFixed(0)} s, hard ${hard.toFixed(0)} s)`);
});

test('rival: stops at every station and drives on from standstill', () => {
  const rival = createRival(path, buildSurface(path));
  const stop = path.sections[0].end - CONFIG.station.stop;
  rival.reset(stop - 800);
  let slowest = Infinity, t = 0;
  while (rival.agent.s < stop + 300 && t < 120) {
    rival.update(DT, [rival.agent]);
    t += DT;
    if (Math.abs(rival.agent.s - stop) < CONFIG.rival.stopReach) slowest = Math.min(slowest, rival.agent.v);
  }
  assert.ok(slowest < CONFIG.rival.stopSpeed, `rival at the station: ${slowest} m/s`);
  assert.ok(rival.agent.s >= stop + 300, 'and drives on afterwards');
});

test('rival: passes traffic without touching it', () => {
  const { rival } = runTraffic(60, 30, true);
  assert.ok(rival.agent.s > 3300 + 60 * 30, `rival pulled away from a 108 km/h player through traffic: ${rival.agent.s}`);
});

test('collision: vehicles are solid; crash restart is clear of scenery and traffic', () => {
  const spec = CARS[0], level = (x, z, out) => { out.y = 0; out.grip = 1; out.rolling = 1; };
  const van = createAgent('traffic');
  Object.assign(van, { active: true, x: 0, z: -30, heading: 0, v: 0, halfLength: 2.4, halfWidth: 0.92 });
  const car = createCar(spec);
  car.vLong = 20;
  let impact = 0;
  for (let i = 0; i < 240; i++) {
    stepCar(car, { throttle: 1, brake: 0, steer: 0, gearUp: false, gearDown: false }, 1 / 60, level);
    impact = Math.max(impact, collideCarWithAgents(car, [van]));
  }
  assert.ok(impact > CONFIG.crash.speed, `impact ${impact}`);
  assert.ok(car.z > -30 + 2.4, 'car stopped behind the van');
  assert.ok(van.stun > 0);
  // Restart search.
  const surface = buildSurface(path), colliders = buildColliders(placeScenery(path, surface, CONFIG.scenery.seed));
  const lane = CONFIG.race.startU, blocker = createAgent('traffic'), oncoming = createAgent('traffic');
  Object.assign(blocker, { active: true, s: 1990, u: lane, dir: 1 });
  Object.assign(oncoming, { active: true, s: 2100, u: lane, dir: -1 });
  for (const s of [300, 1300, 2000, 3300, 4200]) {
    const at = findRestart(path, colliders, [blocker, oncoming], s);
    assert.ok(at <= s && at >= s - CONFIG.crash.maxBack);
    const p = pathAt(path, at, {});
    const x = p.x + Math.cos(p.heading) * lane, z = p.z + Math.sin(p.heading) * lane;
    assert.ok(!touchesScenery(colliders, Math.floor(at / CONFIG.chunk.length), x, z, p.heading), `restart in scenery at ${at}`);
    if (blocker.active) assert.ok(blocker.s - at <= -CONFIG.crash.clearBehind || blocker.s - at >= CONFIG.crash.clearAhead, `restart next to traffic at ${at}`);
    if (oncoming.active) assert.ok(!(oncoming.s > at && oncoming.s - at < CONFIG.crash.oncomingClear), `restart in front of oncoming at ${at}`);
  }
});

// Player stand-in driving through a police unit; `speedAt(t, player, unit)` gives its speed.
function runPolice(speedAt, seconds, withTraffic) {
  const surface = buildSurface(path), police = createPolice(path, surface);
  const unit = police.units[0], player = createAgent('player');
  player.active = true; player.s = unit.s - 700; player.u = CONFIG.traffic.lane; player.halfLength = 2.15;
  const traffic = createTraffic(path, surface, 3);
  const all = [...(withTraffic ? traffic.agents : []), ...police.agents, player];
  const log = { tickets: 0, chased: false, escaped: false, maxSignal: 0, firstSignalAt: null, jumps: 0 };
  let t = 0, lastS = null, lastU = null;
  for (let i = 0; i < seconds * 60; i++, t += DT) {
    player.v = speedAt(t, player, unit);
    player.s += player.v * DT;
    if (withTraffic) traffic.update(DT, all, player);
    const signal = police.detector(player.s);
    if (signal > 0 && log.firstSignalAt === null) log.firstSignalAt = unit.s - player.s;
    log.maxSignal = Math.max(log.maxSignal, signal);
    if (police.update(DT, all, player, player.v * 3.6)) log.tickets++;
    if (unit.state === 'chase') log.chased = true;
    const a = unit.agent;
    if (a.active && lastS !== null) {
      if (Math.abs(a.s - lastS) > a.v * DT + 1e-6 + CONFIG.police.brake * DT * DT || Math.abs(a.u - lastU) > CONFIG.police.latSpeed * DT + 1e-6) log.jumps++;
    }
    lastS = a.active ? a.s : null; lastU = a.u;
    if (withTraffic) {
      for (const b of traffic.agents) {
        if (!b.active || !a.active) continue;
        assert.ok(Math.abs(a.s - b.s) >= a.halfLength + b.halfLength - 0.01 || Math.abs(a.u - b.u) >= a.halfWidth + b.halfWidth - 0.01, `police overlaps traffic at ${a.s.toFixed(0)}`);
      }
    }
  }
  if (unit.state === 'done' && log.chased && log.tickets === 0) log.escaped = true;
  return { log, unit, police };
}

test('police: models, radar triggers only above the limit, detector warns early enough', () => {
  for (const car of Object.values(POLICE)) {
    assert.ok(buildModel(car.def).triCount <= 200 && buildModel(car.lod).triCount <= buildModel(car.def).triCount / 2);
  }
  const unit0 = createPolice(path, buildSurface(path)).units[0];
  const legal = (unit0.limit - 5) / 3.6, fast = (unit0.limit + 30) / 3.6;
  assert.ok(!runPolice(() => legal, 40, false).log.chased, 'no chase below the limit');
  const { log } = runPolice(() => fast, 20, false);
  assert.ok(log.chased && log.maxSignal === 1);
  near(log.firstSignalAt, unit0.radarRange + CONFIG.police.detectorExtra, 1);
  // From top speed, one second to react and full braking gets under the limit before the radar.
  const spec = CARS[0], car = createCar(spec);
  car.vLong = spec.expected.gearVmaxKmh[4][0] / 3.6;
  car.gear = 5;
  let travelled = car.vLong * 1;
  const start = car.z;
  while (car.vLong * 3.6 > unit0.limit) stepCar(car, pedal(0, 1), DT, flat);
  travelled += start - car.z;
  assert.ok(travelled < CONFIG.police.detectorExtra, `needs ${travelled.toFixed(0)} m of warning`);
});

test('police: chase overtakes and blocks, stopping gives a ticket; no teleports, no overlaps', () => {
  // The player keeps 30 km/h over the limit until the police car is in front, then brakes to a stop.
  let braking = false;
  const { log, unit } = runPolice((t, player, u) => {
    const limit = u.limit / 3.6 + 8;
    if (u.state === 'chase' && u.phase === 'block') braking = true;
    return braking ? Math.max(0, player.v - 6 * DT) : limit;
  }, 90, true);
  assert.ok(log.chased, 'chase started');
  assert.equal(log.tickets, 1, 'ticket after stopping');
  assert.equal(log.jumps, 0, 'police car moved continuously');
  assert.equal(unit.state, 'done');
  assert.ok(Math.abs(unit.agent.u) > path.width / 2, 'after the ticket the police car leaves the lane');
});

test('police: escape by driving away fast enough', () => {
  const { log } = runPolice((t, player, u) => (u.state === 'chase' ? CONFIG.police.topSpeed + 4 : u.limit / 3.6 + 10), 120, false);
  assert.ok(log.chased && log.escaped && log.tickets === 0, JSON.stringify(log));
});

test('race: ticket penalty, three stops end the race, confirm restarts', () => {
  const stub = { addMesh: (model) => ({ model }), addInstances: () => ({}), eye: [0, 0, 0] };
  const race = createRaceScene(stub, { autoGearbox: true });
  const idleInput = { state: { throttle: 0, brake: 0, steer: 0, lookBack: false }, pressed: {} };
  const confirm = { state: idleInput.state, pressed: { confirm: true } };
  const hud = () => { const buf = new Uint8Array(320 * 200); race.drawOverlay(buf); return buf; };
  for (let stop = 1; stop <= CONFIG.police.maxStops; stop++) {
    race.ticket(150, 90);
    race.update(DT, idleInput);
    race.update(DT, confirm); // leave the ticket screen
  }
  const over = hud();
  race.update(DT, idleInput);
  assert.deepEqual(hud(), over, 'race frozen after the last stop');
  race.update(DT, confirm);
  race.update(DT, idleInput);
  assert.notDeepEqual(hud(), over, 'confirm restarts');
});

test('track: validator accepts the track and catches broken data', () => {
  assert.deepEqual(validateTrack(TRACK), []);
  const broken = JSON.parse(JSON.stringify(TRACK));
  broken.sections[0].zone = 'moon';
  broken.sections[1].station = null;
  broken.sections[2].branches[0].pieces[1].len += 400;
  broken.sections[3].scenery = [{ rule: 'at', pos: 10, obj: 'ufo', side: 'left', offset: 1 }];
  const errors = validateTrack(broken).join('\n');
  for (const text of ['unknown zone moon', 'no station', 'unknown scenery object ufo']) assert.ok(errors.includes(text), text);
  const bent = JSON.parse(JSON.stringify(TRACK));
  bent.sections[2].branches[0].pieces[1].len += 400;
  assert.ok(validateTrack(bent).some((e) => e.includes('misses the rejoin point')));
  const looped = JSON.parse(JSON.stringify(TRACK));
  looped.sections[0].pieces.splice(2, 0, { len: 700, curve: 60 });
  assert.ok(validateTrack(looped).some((e) => e.includes('comes within')), 'road crossing itself');
});

test('track: six sections with stations, two forks incl. a gravel shortcut worth a little time', () => {
  assert.equal(path.sections.length, 6);
  assert.ok(path.sections.every((sec) => sec.station));
  assert.equal(roads.length, 3);
  assert.ok(roads.some((road) => road.surface === 'gravel'));
  // Ideal driving time of the player's car, grip-limited in curves (lower grip on gravel).
  const drive = (road, from, to, grip) => {
    let s = from, v = 25, t = 0;
    while (s < to) {
      const limit = cornerSpeed(road, s, 68, 8.6 * grip, 9 * grip, 250, 5);
      v = Math.min(limit, v + 6 * grip * (1 - (v / 68) ** 2) * 0.05);
      s += v * 0.05; t += 0.05;
    }
    return t;
  };
  const total = drive(path, 0, path.length - 1, 1) / 60;
  assert.ok(total > 9 && total < 20, `ideal race time ${total.toFixed(1)} min`);
  for (const branch of roads.slice(1)) {
    const grip = branch.surface === 'gravel' ? CONFIG.physics.surfaces.gravel.grip : 1;
    const gain = 1 - drive(branch, 0, branch.length - 1, grip) / drive(path, branch.fork, branch.rejoin, 1);
    assert.ok(gain > -0.1 && gain < 0.15, `branch ${branch.id}: gain ${(gain * 100).toFixed(1)} %`);
    if (branch.surface === 'gravel') assert.ok(gain > 0.02, 'the shortcut pays off a little');
  }
});

test('roads: driving along a branch switches roads at the fork and back at the rejoin', () => {
  setRoadBounds(roads);
  for (const branch of roads.slice(1)) {
    const hints = new Int32Array(roads.length).fill(-1), where = { index: 0, t: 0, u: 0 };
    let road = 0, last = -Infinity;
    const seen = [];
    // A point on the main road before the fork, along the branch, then on after the rejoin.
    const points = [];
    for (let s = branch.fork - 100; s < branch.fork; s += 5) points.push(pathAt(path, s, {}));
    for (let i = 0; i < branch.count; i++) points.push({ x: branch.x[i], z: branch.z[i] });
    for (let s = branch.rejoin; s < branch.rejoin + 100; s += 5) points.push(pathAt(path, s, {}));
    for (const p of points) {
      road = pickRoad(roads, p.x, p.z, road, hints, where);
      if (seen[seen.length - 1] !== road) seen.push(road);
      const progress = mainDistance(roads[road], (where.index + where.t) * roads[road].step);
      assert.ok(progress > last - 15, `progress went back from ${last.toFixed(0)} to ${progress.toFixed(0)}`);
      last = Math.max(last, progress);
    }
    assert.deepEqual(seen, [0, branch.id, 0]);
  }
});

test('race: station stop, time of day for the next section, finish', () => {
  const stub = { addMesh: (model) => ({ model }), addInstances: () => ({}), eye: [0, 0, 0] };
  const race = createRaceScene(stub, { autoGearbox: true });
  const drive = { state: { throttle: 1, brake: 0, steer: 0, lookBack: false }, pressed: {} };
  const press = (key) => ({ state: { ...drive.state, throttle: 0 }, pressed: { [key]: true } });
  const sections = race.world.path.sections;
  race.place(sections[0].end - 60);
  for (let i = 0; i < 600 && !race.debugText().includes('STATION'); i++) race.update(DT, drive);
  assert.ok(race.debugText().includes('STATION'), 'station reached');
  const frozen = race.car.x;
  race.update(DT, drive);
  assert.equal(race.car.x, frozen, 'the car waits at the station');
  race.update(DT, press('right'));
  race.update(DT, press('right'));
  race.update(DT, press('confirm'));
  assert.equal(race.world.time, 'night');
  assert.ok(!race.debugText().includes('STATION'));
  // The last station is the finish; confirming there restarts the race.
  race.place(sections[5].end - 60);
  for (let i = 0; i < 600 && !race.debugText().includes('STATION'); i++) race.update(DT, drive);
  assert.ok(race.debugText().includes('STATION'), 'finish reached');
  race.update(DT, press('confirm'));
  assert.ok(race.world.progress < 100, 'restarted at the beginning');
});

test('audio: note names, songs compile with equal tracks and known voices', () => {
  assert.equal(noteFreq('A4'), 440);
  assert.ok(Math.abs(noteFreq('C4') - 261.63) < 0.01);
  assert.equal(noteFreq('C#4'), noteFreq('Db4'));
  assert.throws(() => noteFreq('H2'));
  for (const name of ['menu', 'drive', 'results']) {
    const song = compileSong(SONGS[name]);
    assert.ok(song.length >= 64 && song.length % 16 === 0, `${name}: whole bars`);
    for (const e of song.events) {
      const voice = VOICES[e.voice];
      assert.ok(voice, `${name}: voice ${e.voice}`);
      const f = e.freq || voice.fixed || 0;
      assert.ok(voice.noise || (f >= 30 && f <= 4000), `${name}: ${e.voice} pitch ${f}`);
      assert.ok(e.step >= 0 && e.step + e.len <= song.length, `${name}: note inside the song`);
    }
  }
  assert.throws(() => compileSong({ name: 'bad', bpm: 120, tracks: [
    { voice: 'bass', patterns: { a: 'A2 . . .' }, order: 'a' },
    { voice: 'kick', patterns: { k: 'x . .' }, order: 'k' },
  ] }), /steps/);
});

test('audio: lookahead scheduling plays each note once, in order, looping', () => {
  const song = compileSong(SONGS.drive), loop = song.length * song.stepDur;
  const whole = [], chunked = [];
  const a = createCursor(song, 1), b = createCursor(song, 1);
  advance(a, 1, 1 + loop * 2, (e, t) => whole.push(t));
  // A 25 ms timer with 100 ms lookahead over the same span.
  for (let now = 1; now < 1 + loop * 2 - 0.1; now += 0.025) advance(b, now, now + 0.1, (e, t) => chunked.push(t));
  advance(b, 1 + loop * 2 - 0.1, 1 + loop * 2, (e, t) => chunked.push(t));
  assert.equal(whole.length, song.events.length * 2, 'two loops');
  assert.deepEqual(chunked, whole);
  for (let i = 1; i < whole.length; i++) assert.ok(whole[i] >= whole[i - 1]);
  // Late notes are dropped, not played in a burst.
  const c = createCursor(song, 0), late = [];
  advance(c, 2, 2.1, (e, t) => late.push(t));
  assert.ok(late.length > 0 && late.every((t) => t >= 2 && t < 2.1));
});

test('audio: siren Doppler and distance', () => {
  assert.ok(dopplerCents(-30) > 100, 'approaching sounds higher');
  assert.ok(dopplerCents(30) < -100, 'receding sounds lower');
  assert.equal(dopplerCents(0), 0);
  assert.ok(distanceGain(10, 30) > distanceGain(200, 30));
  assert.equal(distanceGain(0, 30), 1);
});

test('audio: race exposes sound state with events', () => {
  const stub = { addMesh: (model) => ({ model }), addInstances: () => ({}), eye: [0, 0, 0] };
  const race = createRaceScene(stub, { autoGearbox: true, time: 'day' });
  const s = race.sound;
  assert.ok(s.engine && s.engine.cylinders > 0);
  const input = { state: { throttle: 1, brake: 0, steer: 0, horn: true, lookBack: false }, pressed: {} };
  for (let i = 0; i < 120; i++) race.update(1 / 60, input);
  assert.equal(s.music, 'drive');
  assert.equal(s.load, 1);
  assert.ok(s.rpm > race.car.spec.idleRpm && s.speed > 1 && s.horn);
  const crashes = s.crashes;
  race.crash();
  assert.equal(s.crashes, crashes + 1);
});

const stubRenderer = () => ({ addMesh: (model) => ({ model }), addInstances: () => ({}), eye: [0, 0, 0] });
const driveInput = (throttle = 1, brake = 0, steer = 0, pressed = {}) => ({ state: { throttle, brake, steer, horn: false, lookBack: false }, pressed });

test('weather: palette variants keep lights, stay monotonic, fog flattens the sky', () => {
  const day = buildBasePalette();
  const rain = applyWeather(day, CONFIG.weather.rain), fog = applyWeather(day, CONFIG.weather.fog);
  assert.deepEqual(applyWeather(day, CONFIG.weather.clear), day, 'clear changes nothing');
  const luma = (p, i) => 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
  for (let i = 1; i < 256; i++) {
    if ((i >> 4) === RAMP.lights) assert.deepEqual([...rain.subarray(i * 4, i * 4 + 4)], [...day.subarray(i * 4, i * 4 + 4)]);
    else if ((i >> 4) !== RAMP.sky) assert.ok(luma(rain, i) <= luma(day, i) + 0.5, `rain darker at ${i}`);
    if ((i & 15) > 1 && (i >> 4) !== RAMP.sky) assert.ok(luma(rain, i) >= luma(rain, i - 1) - 0.5, `monotonic at ${i}`);
  }
  const sky = RAMP.sky * 16;
  for (let l = 1; l < 16; l++) assert.deepEqual([...fog.subarray((sky + l) * 4, (sky + l) * 4 + 3)], [...fog.subarray(sky * 4, sky * 4 + 3)]);
});

test('weather: rain lowers grip (longer braking), fog shortens the view', () => {
  const brakeFrom100 = (weather) => {
    const race = createRaceScene(stubRenderer(), { autoGearbox: true, time: 'day', weather, god: true });
    race.place(2000);
    race.car.vLong = 100 / 3.6;
    const x0 = race.car.x, z0 = race.car.z;
    for (let i = 0; i < 600 && race.car.vLong > 0.1; i++) race.update(1 / 60, driveInput(0, 1));
    return { dist: Math.hypot(race.car.x - x0, race.car.z - z0), world: race.world };
  };
  const clear = brakeFrom100('clear'), rain = brakeFrom100('rain'), fog = brakeFrom100('fog');
  assert.ok(rain.dist > clear.dist * 1.2, `rain ${rain.dist.toFixed(1)} m vs clear ${clear.dist.toFixed(1)} m`);
  assert.equal(rain.world.weatherName, 'rain');
  assert.ok(fog.world.weather.distance < rain.world.weather.distance && !fog.world.weather.mountains);
  console.log(`     (braking 100-0: clear ${clear.dist.toFixed(1)} m, rain ${rain.dist.toFixed(1)} m)`);
});

test('weather: windshield drops are wiped away, streaks stay on screen', () => {
  const r = CONFIG.weather.rainOverlay;
  assert.equal(wiperAngle(0), 0);
  assert.ok(Math.abs(wiperAngle(r.wiperPeriod / 2) - (r.wiperSweepDeg * Math.PI) / 180) < 1e-9);
  const rain = createRain(true, 7);
  let most = 0;
  for (let i = 0; i < 600; i++) {
    rain.update(1 / 60, 30);
    most = Math.max(most, rain.dropCount);
  }
  assert.ok(most > 5 && most < r.drops, `drops at most ${most}`);
  const buf = new Uint8Array(CONFIG.render.width * CONFIG.render.height);
  rain.draw(buf, true);
  assert.ok(buf.some((v) => v === r.streakIndex) && buf.some((v) => v === r.wiperIndex));
  const dry = createRain(false, 7);
  dry.update(1, 30);
  dry.draw(buf.fill(0), true);
  assert.ok(buf.every((v) => v === 0));
});

test('cameras: outside cameras stay above the terrain and see the car', () => {
  // Ground: flat at 0 with a 10 m hill 5-15 m behind the car (+z).
  const ground = (x, z, out) => { out.y = z > 5 && z < 15 ? 10 : 0; };
  const eye = [0, 3, 30], target = [0, 1, 0];
  fitToTerrain(eye, target, ground);
  assert.ok(eye[2] <= 5 + 1e-9, `pulled in front of the hill: z ${eye[2]}`);
  assert.ok(eye[1] >= CONFIG.camera.clearance);
  const low = [0, -2, -8];
  fitToTerrain(low, target, ground);
  assert.ok(low[1] >= CONFIG.camera.clearance, 'never below the ground');
  const car = { x: 0, y: 0, z: 0, heading: 0 };
  topCamera(car, eye, target);
  assert.ok(eye[1] - car.y >= CONFIG.camera.top.height - 1e-9 && eye[2] > 0);
  // Roadside: placed ahead beside the road, moves on after the car passed it.
  const race = createRaceScene(stubRenderer(), { autoGearbox: true, time: 'day', god: true });
  race.place(3000);
  const cam = { x: 0, y: 0, z: 0, s: 0, side: 1, road: 0, valid: false };
  roadsideCamera(cam, race.car, race.world, eye, target);
  const first = cam.s, c = CONFIG.camera.roadside;
  assert.ok(Math.abs(first - race.world.s - c.ahead) < 1);
  const d = Math.hypot(eye[0] - race.car.x, eye[2] - race.car.z);
  assert.ok(d > c.ahead * 0.8 && d < c.maxDistance);
  race.place(first + c.passed + 5);
  roadsideCamera(cam, race.car, race.world, eye, target);
  assert.ok(cam.s > first, 'moved on');
});

test('replay: ring buffer keeps the last frames exactly in order', () => {
  const agents = [{ x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, active: true, type: 'sedan', paint: 'paint3', lightsOn: false }];
  const replay = createReplay(agents, ['sedan', 'van'], 100);
  const car = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, rpm: 0, vLong: 0, gear: 1, accelLong: 0, accelLat: 0 };
  for (let i = 0; i < 250; i++) {
    car.x = 1000 + i * 0.37;
    agents[0].z = -i;
    agents[0].type = i % 2 ? 'van' : 'sedan';
    replay.record(car, 500 + i / 60, i < 200 ? 0 : 2);
  }
  assert.equal(replay.count, 100);
  const out = { time: 0, timeIndex: 0 };
  for (const n of [0, 37, 99]) {
    const i = 150 + n;
    replay.apply(n, car, out);
    assert.ok(Math.abs(car.x - (1000 + i * 0.37)) < 1e-3 && agents[0].z === -i && agents[0].type === (i % 2 ? 'van' : 'sedan'));
    assert.ok(Math.abs(out.time - (500 + i / 60)) < 1e-3 && out.timeIndex === (i < 200 ? 0 : 2));
    assert.equal(agents[0].paint, 'paint3');
  }
});

test('replay: playback matches the recorded drive and leaves the race unchanged', () => {
  const run = (withReplay) => {
    const race = createRaceScene(stubRenderer(), { autoGearbox: true, time: 'day', seed: 5 });
    race.place(2500);
    const log = [];
    for (let i = 0; i < 300; i++) {
      race.update(1 / 60, driveInput(1, 0, Math.sin(i / 40) * 0.3));
      log.push([race.car.x, race.car.z, race.agents.find((a) => a.kind === 'rival').x]);
    }
    if (withReplay) {
      race.update(1 / 60, driveInput(0, 0, 0, { replay: true }));
      assert.ok(race.replaying);
      // Frame n of the replay is the n-th recorded step (the oldest kept is step 0 here).
      for (let n = 0; n < 200; n++) {
        const [x, z, rx] = log[n];
        assert.ok(Math.abs(race.car.x - x) < 0.01 && Math.abs(race.car.z - z) < 0.01, `frame ${n}`);
        assert.ok(Math.abs(race.agents.find((a) => a.kind === 'rival').x - rx) < 0.01);
        race.update(1 / 60, driveInput());
      }
      race.update(1 / 60, driveInput(0, 0, 0, { replay: true }));
      assert.ok(!race.replaying);
    }
    for (let i = 0; i < 200; i++) race.update(1 / 60, driveInput(1, 0, -0.2));
    return [race.car.x, race.car.z, race.car.vLong, race.world.progress];
  };
  assert.deepEqual(run(true), run(false));
});

test('cars: four clearly different characters', () => {
  assert.equal(CARS.length, 4);
  assert.equal(new Set(CARS.map((c) => c.model)).size, 4);
  const [speed, accel, grip, stable] = [0, 1, 2, 3].map((k) => carRatings().map((r) => r[k]));
  const best = (list) => list.indexOf(Math.max(...list));
  // Aurora: fastest and quickest; Breeze: best cornering, lowest top speed; Kestrel: most stable.
  assert.equal(best(speed), 1);
  assert.equal(best(accel), 1);
  assert.equal(best(grip), 2);
  assert.equal(speed.indexOf(Math.min(...speed)), 2);
  assert.equal(best(stable), 3);
  assert.equal(stable.indexOf(Math.min(...stable)), 1, 'Aurora is the nervous one');
  assert.ok(CARS[3].rainLoss < 1 && CARS.every((c) => c.sound && c.blurb.length === 2));
});

test('storage: saved values come back, missing or broken storage never throws', () => {
  const backing = new Map();
  globalThis.window = { localStorage: { getItem: (k) => backing.get(k) ?? null, setItem: (k, v) => backing.set(k, v) } };
  assert.ok(save('records', { T: [{ name: 'ABC', time: 801 }] }));
  assert.deepEqual(load('records', {}), { T: [{ name: 'ABC', time: 801 }] }, 'survives a reload (new read)');
  backing.set('roadline91.settings', '{broken');
  assert.deepEqual(load('settings', { car: 0 }), { car: 0 });
  globalThis.window = { get localStorage() { throw new Error('denied'); } };
  assert.equal(save('x', 1), false);
  assert.equal(load('x', 5), 5);
  delete globalThis.window;
});

test('records: ranking, insertion, table size', () => {
  const table = [];
  for (const time of [900, 800, 1000, 850]) insertRecord(table, { name: 'AAA', time, car: 'X' }, 3);
  assert.deepEqual(table.map((r) => r.time), [800, 850, 900]);
  assert.equal(recordRank(table, 820, 3), 1);
  assert.equal(recordRank(table, 950, 3), -1);
  assert.equal(insertRecord(table, { name: 'B', time: 1200 }, 3), -1);
});

test('menus: navigation, value change, tap on a row', () => {
  let value = 'a', started = 0;
  const menu = createMenu([
    { label: 'X', value: () => value, change: (dir) => { value = step(['a', 'b', 'c'], value, dir); } },
    { label: 'GO', activate: () => started++ },
  ], { x: 20, y: 50, valueX: 100 });
  const input = (pressed, tap = { on: false }) => ({ pressed, tap });
  menu.update(input({ left: true }));
  assert.equal(value, 'c');
  menu.update(input({ down: true }));
  menu.update(input({ confirm: true }));
  assert.equal(started, 1);
  menu.update(input({}, { on: true, x: 160, y: 50 }));
  assert.equal(menu.selected, 0);
  assert.equal(value, 'a', 'tap on the right half steps forward');
  menu.update(input({}, { on: true, x: 30, y: 50 + CONFIG.menu.row }));
  assert.equal(started, 2);
});

test('race: finish and busted results, pause menu', () => {
  let result = null, quit = 0;
  const race = createRaceScene(stubRenderer(), { autoGearbox: true, car: 2, units: 'mph', onFinish: (r) => { result = r; }, onQuit: () => quit++ });
  assert.equal(race.car.spec.name, 'Breeze R');
  const sections = race.world.path.sections;
  race.place(sections[5].end - 60);
  for (let i = 0; i < 600 && !race.debugText().includes('STATION'); i++) race.update(DT, driveInput());
  race.update(DT, driveInput(0, 0, 0, { confirm: true }));
  assert.ok(result && !result.busted && result.car === 'Breeze R' && result.splits[5] > 0 && result.total > 0);
  const lines = resultLines({ ...result, time: 'day' });
  assert.ok(lines[0].includes('WIN') || lines[0].includes('RIVAL'));
  assert.ok(lines.some((l) => l.startsWith('TOTAL')));
  // Pause: the race stands still, QUIT leaves.
  race.place(3000);
  race.update(DT, driveInput(1, 0, 0, { pause: true }));
  assert.ok(race.paused);
  const x = race.car.x;
  for (let i = 0; i < 30; i++) race.update(DT, driveInput());
  assert.equal(race.car.x, x);
  race.update(DT, driveInput(0, 0, 0, { down: true }));
  race.update(DT, driveInput(0, 0, 0, { down: true }));
  race.update(DT, driveInput(0, 0, 0, { confirm: true }));
  assert.equal(quit, 1);
  // Busted: the third police stop ends the race with a busted result.
  result = null;
  const busted = createRaceScene(stubRenderer(), { autoGearbox: true, onFinish: (r) => { result = r; } });
  for (let k = 0; k < CONFIG.police.maxStops; k++) {
    busted.ticket(150, 90);
    busted.update(DT, driveInput(0, 0, 0, { confirm: true }));
  }
  busted.update(DT, driveInput(0, 0, 0, { confirm: true }));
  assert.ok(result && result.busted && !result.win);
});

test('controls: remapping swaps a taken key, labels, defaults untouched', () => {
  const { keys, pad } = defaultBindings();
  assert.deepEqual(Object.keys(keys).sort(), BINDABLE.map(([a]) => a).sort());
  bind(keys, 'throttle', 'KeyI');
  assert.deepEqual(keys.throttle, ['KeyI']);
  bind(keys, 'horn', 'KeyE'); // E belonged to gear up: gear up gets the horn's old key
  assert.deepEqual(keys.horn, ['KeyE']);
  assert.deepEqual(keys.gearUp, ['KeyH']);
  const all = Object.values(keys).flat();
  assert.equal(new Set(all).size, all.length, 'no key on two actions');
  bind(pad, 'camera', 0); // A was throttle's second button: throttle keeps RT
  assert.deepEqual(pad.throttle, [7]);
  assert.deepEqual(DEFAULT_KEYS.throttle, ['ArrowUp', 'KeyW'], 'defaults unchanged');
  assert.equal(keyLabel('KeyW'), 'W');
  assert.equal(keyLabel('ArrowLeft'), 'LEFT');
  assert.equal(keyLabel('ShiftLeft'), 'SHIFTL');
  assert.equal(padLabel(7), 'RT');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${e.message}`);
  }
}
console.log(`${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
