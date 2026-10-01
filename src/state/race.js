// SPDX-License-Identifier: AGPL-3.0-or-later
// Race state: the player's car on the track with traffic, a rival and police; cockpit and outside
// cameras, crashes with restart and time penalty, stations, weather and the replay of the last minute.

import { CONFIG } from '../config.js';
import { mat4FromYawPitch, sphereInFrustum, hypot2, hypot3 } from '../engine/math3d.js';
import { createRng } from '../engine/rng.js';
import { buildModel } from '../models/loader.js';
import { CAR_MODELS } from '../models/sportsCars.js';
import { LIGHTHOUSE_BEAM } from '../models/scenery.js';
import { VEHICLES, POLICE } from '../models/traffic.js';
import { RAMP } from '../gfx/palette.js';
import { drawText, drawChar, drawNumber } from '../gfx/font.js';
import { fillRect } from '../gfx/draw2d.js';
import { createCar, stepCar } from '../vehicle/physics.js';
import { CARS } from '../vehicle/cars.js';
import { createGround } from '../world/surface.js';
import { createWorld, drawWorld, drawMirror, placeCar, constrainCar, locateCar, setTime, TIMES } from '../world/world.js';
import { pathAt } from '../world/track.js';
import { buildRouteMap, drawStation, formatTime } from '../cockpit/station.js';
import {
  cockpitCamera, mirrorCamera, updateChase, chaseCamera, topCamera, roadsideCamera, fitToTerrain,
} from '../camera/cameras.js';
import { createCockpit, drawDetector } from '../cockpit/cockpit.js';
import { createPolice } from '../ai/police.js';
import { buildCitation, drawCitation } from '../cockpit/citation.js';
import { createTraffic, createAgent } from '../ai/traffic.js';
import { createRival } from '../ai/rival.js';
import { collideCarWithAgents } from '../game/collision.js';
import { findRestart } from '../game/race.js';
import { createReplay } from '../game/replay.js';
import { createMenu } from './menu.js';
import { createRain } from '../game/weather.js';
import { TRACK } from '../data/track-main.js';

const HUD_X = 4;
const HUD_MARGIN = 10;
const CHAR_R = 82, CHAR_PLUS = 43, CHAR_MINUS = 45, CHAR_COLON = 58, CHAR_DOT = 46;
const VEHICLE_RADIUS = 5; // m, bounding sphere used for culling vehicles
const OFF_ROAD = 100; // m, lateral position of the player's stand-in while on a branch

/**
 * @param {import('../gfx/renderer.js').Renderer} renderer
 * @param {{autoGearbox: boolean, time?: string, seed?: number, section?: number, god?: boolean,
 *   weather?: string, car?: number, difficulty?: string, units?: string,
 *   onFinish?: (result: Object) => void, onQuit?: () => void, pauseItems?: Object[],
 *   controls?: (close: () => void) => Object}} options
 *   `section` is the 1-based section to start in, `god` turns collisions off, weather clear/rain/fog,
 *   `car` index into CARS, `units` kmh/mph; onFinish gets the result after the finish or the last
 *   police stop (without it the race restarts), onQuit leaves from the pause menu, pauseItems are
 *   extra rows of the pause menu (volume), `controls` builds the key mapping panel opened from it
 * @returns {Object} scene: update(dt, input), render(), drawOverlay(buf), debugText(), pause(),
 *   setHistoric(on), touchButtons(), plus car, world, agents, sound (state for the audio), and
 *   setChase(on), place(s), crash() for tests
 */
export function createRaceScene(renderer, options) {
  const carIndex = Math.max(0, Math.min(CARS.length - 1, options.car || 0));
  const spec = CARS[carIndex], paint = RAMP[spec.paint];
  // The rival drives the next car of the list, in its own color.
  const rivalSpec = CARS[(carIndex + 1) % CARS.length];
  const units = CONFIG.units[options.units] || CONFIG.units.kmh;
  const world = createWorld(renderer, TRACK, options);
  // Some cars cope with the rain better than others.
  world.ground = createGround(world.roads, world.surfaces, 1 - (1 - world.weather.grip) * spec.rainLoss);
  let night = world.time === 'night';
  const seed = options.seed === undefined ? CONFIG.scenery.seed : options.seed;
  // Meshes by model name: [full, lod].
  const meshes = {};
  for (const name of new Set([spec.model, rivalSpec.model])) {
    meshes[name] = [renderer.addMesh(buildModel(CAR_MODELS[name][0])), renderer.addMesh(buildModel(CAR_MODELS[name][1]))];
  }
  for (const [name, vehicle] of [...Object.entries(VEHICLES), ...Object.entries(POLICE)]) {
    meshes[name] = [renderer.addMesh(buildModel(vehicle.def)), renderer.addMesh(buildModel(vehicle.lod))];
  }
  const beamMesh = renderer.addMesh(buildModel(LIGHTHOUSE_BEAM));
  let cockpit = createCockpit(paint, night, units);
  const car = createCar(spec);
  car.auto = options.autoGearbox;
  const traffic = createTraffic(world.path, world.surface, seed);
  const rival = createRival(world.path, world.surface, options.difficulty, world.weather.grip);
  rival.agent.type = rivalSpec.model;
  rival.agent.paint = rivalSpec.paint === spec.paint ? CONFIG.rival.paint : rivalSpec.paint;
  const police = createPolice(world.path, world.surface);
  const player = createAgent('player');
  player.active = true;
  player.halfLength = 2.15;
  const agents = [...traffic.agents, ...police.agents, rival.agent, player];
  const crackRng = createRng(seed);
  const controls = { throttle: 0, brake: 0, steer: 0, gearUp: false, gearDown: false };
  const eye = [0, 0, 0], target = [0, 0, 0], up = [0, 1, 0];
  const model = new Float32Array(16);
  const chase = { heading: 0 };
  const roadside = { x: 0, y: 0, z: 0, s: 0, side: 1, road: 0, valid: false };
  const MODES = CONFIG.camera.modes, MODE_LABELS = MODES.map((m) => m.toUpperCase());
  let cameraMode = 0, lookBack = false, time = 0, crashTimer = 0;
  const rain = createRain(world.weatherName === 'rain', seed);
  // Replay of the last minute: AI vehicles and the player's car, plus a one-frame exact snapshot of
  // the live state to return to.
  const aiAgents = agents.filter((a) => a.kind !== 'player');
  const replay = createReplay(aiAgents, Object.keys(meshes));
  const snapshot = createReplay(aiAgents, Object.keys(meshes), 1, Float64Array);
  const savedHints = new Int32Array(world.hints.length);
  const frame = { time: 0, timeIndex: 0 };
  const play = { on: false, head: 0, paused: false, speed: 1, mode: 0, auto: 0, autoIndex: 0, savedRoad: 0, savedTime: 0, savedTimeIndex: 0, lastX: 0, lastZ: 0 };
  let stops = 0, ticketTimer = 0, ticketAge = 0, citation = [], gameOver = false, signal = 0;
  // Pause menu (open while paused): resume, restart, extra rows from the caller, quit.
  const PZ = CONFIG.pause;
  let pauseOpen = false;
  // Full-screen panel over the pause menu (key mapping), or null.
  let panel = null;
  const closePanel = () => { panel = null; };
  const pauseMenu = createMenu([
    { label: 'RESUME', activate: () => { pauseOpen = false; } },
    { label: 'RESTART', activate: () => restart() },
    ...(options.pauseItems || []),
    ...(options.controls ? [{ label: 'CONTROLS', activate: () => { panel = options.controls(closePanel); } }] : []),
    { label: 'QUIT TO MENU', activate: () => { if (options.onQuit) options.onQuit(); else pauseOpen = false; } },
  ], { x: PZ.x + PZ.itemX, y: PZ.y + PZ.itemY, valueX: PZ.x + PZ.valueX });
  const sections = world.path.sections;
  const firstSection = Math.max(0, Math.min(sections.length - 1, (options.section || 1) - 1));
  const startS = sections[firstSection].start + CONFIG.race.startS;
  // Stations: the next one to reach, the screen while stopped there, split times.
  let nextStation = firstSection, stationsDone = firstSection, station = null, splitStart = 0, routeMap = null;
  const rivalTimes = new Array(sections.length).fill(null);
  const splits = new Array(sections.length).fill(null);
  let rivalNext = firstSection;
  const stationMarks = sections.map((sec) => pathAt(world.path, sec.end, {}));
  // Read by the audio each frame: continuous values plus counters that grow on one-shot events.
  // `siren` is the distance (m) to the nearest wailing police car, -1 for none.
  const sound = {
    music: 'drive', engine: spec.sound, rpm: 0, load: 0, speed: 0, slip: 0, gear: 1, horn: false,
    detector: 0, siren: -1, sirenVr: 0, hits: 0, hitLevel: 0, crashes: 0, rain: 0,
  };

  // The player's stand-in for traffic, rival and police lives on the main road; on a branch it is
  // mapped to the equivalent distance and kept out of the lanes.
  function syncPlayer() {
    const road = world.roads[world.road], i = world.where.index;
    player.s = world.progress;
    player.u = world.road === 0 ? world.where.u : OFF_ROAD;
    // Speed along the road direction (negative when driving the wrong way).
    player.v = car.vLong * Math.cos(car.heading - road.heading[i]);
    player.x = car.x; player.z = car.z;
  }

  function changeTime(time) {
    setTime(world, time);
    night = world.time === 'night';
    cockpit = createCockpit(paint, night, units);
  }

  function stationLines() {
    const sec = sections[station.index], rivalTime = rivalTimes[station.index];
    const lines = [
      station.finish ? 'FINISH!' : sec.station.toUpperCase(),
      `SECTION ${station.index + 1} OF ${sections.length}`,
      '',
      `SPLIT  ${formatTime(station.split)}`,
      `TOTAL  ${formatTime(station.total)}`,
      rivalTime === null ? 'RIVAL  STILL DRIVING' : `RIVAL  ${formatTime(rivalTime)}`,
    ];
    if (rivalTime !== null) {
      const diff = station.total - rivalTime;
      lines.push(`       ${diff <= 0 ? 'AHEAD' : 'BEHIND'} ${Math.abs(diff).toFixed(1)} S`);
    } else lines.push('       YOU LEAD');
    lines.push('');
    if (station.finish) {
      lines.push(rivalTime === null || rivalTime > station.total ? 'YOU WIN THE RACE' : 'THE RIVAL WINS', '', options.onFinish ? 'ENTER: RESULTS' : 'ENTER: RESTART');
    } else {
      lines.push('NEXT SECTION', `< ${station.choice.toUpperCase()} >`, '', 'ENTER: CONTINUE');
    }
    return lines;
  }

  function arrive() {
    const index = nextStation;
    station = { index, split: time - splitStart, total: time, finish: index === sections.length - 1, choice: world.time, lines: [] };
    station.lines = stationLines();
    splits[index] = station.split;
    car.vLong = car.vLat = car.yawRate = 0;
    if (!routeMap) routeMap = buildRouteMap(world.roads, CONFIG.station.mapX, CONFIG.station.mapY, CONFIG.station.mapW, CONFIG.station.mapH);
  }

  function leaveStation(input) {
    if (input.pressed.left || input.pressed.right) {
      const k = TIMES.indexOf(station.choice) + (input.pressed.right ? 1 : TIMES.length - 1);
      station.choice = TIMES[k % TIMES.length];
      station.lines = stationLines();
    }
    if (!input.pressed.confirm) return;
    if (station.finish) {
      finish(false);
      return;
    }
    changeTime(station.choice);
    stationsDone = ++nextStation;
    splitStart = time;
    station = null;
  }

  function place(s, road = 0) {
    // Never appear inside traffic: vehicles right around the spot are recycled.
    if (road === 0) for (const a of traffic.agents) if (Math.abs(a.s - s) < CONFIG.crash.clearAhead) a.active = false;
    placeCar(world, car, s, CONFIG.race.startU, road);
    station = null;
    ticketTimer = 0;
    crashTimer = 0;
    cockpit.setCrack(null);
    car.vLong = 0;
    car.gear = 1;
    constrainCar(world, car);
    // The next station is the end of the section the car is in (teleports skip stations; one
    // already visited is never shown again).
    let k = 0;
    while (k < sections.length - 1 && world.progress >= sections[k].end - CONFIG.station.stop) k++;
    nextStation = Math.max(stationsDone, k);
    syncPlayer();
    updateChase(chase, car, 0);
  }

  // End of the race: results screen (or a restart when nobody listens).
  function finish(busted) {
    if (!options.onFinish) {
      restart();
      return;
    }
    const last = sections.length - 1;
    options.onFinish({
      car: spec.name, carIndex, total: time, busted, stops, firstSection,
      splits: splits.slice(), rivalTimes: rivalTimes.slice(),
      win: !busted && (rivalTimes[last] === null || rivalTimes[last] > time),
      weather: world.weatherName, time: options.time,
    });
  }

  function restart() {
    time = 0;
    splits.fill(null);
    pauseOpen = false;
    panel = null;
    crashTimer = 0;
    stops = 0;
    ticketTimer = 0;
    gameOver = false;
    police.reset();
    changeTime(options.time);
    traffic.reset();
    rival.reset(startS);
    rivalTimes.fill(null);
    rivalNext = nextStation = stationsDone = firstSection;
    station = null;
    splitStart = 0;
    replay.clear();
    place(startS);
  }
  restart();

  function crash() {
    sound.crashes++;
    crashTimer = CONFIG.crash.duration;
    time += CONFIG.crash.penalty;
    car.vLong = car.vLat = car.yawRate = 0;
    cockpit.setCrack(crackRng);
  }

  // Police stop: ticket screen, time penalty; the last allowed stop ends the race.
  function ticket(kmh, limit) {
    stops++;
    time += CONFIG.police.penalty;
    ticketTimer = CONFIG.police.ticketTime;
    ticketAge = 0;
    citation = buildCitation({
      number: (seed * 7 + stops * 1013) % 100000, time: world.time, kmh, limit, vehicle: spec.name, units,
      penalty: CONFIG.police.penalty, stop: stops, maxStops: CONFIG.police.maxStops,
      final: stops >= CONFIG.police.maxStops,
    });
    car.vLong = car.vLat = car.yawRate = 0;
  }

  function updateSound(dt, input) {
    const A = CONFIG.audio, paused = station !== null || gameOver || ticketTimer > 0 || play.on || pauseOpen;
    sound.music = station ? (station.finish ? 'results' : 'menu') : gameOver ? 'results' : pauseOpen ? 'menu' : 'drive';
    sound.rpm = car.rpm;
    sound.load = paused || crashTimer > 0 || car.shiftTimer > 0 ? 0 : car.gear < 0 && car.auto ? input.state.brake : input.state.throttle;
    sound.speed = Math.abs(car.vLong);
    sound.slip = Math.abs(car.vLat);
    sound.gear = car.gear;
    sound.horn = !paused && input.state.horn;
    sound.detector = paused ? 0 : signal;
    sound.rain = rain.raining ? 1 : 0;
    let nearest = A.siren.maxDist;
    if (!paused) {
      for (const a of police.agents) {
        if (a.active && a.sirenOn) nearest = Math.min(nearest, hypot2(a.x - car.x, a.z - car.z));
      }
    }
    if (nearest >= A.siren.maxDist) {
      sound.siren = -1;
      sound.sirenVr = 0;
    } else {
      // Radial speed from the change of distance, smoothed (positive = moving apart).
      const vr = sound.siren < 0 ? 0 : (nearest - sound.siren) / dt;
      sound.sirenVr += (vr - sound.sirenVr) * Math.min(1, A.sirenSmooth * dt);
      sound.siren = nearest;
    }
  }

  // Replay: starts at the oldest kept frame; the live state is saved and restored on exit.
  function startReplay() {
    play.on = true;
    play.head = 0;
    play.paused = false;
    play.mode = 0;
    play.auto = 0;
    play.autoIndex = 0;
    play.savedRoad = world.road;
    play.savedTime = time;
    play.savedTimeIndex = world.timeIndex;
    savedHints.set(world.hints);
    snapshot.clear();
    snapshot.record(car, time, world.timeIndex);
    world.hints.fill(-1);
    roadside.valid = false;
    showFrame(0);
    updateChase(chase, car, 0);
  }

  function stopReplay() {
    play.on = false;
    snapshot.apply(0, car, frame);
    time = play.savedTime;
    if (world.timeIndex !== play.savedTimeIndex) changeTime(TIMES[play.savedTimeIndex]);
    world.hints.set(savedHints);
    world.road = play.savedRoad;
    locateCar(world, car);
    roadside.valid = false;
    updateChase(chase, car, 0);
  }

  function showFrame(dt) {
    replay.apply(Math.floor(play.head), car, frame);
    time = frame.time;
    if (frame.timeIndex !== world.timeIndex) changeTime(TIMES[frame.timeIndex]);
    // A jump (crash restart, rewinding over one) needs a full search for the road.
    if (hypot2(car.x - play.lastX, car.z - play.lastZ) > CONFIG.replay.jump) world.hints.fill(-1);
    play.lastX = car.x;
    play.lastZ = car.z;
    locateCar(world, car);
    pickVehicleLamps(dt);
    cockpit.update(car, dt);
    updateChase(chase, car, dt);
  }

  function updateReplay(dt, input) {
    const R = CONFIG.replay;
    if (input.pressed.replay || input.pressed.confirm) {
      stopReplay();
      return;
    }
    if (input.pressed.pause) play.paused = !play.paused;
    if (input.pressed.camera) {
      play.mode = (play.mode + 1) % (MODES.length + 1);
      roadside.valid = false;
    }
    const steer = input.state.steer;
    play.speed = steer > 0.5 ? R.fastSpeed : steer < -0.5 ? -R.fastSpeed : play.paused ? 0 : 1;
    play.head = Math.max(0, Math.min(replay.count - 1, play.head + play.speed));
    play.auto += dt;
    if (play.mode === 0 && play.auto > R.autoSwitch) {
      play.auto = 0;
      play.autoIndex++;
      roadside.valid = false;
    }
    showFrame(dt);
    rain.update(dt, car.vLong);
  }

  // Camera name: in a replay mode 0 is automatic (cycles through CONFIG.replay.autoModes).
  function currentCamera() {
    if (!play.on) return MODES[cameraMode];
    const auto = CONFIG.replay.autoModes;
    return play.mode > 0 ? MODES[play.mode - 1] : auto[play.autoIndex % auto.length];
  }

  function updatePause(input) {
    if (panel) panel.update(0, input);
    else if (input.pressed.pause || input.pressed.back) pauseOpen = false;
    else pauseMenu.update(input);
  }

  function update(dt, input) {
    updateSound(dt, input);
    if (pauseOpen) {
      updatePause(input);
      return;
    }
    if (input.pressed.pause && !station && !gameOver && ticketTimer <= 0 && !play.on) {
      openPause();
      return;
    }
    if (play.on) {
      updateReplay(dt, input);
      return;
    }
    if (input.pressed.replay && replay.count > 0 && ticketTimer <= 0) {
      startReplay();
      return;
    }
    lookBack = input.state.lookBack;
    if (input.pressed.camera) {
      cameraMode = (cameraMode + 1) % MODES.length;
      roadside.valid = false;
    }
    if (station) {
      leaveStation(input);
      return;
    }
    if (gameOver) {
      ticketAge += dt;
      if (input.pressed.confirm) finish(true);
      return;
    }
    if (ticketTimer > 0) {
      ticketAge += dt;
      ticketTimer -= dt;
      if (ticketTimer <= 0 || input.pressed.confirm) {
        ticketTimer = 0;
        gameOver = stops >= CONFIG.police.maxStops;
      }
      return;
    }
    time += dt;
    if (crashTimer > 0) {
      crashTimer -= dt;
      if (crashTimer <= 0) {
        cockpit.setCrack(null);
        const road = world.road;
        place(findRestart(world.roads[road], world.colliders, road === 0 ? agents : [], world.s), road);
      }
    } else {
      controls.throttle = input.state.throttle;
      controls.brake = input.state.brake;
      controls.steer = input.state.steer;
      controls.gearUp = input.pressed.gearUp;
      controls.gearDown = input.pressed.gearDown;
      stepCar(car, controls, dt, world.ground);
    }
    constrainCar(world, car);
    syncPlayer();
    traffic.update(dt, agents, player);
    rival.update(dt, agents);
    if (!options.god) {
      const stopped = police.update(dt, agents, player, Math.abs(car.vLong) * 3.6);
      if (stopped) ticket(stopped.caughtKmh, stopped.limit);
      signal = police.detector(world.progress);
    }
    if (!options.god && crashTimer <= 0) {
      const impact = Math.max(world.impact, collideCarWithAgents(car, agents));
      if (impact > CONFIG.crash.speed) crash();
      else if (impact > CONFIG.audio.hit.min) {
        sound.hits++;
        sound.hitLevel = impact;
      }
    }
    while (rivalNext < sections.length && rival.agent.s >= sections[rivalNext].end - CONFIG.station.stop) rivalTimes[rivalNext++] = time;
    if (world.road === 0 && nextStation < sections.length && world.s >= sections[nextStation].end - CONFIG.station.stop) arrive();
    pickVehicleLamps(dt);
    cockpit.update(car, dt);
    updateChase(chase, car, dt);
    rain.update(dt, car.vLong);
    replay.record(car, time, world.timeIndex);
  }

  // Draws the AI vehicles inside `distance` of the current view; LOD models far away and in the mirror.
  function drawVehicles(distance, lodOnly) {
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (!a.active || a.kind === 'player') continue;
      const y = a.y + a.wheelRadius;
      const dist = hypot3(a.x - renderer.eye[0], y - renderer.eye[1], a.z - renderer.eye[2]);
      if (dist > distance || !sphereInFrustum(world.planes, a.x, y, a.z, VEHICLE_RADIUS)) continue;
      const lod = lodOnly || dist > CONFIG.traffic.lodDistance ? 1 : 0;
      const flash = Math.floor(time / CONFIG.police.flashPeriod) % 2 ? 'policeRed' : 'policeBlue';
      const type = a.kind === 'police' && a.lightsOn ? flash : a.type;
      renderer.drawMesh(meshes[type][lod], mat4FromYawPitch(model, -a.heading, a.pitch, a.x, y, a.z, -a.roll), RAMP[a.paint]);
    }
  }
  // Lighthouse beams sweep around their lanterns at night.
  function drawBeams() {
    if (!night) return;
    const l = CONFIG.lighthouse;
    for (const [x, y, z] of world.beacons) {
      if (hypot2(x - car.x, z - car.z) > l.beamRange) continue;
      renderer.drawMesh(beamMesh, mat4FromYawPitch(model, time * l.beamSpeed, 0, x, y, z), 0);
    }
  }

  const drawMirrorVehicles = (distance) => drawVehicles(distance, true);

  // At night the AI vehicles nearest to the player light the road ahead of them too. Picked
  // vehicles ramp their light up over time (and it fades with distance), so nothing pops in.
  const picked = new Int16Array(CONFIG.headlights.others.max);
  let pickedCount = 0;

  function pickVehicleLamps(dt) {
    const o = CONFIG.headlights.others;
    let last = -1, lastIndex = -1;
    pickedCount = 0;
    if (!night) return;
    for (let n = 0; n < o.max; n++) {
      // n-th nearest active vehicle: the nearest one after the previous pick.
      let best = -1, bestD = o.fadeEnd * o.fadeEnd;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (!a.active || a.kind === 'player') continue;
        const d = (a.x - car.x) ** 2 + (a.z - car.z) ** 2;
        if (d < bestD && (d > last || (d === last && i > lastIndex))) { best = i; bestD = d; }
      }
      if (best < 0) break;
      last = bestD;
      lastIndex = best;
      picked[pickedCount++] = best;
    }
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      let on = false;
      for (let n = 0; n < pickedCount; n++) if (picked[n] === i) on = true;
      a.glow = on && a.active ? Math.min(1, a.glow + o.glowRate * dt) : 0;
    }
  }

  // At night the nearest chasing police car throws its flashing color on the surroundings.
  function setBeacon() {
    const b = CONFIG.police.beacon;
    renderer.beaconStrength = 0;
    if (!night) return;
    let best = null, bestD = b.reach;
    for (const a of police.agents) {
      const d = hypot2(a.x - car.x, a.z - car.z);
      if (a.active && a.lightsOn && d < bestD) { best = a; bestD = d; }
    }
    if (!best) return;
    const red = Math.floor(time / CONFIG.police.flashPeriod) % 2 === 1;
    renderer.beacon[0] = best.x;
    renderer.beacon[1] = best.y + best.wheelRadius + b.height;
    renderer.beacon[2] = best.z;
    renderer.beacon[3] = b.radius;
    renderer.beaconRamp = RAMP[red ? 'paint1' : 'paint2'];
    renderer.beaconStrength = b.strength;
  }

  function setVehicleLamps() {
    const o = CONFIG.headlights.others, h = CONFIG.headlights;
    renderer.carLampCount = pickedCount;
    for (let n = 0; n < pickedCount; n++) {
      const a = agents[picked[n]], sinH = Math.sin(a.heading), cosH = Math.cos(a.heading), cosP = Math.cos(a.pitch);
      const dist = hypot2(a.x - car.x, a.z - car.z);
      const fade = Math.max(0, Math.min(1, (o.fadeEnd - dist) / (o.fadeEnd - o.fadeStart)));
      renderer.carLamps[n * 3] = a.x + sinH * a.halfLength;
      renderer.carLamps[n * 3 + 1] = a.y + h.height;
      renderer.carLamps[n * 3 + 2] = a.z - cosH * a.halfLength;
      renderer.carLampDirs[n * 4] = sinH * cosP;
      renderer.carLampDirs[n * 4 + 1] = Math.sin(a.pitch);
      renderer.carLampDirs[n * 4 + 2] = -cosH * cosP;
      renderer.carLampDirs[n * 4 + 3] = fade * a.glow;
    }
  }

  function inTunnel(at) {
    const road = world.roads[world.road];
    return road.tunnel[Math.max(0, Math.min(road.count - 1, Math.round(at / road.step)))] > CONFIG.scenery.tunnelLimit;
  }

  function render() {
    const lamp = world.lamp, h = CONFIG.headlights;
    const sinH = Math.sin(car.heading), cosH = Math.cos(car.heading), cosP = Math.cos(car.pitch);
    lamp.on = night;
    lamp.x = car.x + sinH * h.forward;
    lamp.y = car.y + h.height;
    lamp.z = car.z - cosH * h.forward;
    lamp.dirX = sinH * cosP;
    lamp.dirY = Math.sin(car.pitch);
    lamp.dirZ = -cosH * cosP;
    setVehicleLamps();
    setBeacon();
    let camera = currentCamera();
    // Under a tunnel hill the top and roadside cameras would only see the hill: chase instead.
    if (camera === 'top' && inTunnel(world.s)) camera = 'chase';
    if (camera === 'roadside') {
      roadsideCamera(roadside, car, world, eye, target);
      if (inTunnel(world.s) || inTunnel(roadside.s)) camera = 'chase';
    }
    if (camera !== 'cockpit') {
      if (camera === 'chase') chaseCamera(chase, car, eye, target);
      else if (camera === 'top') topCamera(car, eye, target);
      world.cameraGround.follow(world.road, world.hints);
      fitToTerrain(eye, target, world.cameraGround);
      up[0] = 0; up[1] = 1; up[2] = 0;
      drawWorld(world, renderer, eye, target, up);
      drawVehicles(CONFIG.draw.distance, false);
      drawBeams();
      const c = CONFIG.camera.cockpit;
      const pitch = car.pitch + c.pitchGain * car.accelLong, roll = car.roll - c.rollGain * car.accelLat;
      mat4FromYawPitch(model, -car.heading, pitch, car.x, car.y + spec.wheelRadius, car.z, -roll);
      renderer.drawMesh(meshes[spec.model][0], model, paint);
      return;
    }
    const back = lookBack && !play.on;
    cockpitCamera(car, back, eye, target, up);
    drawWorld(world, renderer, eye, target, up);
    drawVehicles(CONFIG.draw.distance, false);
    drawBeams();
    if (back || renderer.wire || (crashTimer > 0 && !play.on)) return;
    mirrorCamera(car, eye, target, up);
    drawMirror(world, renderer, eye, target, up, drawMirrorVehicles);
  }

  // Race time and the distance to the rival (positive = rival ahead), top right.
  function drawStatus(buf) {
    const { x, y, index } = CONFIG.hud;
    const seconds = Math.floor(time);
    drawNumber(buf, x + 32, y, Math.floor(seconds / 60), 2, index);
    drawChar(buf, x + 48, y, CHAR_COLON, index);
    drawNumber(buf, x + 56, y, Math.floor((seconds % 60) / 10), 1, index);
    drawNumber(buf, x + 64, y, seconds % 10, 1, index);
    const gap = rival.agent.s - world.progress;
    drawChar(buf, x, y + 10, CHAR_R, index);
    drawChar(buf, x + 16, y + 10, gap >= 0 ? CHAR_PLUS : CHAR_MINUS, index);
    drawNumber(buf, x + 24, y + 10, Math.abs(gap) * units.distanceFactor, 4, index);
    drawChar(buf, x + 58, y + 10, units.distanceChar, index);
  }

  function drawTicket(buf) {
    drawCitation(buf, citation, ticketAge, gameOver ? (options.onFinish ? 'ENTER: RESULTS' : 'ENTER: RESTART') : 'ENTER: CONTINUE');
  }

  // Replay bar at the bottom: playback state and keys.
  function drawReplayBar(buf) {
    const y = CONFIG.render.height - HUD_MARGIN, index = CONFIG.cockpit.tickIndex, R = CONFIG.replay;
    fillRect(buf, 0, y - 2, CONFIG.render.width, HUD_MARGIN + 2, CONFIG.cockpit.frameIndex);
    drawText(buf, HUD_X, y, 'REPLAY', index);
    drawText(buf, HUD_X + 56, y, play.speed > 1 ? '>>' : play.speed < 0 ? '<<' : play.speed === 0 ? 'II' : '>', index);
    drawText(buf, HUD_X + 80, y, play.mode === 0 ? 'AUTO' : MODE_LABELS[play.mode - 1], index);
    drawText(buf, R.hintX, y, 'C CAM P PAUSE R EXIT', index);
    // Seconds before the live moment.
    const tenths = Math.round(Math.max(0, replay.count - 1 - play.head) * CONFIG.loop.step * 10);
    drawChar(buf, HUD_X, y - HUD_MARGIN, CHAR_MINUS, index);
    drawNumber(buf, HUD_X + 8, y - HUD_MARGIN, Math.floor(tenths / 10), 2, index);
    drawChar(buf, HUD_X + 24, y - HUD_MARGIN, CHAR_DOT, index);
    drawNumber(buf, HUD_X + 32, y - HUD_MARGIN, tenths % 10, 1, index);
  }

  function drawOverlay(buf) {
    const camera = currentCamera(), inside = camera === 'cockpit' && (play.on || !lookBack);
    if (play.on) {
      if (inside) {
        rain.draw(buf, true);
        cockpit.draw(buf, car);
      } else rain.draw(buf, false);
      drawReplayBar(buf);
      return;
    }
    if (station) {
      drawStation(buf, station.lines, routeMap, stationMarks, car);
      return;
    }
    rain.draw(buf, inside);
    if (inside) {
      cockpit.drawCrack(buf);
      cockpit.draw(buf, car);
      drawDetector(buf, CONFIG.detector.x, CONFIG.detector.y, signal, time);
    } else {
      drawDetector(buf, CONFIG.detector.chaseX, CONFIG.detector.chaseY, signal, time);
      const y = CONFIG.render.height - HUD_MARGIN, index = CONFIG.cockpit.tickIndex;
      drawNumber(buf, HUD_X, y, Math.abs(car.vLong) * units.factor, 3, index);
      drawText(buf, HUD_X + 32, y, units.label, index);
      drawChar(buf, HUD_X + 80, y, car.gear < 0 ? CHAR_R : 48 + car.gear, index);
      if (crashTimer > 0) drawText(buf, 140, 90, 'CRASH', index);
    }
    drawStatus(buf);
    if (ticketTimer > 0 || gameOver) drawTicket(buf);
    if (pauseOpen) drawPause(buf);
    if (pauseOpen && panel) panel.drawOverlay(buf);
  }

  function drawPause(buf) {
    const c = CONFIG.cockpit;
    fillRect(buf, PZ.x, PZ.y, PZ.w, PZ.itemY + pauseMenu.items.length * CONFIG.menu.row + PZ.padding, c.frameIndex);
    drawText(buf, PZ.x + PZ.itemX, PZ.y + PZ.padding, 'PAUSED', c.textIndex);
    pauseMenu.draw(buf);
  }

  function openPause() {
    pauseOpen = true;
    pauseMenu.selected = 0;
  }


  // On-screen touch buttons for the current mode (CONFIG.touch): driving controls, or menu keys.
  function touchButtons() {
    if (station || gameOver || ticketTimer > 0 || pauseOpen || play.on) return CONFIG.touch.menu;
    return car.auto ? CONFIG.touch.drive : CONFIG.touch.driveManual;
  }

  return {
    update, render, drawOverlay, car, world, agents, sound, touchButtons,
    /** Opens the pause menu (also used when the tab is hidden). */
    pause() {
      if (!station && !gameOver && ticketTimer <= 0 && !play.on && !pauseOpen) openPause();
    },
    get paused() { return pauseOpen; },
    /** Historical mode: shorter draw distance. */
    setHistoric(on) { world.distanceScale = on ? CONFIG.history.distance : 1; },
    setChase(on) { cameraMode = MODES.indexOf(on ? 'chase' : 'cockpit'); updateChase(chase, car, 0); },
    setCamera(name) { cameraMode = MODES.indexOf(name); roadside.valid = false; },
    replay, rain,
    get replaying() { return play.on; },
    place, crash, ticket, police, arrive,
    debugText: () => `S ${Math.round(world.progress)} R${world.road} G${car.gear}${ticketTimer > 0 ? ' TICKET' : ''}${crashTimer > 0 ? ' CRASH' : ''}${station ? ' STATION' : ''}${gameOver ? ' OVER' : ''}${play.on ? ' REPLAY' : ''} ${MODES[cameraMode]}`,
  };
}
