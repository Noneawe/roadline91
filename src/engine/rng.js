// SPDX-License-Identifier: AGPL-3.0-or-later
// Seedable pseudo-random generator (mulberry32).

/**
 * @param {number} seed integer
 * @returns {() => number} function returning floats in [0, 1)
 */
export function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
