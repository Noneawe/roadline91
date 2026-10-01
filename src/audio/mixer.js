// SPDX-License-Identifier: AGPL-3.0-or-later
// Audio mixer: one AudioContext created on the first user interaction, channel gains (music,
// sfx, engine, ambient) under a master gain, mute. Every call is guarded: an audio error turns
// audio off and never reaches the game loop.

import { CONFIG } from '../config.js';
import { createNoise } from './fm.js';
import { createSequencer } from './sequencer.js';
import { createSfx } from './sfx.js';
import { SONGS, VOICES } from './songs.js';

const CHANNELS = ['music', 'sfx', 'engine', 'ambient'];

/**
 * @param {boolean} muted start muted (?mute=1)
 * @returns {{start: () => void, update: (sound: Object|null, dt: number) => void,
 *   setHidden: (hidden: boolean) => void, toggleMute: () => void,
 *   setVolumes: (master: number, music: number, effects: number) => void}}
 */
export function createAudio(muted) {
  const A = CONFIG.audio;
  let ctx = null, master = null, sequencer = null, sfx = null, failed = false, hidden = false;
  let channels = null;
  // Player volume levels 0-1 on top of CONFIG.audio.volume: master, music, effects (sfx, engine, ambient).
  const level = { master: 1, music: 1, effects: 1 };
  const masterGain = () => (muted ? 0 : A.volume.master * level.master);
  const channelGain = (name) => A.volume[name] * (name === 'music' ? level.music : level.effects);

  function fail() {
    failed = true;
    try {
      if (sequencer) sequencer.stop();
      if (ctx) ctx.close().catch(() => {});
    } catch (e) {
      // already broken; nothing left to clean up
    }
  }

  function create() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) {
      failed = true;
      return;
    }
    ctx = new Context();
    master = ctx.createGain();
    master.gain.value = masterGain();
    master.connect(ctx.destination);
    channels = {};
    for (const name of CHANNELS) {
      channels[name] = ctx.createGain();
      channels[name].gain.value = channelGain(name);
      channels[name].connect(master);
    }
    const noise = createNoise(ctx, A.noiseSeconds);
    sequencer = createSequencer(ctx, channels.music, noise, SONGS, VOICES);
    sfx = createSfx(ctx, channels, noise, VOICES);
  }

  return {
    // Call from a user gesture (key, pointer, touch): browsers only start audio after one.
    start() {
      if (failed || hidden) return;
      try {
        if (!ctx) create();
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      } catch (e) {
        fail();
      }
    },
    update(sound, dt) {
      if (failed || !sfx) return;
      try {
        sfx.update(sound, dt);
        sequencer.play(sound ? sound.music : null);
      } catch (e) {
        fail();
      }
    },
    // Hidden tab: the context is suspended so music and engine stop together.
    setHidden(value) {
      hidden = value;
      if (failed || !ctx) return;
      try {
        (value ? ctx.suspend() : ctx.resume()).catch(() => {});
      } catch (e) {
        fail();
      }
    },
    toggleMute() {
      muted = !muted;
      if (failed || !master) return;
      try {
        master.gain.setTargetAtTime(masterGain(), ctx.currentTime, A.smooth);
      } catch (e) {
        fail();
      }
    },
    /**
     * Player volume levels, each 0-1 (kept until the context exists).
     * @param {number} masterLevel
     * @param {number} music
     * @param {number} effects sound effects, engine and ambience
     */
    setVolumes(masterLevel, music, effects) {
      level.master = masterLevel;
      level.music = music;
      level.effects = effects;
      if (failed || !master) return;
      try {
        master.gain.setTargetAtTime(masterGain(), ctx.currentTime, A.smooth);
        for (const name of CHANNELS) channels[name].gain.setTargetAtTime(channelGain(name), ctx.currentTime, A.smooth);
      } catch (e) {
        fail();
      }
    },
  };
}
