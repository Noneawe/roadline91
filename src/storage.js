// SPDX-License-Identifier: AGPL-3.0-or-later
// Persistent settings and records in localStorage. Storage may be missing or full (private
// mode, file://): every access is guarded and the game runs without saving.

const PREFIX = 'roadline91.';

/**
 * @param {string} name
 * @param {*} fallback returned when nothing (valid) is stored
 * @returns {*}
 */
export function load(name, fallback) {
  try {
    const text = window.localStorage.getItem(PREFIX + name);
    return text ? JSON.parse(text) : fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * @param {string} name
 * @param {*} value JSON-serialisable
 * @returns {boolean} saved
 */
export function save(name, value) {
  try {
    window.localStorage.setItem(PREFIX + name, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Position a time would take in a best-first record table, or -1 if it does not make it.
 * @param {{time: number}[]} table sorted, fastest first
 * @param {number} time seconds
 * @param {number} size table length
 * @returns {number}
 */
export function recordRank(table, time, size) {
  let rank = 0;
  while (rank < table.length && table[rank].time <= time) rank++;
  return rank < size ? rank : -1;
}

/**
 * Inserts an entry and trims the table.
 * @param {{time: number}[]} table sorted, fastest first (changed in place)
 * @param {{time: number}} entry
 * @param {number} size
 * @returns {number} rank of the entry, -1 if it did not make it
 */
export function insertRecord(table, entry, size) {
  const rank = recordRank(table, entry.time, size);
  if (rank < 0) return -1;
  table.splice(rank, 0, entry);
  table.length = Math.min(table.length, size);
  return rank;
}
