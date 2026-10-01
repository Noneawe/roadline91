// SPDX-License-Identifier: AGPL-3.0-or-later
// Two-operator FM voices: a modulator oscillator drives the carrier's frequency, with ADSR
// envelopes on the output level and on the modulation index. Also white-noise voices for drums
// and effects. Voices are plain data (see songs.js).

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Frequency of a note name such as 'A4', 'C#5' or 'Bb2' (A4 = 440 Hz).
 * @param {string} name
 * @returns {number} Hz
 */
export function noteFreq(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note '${name}'`);
  const midi = 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * White noise buffer, looped by noise voices and continuous effects.
 * @param {BaseAudioContext} ctx
 * @param {number} seconds
 * @returns {AudioBuffer}
 */
export function createNoise(ctx, seconds) {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// Level envelope: attack to the peak, decay to sustain, held until `dur`, then released. The
// release starts from wherever the attack/decay got to, so short notes never click.
function scheduleEnvelope(param, voice, peak, t, dur) {
  const a = voice.attack, d = voice.decay, sustain = peak * voice.sustain;
  param.setValueAtTime(0, t);
  let level;
  if (dur <= a) {
    level = (peak * dur) / a;
    param.linearRampToValueAtTime(level, t + dur);
  } else {
    param.linearRampToValueAtTime(peak, t + a);
    level = dur >= a + d ? sustain : peak + ((sustain - peak) * (dur - a)) / d;
    param.linearRampToValueAtTime(level, t + Math.min(dur, a + d));
    param.setValueAtTime(level, t + dur);
  }
  param.linearRampToValueAtTime(0, t + dur + voice.release);
  return t + dur + voice.release;
}

/**
 * Plays one note. Every node is disconnected when the note has finished.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} dest
 * @param {Object} voice FM or noise voice (songs.js)
 * @param {number} freq Hz (ignored by noise voices)
 * @param {number} t start time (ctx.currentTime base)
 * @param {number} dur seconds until the release starts
 * @param {number} vel 0-1 velocity
 * @param {AudioBuffer} noise buffer from createNoise
 */
export function playNote(ctx, dest, voice, freq, t, dur, vel, noise) {
  const out = ctx.createGain();
  const end = scheduleEnvelope(out.gain, voice, voice.gain * vel, t, dur);
  out.connect(dest);
  const nodes = [out];
  let source;
  if (voice.noise) {
    source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = voice.filter;
    filter.frequency.value = voice.cutoff;
    filter.Q.value = voice.q;
    source.connect(filter);
    filter.connect(out);
    nodes.push(filter);
    source.start(t, Math.random() * (noise.duration - 1));
  } else {
    source = ctx.createOscillator();
    source.type = voice.wave;
    const f = voice.fixed || freq;
    if (voice.pitchFrom) {
      source.frequency.setValueAtTime(f * voice.pitchFrom, t);
      source.frequency.linearRampToValueAtTime(f, t + voice.pitchTime);
    } else source.frequency.value = f;
    if (voice.index > 0 || voice.indexEnd > 0) {
      // Modulation depth in Hz = index * modulator frequency.
      const mod = ctx.createOscillator(), depth = ctx.createGain(), mf = f * voice.ratio;
      mod.frequency.value = mf;
      depth.gain.setValueAtTime(voice.index * mf, t);
      depth.gain.linearRampToValueAtTime(voice.indexEnd * mf, t + voice.indexTime);
      mod.connect(depth);
      depth.connect(source.frequency);
      mod.start(t);
      mod.stop(end);
      nodes.push(mod, depth);
    }
    source.connect(out);
    source.start(t);
  }
  source.stop(end);
  nodes.push(source);
  source.onended = () => {
    for (const node of nodes) node.disconnect();
  };
}
