// SPDX-License-Identifier: AGPL-3.0-or-later
// Music sequencer: songs compiled to sorted note events, played with lookahead scheduling on
// audioCtx.currentTime (a timer every few ms schedules the notes of the next ~100 ms).

import { CONFIG } from '../config.js';
import { noteFreq, playNote } from './fm.js';

const STEPS_PER_BEAT = 4;

/**
 * Compiles song data to note events sorted by step. All tracks must be equally long.
 * @param {Object} song see songs.js
 * @returns {{name: string, stepDur: number, length: number,
 *   events: {step: number, voice: string, freq: number, len: number}[]}} freq 0 = voice's fixed pitch
 */
export function compileSong(song) {
  const events = [];
  let length = -1;
  for (const track of song.tracks) {
    let step = 0;
    for (const name of track.order.split(' ')) {
      const pattern = track.patterns[name];
      if (pattern === undefined) throw new Error(`${song.name}: missing pattern '${name}'`);
      const tokens = pattern.trim().split(/\s+/);
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token === '.' || token === '-') continue;
        let len = 1;
        while (tokens[i + len] === '-') len++;
        events.push({ step: step + i, voice: track.voice, freq: token === 'x' ? 0 : noteFreq(token), len });
      }
      step += tokens.length;
    }
    if (length >= 0 && step !== length) throw new Error(`${song.name}: track '${track.voice}' has ${step} steps, expected ${length}`);
    length = step;
  }
  if (!events.length) throw new Error(`${song.name}: no notes`);
  events.sort((a, b) => a.step - b.step);
  return { name: song.name, stepDur: 60 / song.bpm / STEPS_PER_BEAT, length, events };
}

/**
 * @param {Object} song compiled song
 * @param {number} time audio time of the first step
 */
export function createCursor(song, time) {
  return { song, index: 0, origin: time };
}

/**
 * Emits every event that starts before `until`, looping the song. Events already in the past
 * are skipped; after a stall longer than the song, it restarts at `now`.
 * @param {{song: Object, index: number, origin: number}} cursor
 * @param {number} now current audio time
 * @param {number} until end of the scheduling window
 * @param {(event: Object, time: number) => void} emit
 */
export function advance(cursor, now, until, emit) {
  const song = cursor.song, loop = song.length * song.stepDur;
  if (cursor.origin + loop < now) {
    cursor.origin = now;
    cursor.index = 0;
  }
  for (;;) {
    if (cursor.index >= song.events.length) {
      cursor.index = 0;
      cursor.origin += loop;
    }
    const event = song.events[cursor.index];
    const t = cursor.origin + event.step * song.stepDur;
    if (t >= until) return;
    if (t >= now) emit(event, t);
    cursor.index++;
  }
}

/**
 * Plays compiled songs on `dest` with a lookahead timer.
 * @param {AudioContext} ctx
 * @param {AudioNode} dest
 * @param {AudioBuffer} noise
 * @param {Object<string, Object>} songs song data by name
 * @param {Object<string, Object>} voices
 * @returns {{play: (name: string|null) => void, stop: () => void}}
 */
export function createSequencer(ctx, dest, noise, songs, voices) {
  const A = CONFIG.audio, compiled = {};
  for (const name in songs) compiled[name] = compileSong(songs[name]);
  let current = null, cursor = null;

  function emit(event, t) {
    const voice = voices[event.voice];
    playNote(ctx, dest, voice, event.freq, t, event.len * cursor.song.stepDur, 1, noise);
  }

  const timer = setInterval(() => {
    try {
      if (cursor && ctx.state === 'running') advance(cursor, ctx.currentTime, ctx.currentTime + A.lookahead, emit);
    } catch (e) {
      cursor = null;
    }
  }, A.timerMs);

  return {
    play(name) {
      if (name === current) return;
      current = name;
      cursor = name ? createCursor(compiled[name], ctx.currentTime + A.startDelay) : null;
    },
    stop() {
      clearInterval(timer);
      cursor = null;
    },
  };
}
