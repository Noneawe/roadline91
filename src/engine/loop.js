// SPDX-License-Identifier: AGPL-3.0-or-later
// Fixed timestep: turns variable frame time into a whole number of equal update steps.

/**
 * @param {number} step update step in seconds
 * @param {number} maxSteps steps allowed per call; the backlog is dropped when it is hit
 * @param {(dt: number) => void} update
 * @returns {(frameDt: number) => number} advances time, returns the number of steps run
 */
export function createStepper(step, maxSteps, update) {
  let accumulator = 0;
  return (frameDt) => {
    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= step && steps < maxSteps) {
      update(step);
      accumulator -= step;
      steps++;
    }
    if (steps === maxSteps) accumulator = 0;
    return steps;
  };
}
