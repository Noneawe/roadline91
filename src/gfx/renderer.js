// SPDX-License-Identifier: AGPL-3.0-or-later
// Frame orchestration: world pass into the palette index buffer, overlay upload, present pass.
// Knows nothing about the game: takes built models, matrices and the overlay buffer.

import { CONFIG } from '../config.js';
import { createProgram } from './program.js';
import { createIndexTarget, deleteIndexTarget, createTexture } from './targets.js';
import { createOverlayTexture, uploadOverlay } from './overlay.js';
import { buildBasePalette, paletteIndex, RAMP } from './palette.js';
import { uploadMesh, uploadInstances, releaseMesh, releaseInstances } from './mesh.js';
import { WORLD } from './shaders/world.js';
import { WIRE } from './shaders/wire.js';
import { SKY } from './shaders/sky.js';
import { PRESENT } from './shaders/present.js';
import { EMIT, NIGHT_ONLY, DITHER, BODY_RAMP } from '../models/loader.js';
import { hypot3 } from '../engine/math3d.js';

const W = CONFIG.render.width;
const H = CONFIG.render.height;
const FOG_OFF = [1e9, 2e9];
const MIN_GROUND_HEIGHT = 1;

export class Renderer {
  /**
   * @param {WebGL2RenderingContext} gl
   */
  constructor(gl) {
    this.gl = gl;
    /** Overlay buffer drawn by the caller every frame (0 = transparent). */
    this.overlay = new Uint8Array(W * H);
    /** Index buffer size: 320x200 times `scale` (2 = enhanced mode; the overlay stays 320x200). */
    this.scale = 1;
    this.width = W;
    this.height = H;
    this.palette = buildBasePalette();
    this.wire = false;
    this.rawPal = false;
    /** Enables GPU timing queries. */
    this.debug = false;
    this.stats = { tris: 0, draws: 0, gpuMs: -1 };
    this.meshes = [];
    this.batches = [];
    const { render } = CONFIG;
    this.clearValue = new Uint32Array([paletteIndex(render.clearRamp, render.clearLevel), 0, 0, 0]);
    this.depthClear = new Float32Array([1]);
    this.wireIndex = paletteIndex(render.wireRamp, render.wireLevel);
    this.lightDir = new Float32Array(3);
    this.light = new Float32Array(2);
    this.night = false;
    this.lampOn = false;
    this.lampPos = new Float32Array(3);
    this.lampDir = new Float32Array(3);
    this.lampReach = new Float32Array(CONFIG.headlights.sectors).fill(CONFIG.headlights.range);
    /** Street lamps lighting their surroundings: world x, y, z each; filled by the caller. */
    this.lights = new Float32Array(CONFIG.streetLights.max * 3);
    this.lightCount = 0;
    this.lightsRel = new Float32Array(CONFIG.streetLights.max * 3);
    /** Headlights of other vehicles: world position (x, y, z each), direction and strength (x, y, z, w). */
    this.carLamps = new Float32Array(CONFIG.headlights.others.max * 3);
    this.carLampDirs = new Float32Array(CONFIG.headlights.others.max * 4);
    this.carLampCount = 0;
    this.carLampsRel = new Float32Array(CONFIG.headlights.others.max * 3);
    /** Flashing police light: world position, radius, palette ramp and strength (0 = off). */
    this.beacon = new Float32Array(4);
    this.beaconRamp = 0;
    this.beaconStrength = 0;
    this.eye = new Float32Array(3);
    this.paletteKey = 0;
    this.current = null;
    this.setLight(CONFIG.time.day.light);
    this.rect = new Float32Array(4);
    this.fog = new Float32Array(FOG_OFF);
    this.fogIndex = paletteIndex(CONFIG.sky.ramp, CONFIG.sky.horizonLevel);
    /** World height of the infinite ground plane drawn by the sky pass below the horizon. */
    this.groundY = 0;
    /** Palette index of the ground plane below the horizon. */
    this.groundIndex = paletteIndex(CONFIG.sky.groundRamp, CONFIG.sky.groundLevel);
    this.cosInner = Math.cos((CONFIG.headlights.innerDeg * Math.PI) / 180);
    this.cosOuter = Math.cos((CONFIG.headlights.outerDeg * Math.PI) / 180);
    this.tanX = Math.tan((render.fovDeg * Math.PI) / 360);
    this.tanY = this.tanX / render.displayAspect;
    this.readBuffer = null; // allocated by readIndices (render tests only)
    this.init();
  }

  /** Creates all GL resources from CPU data. Called again after a context restore. */
  init() {
    const gl = this.gl;
    const defines = {
      FLAG_EMIT: `${EMIT}u`, FLAG_NIGHT_ONLY: `${NIGHT_ONLY}u`, FLAG_DITHER: `${DITHER}u`, BODY_RAMP: `${BODY_RAMP}u`,
      EMIT_FOG_START: CONFIG.headlights.emitFogStart,
      LAMP_FACING_MIN: CONFIG.headlights.facingMin, LAMP_SECTORS: CONFIG.headlights.sectors,
      LAMP_OUTER: (CONFIG.headlights.outerDeg * Math.PI) / 180,
      LAMP_BLOCK_BIAS: CONFIG.headlights.blockBias, LAMP_BLOCK_FADE: CONFIG.headlights.blockFade,
      MAX_LIGHTS: CONFIG.streetLights.max, LIGHT_RADIUS: CONFIG.streetLights.radius,
      LIGHT_STRENGTH: CONFIG.streetLights.strength,
      MAX_CAR_LAMPS: CONFIG.headlights.others.max, CAR_LAMP_RANGE: CONFIG.headlights.others.range,
      CAR_LAMP_STRENGTH: CONFIG.headlights.others.strength,
    };
    this.world = createProgram(gl, WORLD, defines);
    this.worldInstanced = createProgram(gl, WORLD, { ...defines, INSTANCED: 1 });
    this.current = null;
    this.wireProgram = createProgram(gl, WIRE);
    const sky = CONFIG.sky;
    this.sky = createProgram(gl, SKY, {
      SKY_RAMP: RAMP[sky.ramp], SKY_HORIZON_LEVEL: sky.horizonLevel, SKY_ZENITH_LEVEL: sky.zenithLevel,
      SKY_RANGE: sky.range, SKY_SHARPNESS: sky.sharpness,
    });
    this.present = createProgram(gl, PRESENT);
    gl.useProgram(this.present.program);
    gl.uniform1i(this.present.uniforms.u_index, 0);
    gl.uniform1i(this.present.uniforms.u_overlay, 1);
    gl.uniform1i(this.present.uniforms.u_palette, 2);
    this.target = createIndexTarget(gl, this.width, this.height);
    this.overlayTex = createOverlayTexture(gl, W, H);
    this.paletteTex = createTexture(gl, gl.RGBA8, 256, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.palette);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.emptyVao = gl.createVertexArray();
    for (const mesh of this.meshes) uploadMesh(gl, mesh);
    for (const batch of this.batches) uploadInstances(gl, batch);
    this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.query = null;
    this.queryActive = false;
    this.stats.gpuMs = -1;
  }

  /**
   * Switches the internal resolution (1 = 320x200, 2 = 640x400 enhanced).
   * @param {number} scale
   */
  setScale(scale) {
    const s = Math.max(1, Math.min(CONFIG.render.maxScale, Math.round(scale) || 1));
    if (s === this.scale) return;
    this.scale = s;
    this.width = W * s;
    this.height = H * s;
    deleteIndexTarget(this.gl, this.target);
    this.target = createIndexTarget(this.gl, this.width, this.height);
  }

  /** Frees every mesh and instance batch (scene change); programs and targets stay. */
  releaseAll() {
    for (const batch of this.batches) releaseInstances(this.gl, batch);
    for (const mesh of this.meshes) releaseMesh(this.gl, mesh);
    this.batches.length = 0;
    this.meshes.length = 0;
    this.paletteKey = 0;
  }

  /**
   * @param {import('../models/loader.js').BuiltModel} model
   * @returns {import('./mesh.js').Mesh}
   */
  addMesh(model) {
    const mesh = { model, vao: null, lineVao: null };
    uploadMesh(this.gl, mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  /**
   * Registers many copies of a mesh, drawn with one call.
   * @param {import('./mesh.js').Mesh} mesh
   * @param {Float32Array} matrices 16 floats per instance
   * @param {number} [bodyRamp] paint ramp replacing the `body` placeholder
   * @returns {import('./mesh.js').InstanceBatch}
   */
  addInstances(mesh, matrices, bodyRamp = 0) {
    const batch = { mesh, matrices, count: matrices.length / 16, vao: null, bodyRamp };
    uploadInstances(this.gl, batch);
    this.batches.push(batch);
    return batch;
  }

  /**
   * Sets the dithered distance fog used by the following frames.
   * @param {number} start distance where fog begins
   * @param {number} end distance where fog is full
   */
  setFog(start, end) {
    this.fog[0] = start;
    this.fog[1] = end;
  }

  /** Turns the distance fog off. */
  disableFog() {
    this.fog.set(FOG_OFF);
  }

  /**
   * @param {{dir: number[], ambient: number, diffuse: number}} light directional light; `dir` is
   *   the direction the light travels
   */
  setLight(light) {
    const len = hypot3(light.dir[0], light.dir[1], light.dir[2]);
    for (let i = 0; i < 3; i++) this.lightDir[i] = light.dir[i] / len;
    this.light[0] = light.ambient;
    this.light[1] = light.diffuse;
  }

  /**
   * Headlights: brightens faces inside a cone in front of the lamp (see CONFIG.headlights).
   * The reach per horizontal slice of the wedge is read from `lampReach`, which the caller may
   * fill (light blocked by obstacles); it defaults to the full range.
   * @param {boolean} on
   * @param {number} x lamp position
   * @param {number} y
   * @param {number} z
   * @param {number} dirX unit direction of the beam
   * @param {number} dirY
   * @param {number} dirZ
   */
  setLamp(on, x, y, z, dirX, dirY, dirZ) {
    this.lampOn = on;
    this.lampPos[0] = x; this.lampPos[1] = y; this.lampPos[2] = z;
    this.lampDir[0] = dirX; this.lampDir[1] = dirY; this.lampDir[2] = dirZ;
  }

  /**
   * Uploads a palette unless the one with the same key is already active.
   * @param {Uint8Array} data 256 RGBA entries
   * @param {number} key identifies the palette content
   */
  setPalette(data, key) {
    if (key === this.paletteKey) return;
    this.paletteKey = key;
    this.palette.set(data);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.palette);
  }

  // Selects the plain or instanced world program, avoiding redundant state changes.
  useWorld(instanced) {
    const p = instanced ? this.worldInstanced : this.world;
    if (this.current !== p) {
      this.gl.useProgram(p.program);
      this.current = p;
    }
    return p;
  }

  // Per-view uniforms of one world program.
  applyView(p, viewProj) {
    const gl = this.gl, u = p.uniforms, h = CONFIG.headlights, eye = this.eye;
    gl.useProgram(p.program);
    this.current = p;
    gl.uniformMatrix4fv(u.u_viewProj, false, viewProj);
    gl.uniform3fv(u.u_lightDir, this.lightDir);
    gl.uniform2fv(u.u_light, this.light);
    gl.uniform3fv(u.u_eye, eye);
    gl.uniform2fv(u.u_fog, this.fog);
    gl.uniform1ui(u.u_fogIndex, this.fogIndex);
    gl.uniform1i(u.u_night, this.night ? 1 : 0);
    gl.uniform3f(u.u_lampRel, this.lampPos[0] - eye[0], this.lampPos[1] - eye[1], this.lampPos[2] - eye[2]);
    gl.uniform3fv(u.u_lampDir, this.lampDir);
    gl.uniform1fv(u['u_lampReach[0]'], this.lampReach);
    for (let i = 0; i < this.lightCount * 3; i++) this.lightsRel[i] = this.lights[i] - eye[i % 3];
    gl.uniform3fv(u['u_lights[0]'], this.lightsRel);
    gl.uniform1i(u.u_lightCount, this.lightCount);
    for (let i = 0; i < this.carLampCount * 3; i++) this.carLampsRel[i] = this.carLamps[i] - eye[i % 3];
    gl.uniform3fv(u['u_carLampRel[0]'], this.carLampsRel);
    gl.uniform4fv(u['u_carLampDir[0]'], this.carLampDirs);
    gl.uniform1i(u.u_carLampCount, this.carLampCount);
    gl.uniform4f(u.u_beacon, this.beacon[0] - eye[0], this.beacon[1] - eye[1], this.beacon[2] - eye[2], this.beacon[3]);
    gl.uniform1ui(u.u_beaconRamp, this.beaconRamp);
    gl.uniform1f(u.u_beaconStrength, this.beaconStrength);
    gl.uniform4f(u.u_lamp, h.range, this.cosInner, this.cosOuter, this.lampOn ? h.strength : 0);
  }

  /**
   * Binds and clears the index buffer and starts the world pass.
   * @param {Float32Array} viewProj
   * @param {ArrayLike<number>} eye camera position (fog distance origin)
   */
  beginFrame(viewProj, eye) {
    const gl = this.gl;
    this.eye.set(eye);
    this.stats.tris = 0;
    this.stats.draws = 0;
    if (this.debug && this.timerExt && !this.query) {
      this.query = gl.createQuery();
      gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, this.query);
      this.queryActive = true;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearBufferuiv(gl.COLOR, 0, this.clearValue);
    gl.clearBufferfv(gl.DEPTH, 0, this.depthClear);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    if (this.wire) {
      const p = this.wireProgram;
      gl.useProgram(p.program);
      this.current = p;
      gl.uniformMatrix4fv(p.uniforms.u_viewProj, false, viewProj);
      gl.uniform1ui(p.uniforms.u_index, this.wireIndex);
    } else {
      this.applyView(this.worldInstanced, viewProj);
      this.applyView(this.world, viewProj);
    }
  }

  /**
   * Starts a second, mirrored view into a rectangle of the index buffer (rear-view mirror):
   * scissor + viewport, depth cleared inside, front-face winding flipped. The caller passes a
   * view-projection with a negated X axis and sets the (shorter) fog beforehand.
   * @param {Float32Array} viewProj
   * @param {ArrayLike<number>} eye
   * @param {number} x rectangle in overlay (320x200) pixels, y from the top
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  beginMirror(viewProj, eye, x, y, w, h) {
    const gl = this.gl, s = this.scale, bottom = (H - y - h) * s;
    this.eye.set(eye);
    gl.viewport(x * s, bottom, w * s, h * s);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x * s, bottom, w * s, h * s);
    gl.clearBufferfv(gl.DEPTH, 0, this.depthClear);
    gl.frontFace(gl.CW);
    this.applyView(this.worldInstanced, viewProj);
    this.applyView(this.world, viewProj);
  }

  /** Ends the mirror view and restores the full-buffer state. */
  endMirror() {
    const gl = this.gl;
    gl.disable(gl.SCISSOR_TEST);
    gl.frontFace(gl.CCW);
    gl.viewport(0, 0, this.width, this.height);
  }

  /**
   * Sky pass: gradient bands over the current viewport, no depth. Skipped in wireframe mode.
   * @param {Float32Array} view view matrix (its rotation gives the camera axes)
   * @param {number} tanX tangent of half the horizontal FOV (negative for a mirrored view)
   * @param {number} tanY tangent of half the vertical FOV
   */
  drawSky(view, tanX = this.tanX, tanY = this.tanY) {
    if (this.wire) return;
    const gl = this.gl, u = this.sky.uniforms;
    gl.useProgram(this.sky.program);
    this.current = this.sky;
    gl.uniform3f(u.u_right, view[0] * tanX, view[4] * tanX, view[8] * tanX);
    gl.uniform3f(u.u_up, view[1] * tanY, view[5] * tanY, view[9] * tanY);
    gl.uniform3f(u.u_fwd, -view[2], -view[6], -view[10]);
    gl.uniform1ui(u.u_fogIndex, this.fogIndex);
    gl.uniform2fv(u.u_fog, this.fog);
    gl.uniform1f(u.u_groundHeight, Math.max(this.eye[1] - this.groundY, MIN_GROUND_HEIGHT));
    gl.uniform1ui(u.u_groundIndex, this.groundIndex);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    this.stats.draws++;
  }

  /**
   * Draws a mesh at "infinite" distance: no depth test or write, no fog.
   * @param {import('./mesh.js').Mesh} mesh
   * @param {Float32Array} modelMatrix
   */
  drawBackdrop(mesh, modelMatrix) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    if (!this.wire) gl.uniform2fv(this.useWorld(false).uniforms.u_fog, FOG_OFF);
    this.drawMesh(mesh, modelMatrix, 0);
    if (!this.wire) gl.uniform2fv(this.world.uniforms.u_fog, this.fog);
    gl.enable(gl.DEPTH_TEST);
  }

  /**
   * @param {import('./mesh.js').Mesh} mesh
   * @param {Float32Array} modelMatrix
   * @param {number} bodyRamp paint ramp replacing the `body` placeholder
   */
  drawMesh(mesh, modelMatrix, bodyRamp) {
    const gl = this.gl;
    if (this.wire) {
      gl.uniformMatrix4fv(this.wireProgram.uniforms.u_model, false, modelMatrix);
      gl.bindVertexArray(mesh.lineVao);
      gl.drawArrays(gl.LINES, 0, mesh.model.lines.length / 3);
    } else {
      const u = this.useWorld(false).uniforms;
      gl.uniformMatrix4fv(u.u_model, false, modelMatrix);
      gl.uniform1ui(u.u_bodyRamp, bodyRamp);
      gl.bindVertexArray(mesh.vao);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.model.vertexCount);
      this.stats.tris += mesh.model.triCount;
    }
    this.stats.draws++;
  }

  /**
   * Draws an instance batch with one call. Not drawn in wireframe mode.
   * @param {import('./mesh.js').InstanceBatch} batch
   */
  drawInstances(batch) {
    if (this.wire) return;
    const gl = this.gl;
    gl.uniform1ui(this.useWorld(true).uniforms.u_bodyRamp, batch.bodyRamp);
    gl.bindVertexArray(batch.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, batch.mesh.model.vertexCount, batch.count);
    this.stats.tris += batch.mesh.model.triCount * batch.count;
    this.stats.draws++;
  }

  /** Uploads the overlay and presents the index buffer on screen inside a 4:3 letterbox. */
  endFrame() {
    const gl = this.gl;
    const canvas = gl.canvas;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(canvas.clientWidth * dpr), ch = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const rect = this.rect;
    rect[3] = Math.floor(Math.min(ch, cw / CONFIG.render.displayAspect));
    rect[2] = Math.floor(rect[3] * CONFIG.render.displayAspect);
    rect[0] = Math.floor((cw - rect[2]) / 2);
    rect[1] = Math.floor((ch - rect[3]) / 2);
    uploadOverlay(gl, this.overlayTex, this.overlay, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(rect[0], rect[1], rect[2], rect[3]);
    gl.useProgram(this.present.program);
    this.current = this.present;
    gl.uniform4fv(this.present.uniforms.u_rect, rect);
    gl.uniform1i(this.present.uniforms.u_rawPal, this.rawPal ? 1 : 0);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.target.tex);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.stats.draws++;
    this.pollGpuTimer();
  }

  pollGpuTimer() {
    const gl = this.gl, ext = this.timerExt;
    if (this.queryActive) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      this.queryActive = false;
    } else if (this.query && gl.getQueryParameter(this.query, gl.QUERY_RESULT_AVAILABLE)) {
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        this.stats.gpuMs = gl.getQueryParameter(this.query, gl.QUERY_RESULT) / 1e6;
      }
      gl.deleteQuery(this.query);
      this.query = null;
    }
  }

  /**
   * Reads the index buffer back (render tests only; synchronous, never call in the game loop).
   * @param {Uint8Array} out width * height indices, row 0 = bottom
   */
  readIndices(out) {
    const gl = this.gl, size = this.width * this.height * 4;
    if (!this.readBuffer || this.readBuffer.length < size) this.readBuffer = new Uint32Array(size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fbo);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA_INTEGER, gl.UNSIGNED_INT, this.readBuffer);
    for (let i = 0; i < out.length; i++) out[i] = this.readBuffer[i * 4];
  }
}
