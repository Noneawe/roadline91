// SPDX-License-Identifier: AGPL-3.0-or-later
// Instrument bank (FM and noise voices) and the three original songs: menu, drive, results.
// Patterns are 16th-note steps: a note name starts a note, '-' holds it, '.' is a rest and 'x'
// plays the voice's fixed pitch (drums). Each track lists its patterns in `order`.

// FM voice: carrier `wave`, modulator at `ratio` x the note, modulation index from `index` to
// `indexEnd` over `indexTime` s; level ADSR (s, s, 0-1, s) times `gain`. Optional `fixed` pitch
// (Hz) and a pitch drop from `pitchFrom` x the note over `pitchTime` s.
// Noise voice: looped white noise through a `filter` at `cutoff` Hz with resonance `q`.
export const VOICES = {
  bass: { wave: 'sine', ratio: 1, index: 4, indexEnd: 1.2, indexTime: 0.15, attack: 0.004, decay: 0.2, sustain: 0.5, release: 0.05, gain: 0.5 },
  lead: { wave: 'sine', ratio: 1, index: 2.4, indexEnd: 1.4, indexTime: 0.3, attack: 0.012, decay: 0.3, sustain: 0.65, release: 0.12, gain: 0.22 },
  arp: { wave: 'sine', ratio: 3, index: 1.6, indexEnd: 0.3, indexTime: 0.1, attack: 0.002, decay: 0.12, sustain: 0, release: 0.05, gain: 0.12 },
  piano: { wave: 'sine', ratio: 1, index: 3, indexEnd: 0.4, indexTime: 0.7, attack: 0.004, decay: 1.4, sustain: 0.15, release: 0.3, gain: 0.24 },
  bell: { wave: 'sine', ratio: 3.5, index: 2, indexEnd: 0.2, indexTime: 0.8, attack: 0.002, decay: 1.2, sustain: 0, release: 0.2, gain: 0.07 },
  brass: { wave: 'sine', ratio: 1, index: 0.8, indexEnd: 3, indexTime: 0.08, attack: 0.04, decay: 0.25, sustain: 0.7, release: 0.12, gain: 0.2 },
  kick: { wave: 'sine', fixed: 50, pitchFrom: 3.5, pitchTime: 0.05, ratio: 1, index: 0, indexEnd: 0, indexTime: 0.01, attack: 0.001, decay: 0.22, sustain: 0, release: 0.02, gain: 0.8 },
  snare: { noise: true, filter: 'bandpass', cutoff: 1800, q: 0.7, attack: 0.001, decay: 0.15, sustain: 0, release: 0.02, gain: 0.45 },
  hat: { noise: true, filter: 'highpass', cutoff: 7000, q: 0.7, attack: 0.001, decay: 0.04, sustain: 0, release: 0.01, gain: 0.2 },
  // Effects.
  beep: { wave: 'square', ratio: 1, index: 0, indexEnd: 0, indexTime: 0.01, attack: 0.002, decay: 0.01, sustain: 0.8, release: 0.01, gain: 0.12 },
  clunk: { noise: true, filter: 'lowpass', cutoff: 900, q: 2, attack: 0.001, decay: 0.05, sustain: 0, release: 0.01, gain: 0.5 },
  thump: { wave: 'sine', fixed: 70, pitchFrom: 2, pitchTime: 0.08, ratio: 1.4, index: 6, indexEnd: 0, indexTime: 0.15, attack: 0.001, decay: 0.3, sustain: 0, release: 0.05, gain: 0.9 },
  crunch: { noise: true, filter: 'lowpass', cutoff: 2500, q: 1, attack: 0.002, decay: 0.5, sustain: 0, release: 0.1, gain: 0.7 },
  glass: { wave: 'sine', ratio: 3.7, index: 3, indexEnd: 0.5, indexTime: 0.2, attack: 0.001, decay: 0.35, sustain: 0, release: 0.05, gain: 0.12 },
};

// 16-step arpeggio over a 4-note chord: up, down, up.
function arp(chord) {
  const n = chord.split(' ');
  return [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 1].map((i) => n[i]).join(' ');
}

const REST = '. . . . . . . . . . . . . . . .';

const DRIVE = {
  name: 'drive', bpm: 140,
  tracks: [
    {
      voice: 'bass',
      patterns: {
        a: 'A1 . A2 . A1 . A2 . A1 . A2 . A1 . G2 .',
        f: 'F1 . F2 . F1 . F2 . F1 . F2 . F1 . C2 .',
        g: 'G1 . G2 . G1 . G2 . G1 . G2 . G1 . D2 .',
        e: 'E1 . E2 . E1 . E2 . E1 . E2 . G1 . B1 .',
        c: 'C2 . C3 . C2 . C3 . C2 . C3 . C2 . G2 .',
        d: 'D2 . D3 . D2 . D3 . D2 . D3 . D2 . A2 .',
      },
      order: 'a a a f g e c g d e a f g e c g d e',
    },
    {
      voice: 'arp',
      patterns: {
        a: arp('A3 C4 E4 A4'), f: arp('F3 A3 C4 F4'), g: arp('G3 B3 D4 G4'),
        e: arp('E3 G#3 B3 E4'), c: arp('C4 E4 G4 C5'), d: arp('D4 F4 A4 D5'),
      },
      order: 'a a a f g e c g d e a f g e c g d e',
    },
    {
      voice: 'lead',
      patterns: {
        r: REST,
        m1: 'A4 - - C5 - - E5 - D5 - C5 - B4 - A4 -',
        m2: 'C5 - - - A4 - F4 - G4 - A4 - C5 - - -',
        m3: 'B4 - - D5 - - G5 - F5 - E5 - D5 - B4 -',
        m4: 'E5 - - - - - - - G#4 - B4 - E5 - D5 -',
        m5: 'E5 - G5 - E5 - C5 - D5 - E5 - G5 - - -',
        m6: 'D5 - - - B4 - G4 - A4 - B4 - D5 - - -',
        m7: 'F5 - E5 - D5 - A4 - F5 - E5 - D5 - C5 -',
        m8: 'B4 - - - G#4 - - - E4 - - - . . . .',
      },
      order: 'r r m1 m2 m3 m4 m5 m6 m7 m8 m1 m2 m3 m4 m5 m6 m7 m8',
    },
    {
      voice: 'kick',
      patterns: { k: 'x . . . x . . . x . . . x . x .' },
      order: 'k k k k k k k k k k k k k k k k k k',
    },
    {
      voice: 'snare',
      patterns: { s: '. . . . x . . . . . . . x . . .', f: 'x . . . x . x . x x . x x x x x' },
      order: 's s s s s s s s s f s s s s s s s f',
    },
    {
      voice: 'hat',
      patterns: { h: '. . x . . . x . . . x . . . x x' },
      order: 'h h h h h h h h h h h h h h h h h h',
    },
  ],
};

const MENU = {
  name: 'menu', bpm: 100,
  tracks: [
    {
      voice: 'bass',
      patterns: {
        d: 'D2 - - - - - - - A2 - - - - - - -',
        b: 'B1 - - - - - - - F#2 - - - - - - -',
        g: 'G1 - - - - - - - D2 - - - - - - -',
        a: 'A1 - - - - - - - E2 - - - G2 - - -',
      },
      order: 'd b g a d b g a',
    },
    {
      voice: 'arp',
      patterns: { d: arp('D4 F#4 A4 C#5'), b: arp('B3 D4 F#4 A4'), g: arp('G3 B3 D4 F#4'), a: arp('A3 C#4 E4 G4') },
      order: 'd b g a d b g a',
    },
    {
      voice: 'piano',
      patterns: {
        r: REST,
        m1: 'F#5 - - - E5 - D5 - A4 - - - - - - -',
        m2: 'B4 - - - C#5 - D5 - F#5 - - - E5 - - -',
        m3: 'D5 - - - B4 - G4 - B4 - D5 - G5 - - -',
        m4: 'F#5 - E5 - C#5 - - - A4 - - - . . . .',
      },
      order: 'r r r r m1 m2 m3 m4',
    },
    {
      voice: 'bell',
      patterns: { r: REST, b: 'A5 - - - - - - - . . . . . . . .', e: 'C#6 - - - - - - - . . . . . . . .' },
      order: 'b r e r r r r r',
    },
    {
      voice: 'kick',
      patterns: { r: REST, k: 'x . . . . . . . x . . x . . . .' },
      order: 'r r k k k k k k',
    },
    {
      voice: 'hat',
      patterns: { r: REST, h: '. . x . . . x . . . x . . . x .' },
      order: 'r r h h h h h h',
    },
  ],
};

const RESULTS = {
  name: 'results', bpm: 120,
  tracks: [
    {
      voice: 'bass',
      patterns: {
        c: 'C2 . C2 . G2 . C2 . C2 . C2 . G2 . E2 .',
        a: 'A1 . A1 . E2 . A1 . A1 . A1 . E2 . C2 .',
        f: 'F1 . F1 . C2 . F1 . F1 . F1 . C2 . A1 .',
        g: 'G1 . G1 . D2 . G1 . G1 . G1 . D2 . B1 .',
      },
      order: 'c a f g f g c c',
    },
    {
      voice: 'arp',
      patterns: { c: arp('C4 E4 G4 C5'), a: arp('A3 C4 E4 A4'), f: arp('F3 A3 C4 F4'), g: arp('G3 B3 D4 G4') },
      order: 'c a f g f g c c',
    },
    {
      voice: 'brass',
      patterns: {
        m1: 'C5 - E5 - G5 - - - E5 - G5 - C6 - - -',
        m2: 'B5 - A5 - - - E5 - A5 - - - . . . .',
        m3: 'A5 - G5 - F5 - C5 - F5 - G5 - A5 - - -',
        m4: 'G5 - - - D5 - B4 - D5 - G5 - - - . .',
        m5: 'A5 - - - F5 - A5 - C6 - - - A5 - - -',
        m6: 'B5 - - - G5 - B5 - D6 - - - B5 - - -',
        m7: 'C6 - - - - - - - - - - - - - - -',
        m8: '. . . . . . . . G4 - C5 - E5 - G5 -',
      },
      order: 'm1 m2 m3 m4 m5 m6 m7 m8',
    },
    {
      voice: 'kick',
      patterns: { k: 'x . . . x . . . x . . . x . . .' },
      order: 'k k k k k k k k',
    },
    {
      voice: 'snare',
      patterns: { s: '. . . . x . . . . . . . x . . .', f: '. . . . x . . . x . x . x x x x' },
      order: 's s s s s s s f',
    },
    {
      voice: 'hat',
      patterns: { h: 'x . x . x . x . x . x . x . x .' },
      order: 'h h h h h h h h',
    },
  ],
};

export const SONGS = { menu: MENU, drive: DRIVE, results: RESULTS };
