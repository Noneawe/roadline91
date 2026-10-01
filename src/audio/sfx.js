// SPDX-License-Identifier: AGPL-3.0-or-later
// Sound effects driven by the race's `sound` state: FM engine from rpm and load, tyre squeal,
// police siren with Doppler shift, radar detector beeps, horn, hits and crashes, gear changes
// and rain. Continuous sounds are oscillators that run all the time; only their parameters glide.

import { CONFIG } from '../config.js';
import { playNote } from './fm.js';

/**
 * Doppler shift in cents of a source moving away at `vr` m/s (negative = approaching).
 * @param {number} vr
 * @returns {number}
 */
export function dopplerCents(vr) {
  const c = CONFIG.audio.siren.speedOfSound;
  return 1200 * Math.log2(c / (c + Math.max(-0.5 * c, Math.min(0.5 * c, vr))));
}

/**
 * Loudness (0-1) of a sound source at `dist` m with reference distance `ref`.
 * @param {number} dist
 * @param {number} ref
 * @returns {number}
 */
export function distanceGain(dist, ref) {
  return ref / (ref + Math.max(0, dist));
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * @param {AudioContext} ctx
 * @param {Object<string, GainNode>} channels music, sfx, engine, ambient
 * @param {AudioBuffer} noise
 * @param {Object<string, Object>} voices instrument bank (songs.js)
 * @returns {{update: (sound: Object|null, dt: number) => void}} `sound` is the race's sound state, or
 *   null / an object without `engine` (menus) for silence
 */
export function createSfx(ctx, channels, noise, voices) {
  const A = CONFIG.audio;

  function gain(dest, value = 0) {
    const g = ctx.createGain();
    g.gain.value = value;
    g.connect(dest);
    return g;
  }
  function filter(type, freq, q, dest) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }
  function osc(type, freq, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(dest);
    o.start();
    return o;
  }
  function noiseLoop(type, freq, q, dest) {
    const out = gain(dest), f = filter(type, freq, q, out), src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.connect(f);
    src.start();
    return { out, filter: f };
  }
  const glide = (param, value) => param.setTargetAtTime(value, ctx.currentTime, A.smooth);

  // Engine: carrier at the firing frequency, FM-modulated (more modulation under load = harsher),
  // plus a sub-octave square, through a low-pass that opens with rpm and load.
  const E = A.engine;
  const engineOut = gain(channels.engine);
  const engineFilter = filter('lowpass', 0, E.q, engineOut); // cutoff set by the first update
  const carrier = osc('sawtooth', 50, engineFilter);
  const subGain = gain(engineFilter);
  const sub = osc('square', 25, subGain);
  const modDepth = gain(carrier.frequency);
  const modulator = osc('sine', 50, modDepth);

  const squeal = noiseLoop('bandpass', A.squeal.freq, A.squeal.q, channels.sfx);
  const rain = noiseLoop('bandpass', A.rain.freq, A.rain.q, channels.ambient);

  // Siren: wailing oscillator (an LFO sweeps its pitch); Doppler goes to detune.
  const S = A.siren;
  const sirenOut = gain(channels.sfx);
  const sirenFilter = filter('lowpass', S.cutoff, 1, sirenOut);
  const siren = osc('square', S.freq, sirenFilter);
  const sweep = gain(siren.frequency, S.sweep);
  osc('sine', S.rate, sweep);

  const hornOut = gain(channels.sfx);
  const hornFilter = filter('lowpass', A.horn.cutoff, 1, hornOut);
  for (const f of A.horn.freqs) osc('square', f, hornFilter);

  let engineWave = '', gear = null, hits = 0, crashes = 0, lastHit = -1, beepPhase = 0;

  function updateEngine(sound) {
    const spec = sound.engine;
    if (spec.wave !== engineWave) carrier.type = engineWave = spec.wave;
    const firing = (sound.rpm / 60) * (spec.cylinders / 2), load = sound.load;
    glide(carrier.frequency, firing);
    glide(sub.frequency, firing / 2);
    glide(modulator.frequency, firing * spec.ratio);
    glide(modDepth.gain, firing * spec.ratio * spec.index * (E.indexIdle + E.indexLoad * load));
    glide(subGain.gain, spec.sub);
    glide(engineFilter.frequency, spec.cutoff + E.cutoffPerRpm * sound.rpm + E.cutoffLoad * load);
    glide(engineOut.gain, E.idleGain + E.loadGain * load);
  }

  function updateSiren(sound) {
    if (sound.siren < 0) {
      glide(sirenOut.gain, 0);
      return;
    }
    const near = distanceGain(sound.siren, S.ref);
    glide(sirenOut.gain, S.gain * near);
    glide(sirenFilter.frequency, S.cutoff + (S.cutoffNear - S.cutoff) * near);
    glide(siren.detune, dopplerCents(sound.sirenVr));
  }

  function events(sound, dt) {
    const now = ctx.currentTime;
    if (gear !== null && sound.gear !== gear) playNote(ctx, channels.sfx, voices.clunk, 0, now, 0.01, 1, noise);
    gear = sound.gear;
    if (sound.crashes !== crashes) {
      playNote(ctx, channels.sfx, voices.thump, 0, now, 0.05, 1, noise);
      playNote(ctx, channels.sfx, voices.crunch, 0, now, 0.2, 1, noise);
      for (let i = 0; i < A.crash.glassNotes; i++) {
        const f = A.crash.glassLow + Math.random() * (A.crash.glassHigh - A.crash.glassLow);
        playNote(ctx, channels.sfx, voices.glass, f, now + i * A.crash.glassStep, 0.02, 1, noise);
      }
      lastHit = now;
    } else if (sound.hits !== hits && now - lastHit > A.hit.cooldown) {
      const vel = clamp01((sound.hitLevel - A.hit.min) / (A.hit.full - A.hit.min)) * (1 - A.hit.floor) + A.hit.floor;
      playNote(ctx, channels.sfx, voices.thump, 0, now, 0.02, vel, noise);
      playNote(ctx, channels.sfx, voices.crunch, 0, now, 0.01, vel * A.hit.crunch, noise);
      lastHit = now;
    }
    crashes = sound.crashes;
    hits = sound.hits;
    // Detector: beeps faster as the signal grows (same rate as the cockpit LED).
    if (sound.detector > 0) {
      beepPhase += (CONFIG.detector.blinkBase + CONFIG.detector.blinkGain * sound.detector) * dt;
      if (beepPhase >= 1) {
        beepPhase %= 1;
        playNote(ctx, channels.sfx, voices.beep, A.detector.freq, now, A.detector.length, 1, noise);
      }
    } else beepPhase = 1;
  }

  return {
    update(sound, dt) {
      // Menus pass only a song: every continuous effect fades out.
      if (!sound || !sound.engine) {
        glide(engineOut.gain, 0);
        glide(squeal.out.gain, 0);
        glide(rain.out.gain, 0);
        glide(sirenOut.gain, 0);
        glide(hornOut.gain, 0);
        return;
      }
      updateEngine(sound);
      updateSiren(sound);
      const Q = A.squeal;
      const slide = sound.speed > Q.minSpeed ? clamp01((sound.slip - Q.start) / (Q.full - Q.start)) : 0;
      glide(squeal.out.gain, Q.gain * slide);
      glide(squeal.filter.frequency, Q.freq + Q.sweep * slide);
      glide(rain.out.gain, A.rain.gain * sound.rain);
      glide(hornOut.gain, sound.horn ? A.horn.gain : 0);
      events(sound, dt);
    },
  };
}
