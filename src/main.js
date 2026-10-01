// SPDX-License-Identifier: AGPL-3.0-or-later
// Bootstrap and frame loop: context, renderer, screens (title, setup, race, results), audio,
// input, saved settings and records, historical mode, touch buttons, debug overlay and keys.

import { CONFIG } from './config.js';
import { createContext, simulateContextLoss } from './gfx/gl.js';
import { Renderer } from './gfx/renderer.js';
import { clearOverlay, fillRect } from './gfx/draw2d.js';
import { drawText, CELL } from './gfx/font.js';
import { createRenderScene } from './state/renderScene.js';
import { createRaceScene } from './state/race.js';
import { createTitle } from './state/title.js';
import { createSetup } from './state/setup.js';
import { createResults } from './state/results.js';
import { volumeItems } from './state/menu.js';
import { createControls, defaultBindings } from './state/controls.js';
import { createInput } from './engine/input.js';
import { createStepper } from './engine/loop.js';
import { createAudio } from './audio/mixer.js';
import { drawTouchButtons } from './cockpit/touch.js';
import { load, save } from './storage.js';
import { validateTrack } from './world/validate.js';
import { TIMES, WEATHERS } from './world/world.js';
import { CARS } from './vehicle/cars.js';
import { TRACK } from './data/track-main.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('screen');
// Any of these parameters starts the race directly instead of the title screen (debugging).
const DIRECT = ['race', 'section', 'car', 'time', 'weather', 'gearbox', 'god', 'seed'];
const W = CONFIG.render.width, H = CONFIG.render.height;

function showError(message) {
  const el = document.getElementById('error');
  el.textContent = message;
  el.hidden = false;
  canvas.hidden = true;
}

// Saved settings, checked value by value, then URL overrides (not saved).
function loadSettings() {
  const d = CONFIG.menu.defaults, s = { ...d, ...load('settings', {}) };
  const valid = { time: TIMES, weather: WEATHERS, gearbox: ['auto', 'manual'], difficulty: ['easy', 'normal', 'hard'], units: ['kmh', 'mph'], res: [1, 2] };
  for (const key in valid) if (!valid[key].includes(s[key])) s[key] = d[key];
  for (const key of ['volMaster', 'volMusic', 'volEffects']) {
    if (!(Number.isInteger(s[key]) && s[key] >= 0 && s[key] <= CONFIG.menu.volumeSteps)) s[key] = d[key];
  }
  if (!(Number.isInteger(s.car) && s.car >= 0 && s.car < CARS.length)) s.car = d.car;
  if (typeof s.lastName !== 'string') s.lastName = d.lastName;
  // Remapped controls: every action needs a non-empty list of codes / button numbers.
  const defaults = defaultBindings();
  for (const [kind, ok] of [['keys', (c) => typeof c === 'string'], ['pad', (b) => Number.isInteger(b) && b >= 0]]) {
    const map = s[kind] && typeof s[kind] === 'object' ? s[kind] : {};
    for (const action in defaults[kind]) {
      if (!(Array.isArray(map[action]) && map[action].length && map[action].every(ok))) map[action] = defaults[kind][action];
    }
    s[kind] = map;
  }
  const urlCar = Number(params.get('car'));
  if (Number.isInteger(urlCar) && urlCar >= 0 && urlCar < CARS.length && params.has('car')) s.car = urlCar;
  for (const key of ['time', 'weather', 'gearbox', 'units']) if (valid[key].includes(params.get(key))) s[key] = params.get(key);
  if (params.get('res') === '2') s.res = 2;
  return s;
}

function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  } catch (e) {
    // fullscreen not supported: stay windowed
  }
}

// Phones: the first touch goes fullscreen and tries to lock landscape.
function enterMobileFullscreen() {
  try {
    const p = document.documentElement.requestFullscreen ? document.documentElement.requestFullscreen() : null;
    if (p) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => {});
  } catch (e) {
    // not supported
  }
}

function createApp(renderer) {
  const settings = loadSettings();
  const records = load('records', {});
  const app = {
    renderer, settings, records, scene: null, next: null, toggleFullscreen,
    saveSettings: () => save('settings', settings),
    saveRecords: () => save('records', records),
    /** Switches screens at the start of the next frame. */
    go(name, arg) { app.next = { name, arg, shown: false }; },
  };
  app.build = ({ name, arg }) => {
    renderer.releaseAll();
    if (name === 'title') return createTitle(app);
    if (name === 'setup') return createSetup(app);
    if (name === 'results') return createResults(app, arg);
    if (name === 'controls') return createControls(app);
    return createRaceScene(renderer, {
      car: settings.car, time: settings.time, weather: settings.weather, units: settings.units,
      autoGearbox: settings.gearbox !== 'manual', difficulty: settings.difficulty,
      section: Number(params.get('section')) || 1,
      god: params.get('god') === '1',
      seed: params.has('seed') ? Number(params.get('seed')) : undefined,
      onFinish: (result) => app.go('results', result),
      onQuit: () => app.go('title'),
      pauseItems: volumeItems(app),
      controls: (close) => createControls(app, close),
    });
  };
  renderer.setScale(settings.res);
  return app;
}

function drawLoading(renderer) {
  clearOverlay(renderer.overlay);
  fillRect(renderer.overlay, 0, 0, W, H, CONFIG.cockpit.frameIndex);
  drawText(renderer.overlay, (W - 7 * CELL) >> 1, H >> 1, 'LOADING', CONFIG.menu.textIndex);
  renderer.endFrame();
}

function drawDebug(renderer, lines) {
  const { textIndex, backIndex } = CONFIG.debug;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    fillRect(renderer.overlay, 0, i * CELL, lines[i].length * CELL + 1, CELL, backIndex);
    drawText(renderer.overlay, 1, i * CELL, lines[i], textIndex);
  }
}

function start() {
  const gl = createContext(canvas);
  if (!gl) {
    showError("ROADLINE '91 requires WebGL2.\nThis browser or device does not support it.");
    return;
  }
  const renderer = new Renderer(gl);
  renderer.wire = params.get('wire') === '1';
  renderer.rawPal = params.get('rawpal') === '1';
  renderer.debug = params.get('debug') === '1';
  const app = createApp(renderer);
  // Debug only: the app object for diagnostics from the browser console or test tools.
  if (renderer.debug) window.roadline = app;
  if (params.get('scene') === 'render') app.scene = createRenderScene(renderer, params.get('stress') === '1');
  else app.go(DIRECT.some((p) => params.has(p)) ? 'race' : 'title');
  // In debug mode the track data is validated at start; the first problem shows in the overlay.
  const trackErrors = params.get('debug') === '1' ? validateTrack(TRACK) : [];
  const input = createInput(canvas);
  input.setBindings(app.settings.keys, app.settings.pad);
  app.input = input;
  const audio = createAudio(params.get('mute') === '1');
  const steps = CONFIG.menu.volumeSteps, set = app.settings;
  app.applyVolumes = () => audio.setVolumes(set.volMaster / steps, set.volMusic / steps, set.volEffects / steps);
  app.applyVolumes();
  // Browsers start audio only after a user gesture; every gesture also resumes a suspended context.
  for (const type of ['keydown', 'pointerdown', 'touchstart']) window.addEventListener(type, () => audio.start());
  canvas.addEventListener('touchstart', enterMobileFullscreen, { once: true });
  document.addEventListener('visibilitychange', () => {
    audio.setHidden(document.hidden);
    if (document.hidden && app.scene && app.scene.pause) app.scene.pause();
  });
  const step = createStepper(CONFIG.loop.step, CONFIG.loop.maxSteps, (dt) => {
    if (app.scene) app.scene.update(dt, input);
    input.endStep();
  });
  const debugLines = ['', '', '', ''];
  let lost = false, last = performance.now(), cpuMs = 0, frames = 0, sinceRefresh = 0;
  let historic = false, sinceRender = 0;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    renderer.init();
    lost = false;
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F1') renderer.debug = !renderer.debug;
    else if (e.code === 'F2') renderer.wire = !renderer.wire;
    else if (e.code === 'F3') {
      historic = !historic;
      if (app.scene && app.scene.setHistoric) app.scene.setHistoric(historic);
    } else if (e.code === 'F4') simulateContextLoss(gl, CONFIG.debug.contextRestoreMs);
    else if (e.code === 'KeyM') audio.toggleMute();
    else return;
    e.preventDefault();
  });

  function refreshDebug() {
    const { tris, draws, gpuMs } = renderer.stats;
    const glError = gl.getError();
    debugLines[0] = `FPS ${Math.round(frames / sinceRefresh)} CPU ${cpuMs.toFixed(1)} GPU ${gpuMs < 0 ? 'N/D' : gpuMs.toFixed(1)}${historic ? ' HIST' : ''}`;
    debugLines[1] = `TRI ${tris} DRAW ${draws} RES X${renderer.scale}`;
    debugLines[2] = app.scene && app.scene.debugText ? app.scene.debugText() : '';
    debugLines[3] = glError ? `GL ERROR ${glError}` : trackErrors.length ? `TRACK: ${trackErrors[0]}` : '';
    frames = 0;
    sinceRefresh = 0;
  }

  // Screen change: a race takes a moment to build, so a loading frame is shown first.
  function switchScene() {
    if (app.next.name === 'race' && !app.next.shown) {
      app.next.shown = true;
      drawLoading(renderer);
      return;
    }
    app.scene = app.build(app.next);
    app.next = null;
    if (app.scene.setHistoric) app.scene.setHistoric(historic);
  }

  function drawFrame() {
    const scene = app.scene, overlay = renderer.overlay;
    scene.render();
    clearOverlay(overlay);
    if (scene.drawOverlay) scene.drawOverlay(overlay);
    const buttons = input.touch.used && scene.touchButtons ? scene.touchButtons() : null;
    if (buttons) drawTouchButtons(overlay, buttons);
    if (input.touch.used && window.innerHeight > window.innerWidth) {
      fillRect(overlay, 0, (H >> 1) - CELL, W, CELL * 3, CONFIG.cockpit.frameIndex);
      drawText(overlay, (W - 19 * CELL) >> 1, H >> 1, 'ROTATE TO LANDSCAPE', CONFIG.menu.selectedIndex);
    }
    if (renderer.debug) drawDebug(renderer, debugLines);
    renderer.endFrame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, CONFIG.loop.maxDt);
    last = now;
    if (lost) return;
    if (app.next) {
      switchScene();
      return;
    }
    const t0 = performance.now();
    input.setButtons(input.touch.used && app.scene.touchButtons ? app.scene.touchButtons() : null);
    input.poll(dt);
    step(dt);
    audio.update(app.scene.sound || null, dt);
    if (renderer.debug) {
      sinceRefresh += dt;
      if (sinceRefresh >= CONFIG.debug.refreshSec) refreshDebug();
    }
    // Historical mode: the picture is redrawn only 15 times per second (physics stays at 60 Hz).
    sinceRender += dt;
    if (historic && sinceRender < 1 / CONFIG.history.fps) return;
    sinceRender = historic ? sinceRender % (1 / CONFIG.history.fps) : 0;
    frames++;
    drawFrame();
    cpuMs = performance.now() - t0;
  }
  requestAnimationFrame(frame);
}

try {
  start();
} catch (e) {
  showError(String((e && e.message) || e));
}
