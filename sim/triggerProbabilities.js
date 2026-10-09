'use strict';
// Exact natural Free Spins trigger probabilities, computed from the base reel strip instead of
// simulated. A base round only checks for a trigger on its final board, and that board never
// carries a switch drop or a converted scatter (S is never a switch target), so its scatter
// count has exactly the distribution of a freshly drawn board.
//
// baseplus adds one twist: its boost forces one random cell to S on the round's first board,
// which is the checked board unless a switch symbol drops on it (1 in INITIAL_DROP_CHANCE.base).

const { REELS } = require('../project/engine/config/reels');
const { getRtpProfile, profileReelName } = require('../project/engine/config/rtpProfiles');
const { MIN_SCATTERS_FOR_BONUS, MIN_SCATTERS_FOR_SUPER } = require('../project/engine/features/freeSpins');
const { SCATTER } = require('../project/engine/config/symbols');

const VISIBLE_ROWS = 5;

/** P(k scatters on a board) for k = 0..(reels * rows), each reel showing a wrapping window. */
function scatterCountDistribution(strip, rows = VISIBLE_ROWS) {
  const len = strip.length;
  let dist = [1];
  for (let reel = 0; reel < strip[0].length; reel++) {
    const perReel = new Array(rows + 1).fill(0);
    for (let start = 0; start < len; start++) {
      let count = 0;
      for (let offset = 0; offset < rows; offset++) if (strip[(start + offset) % len][reel] === SCATTER) count++;
      perReel[count] += 1 / len;
    }
    const next = new Array(dist.length + rows).fill(0);
    dist.forEach((p, i) => perReel.forEach((q, j) => { next[i + j] += p * q; }));
    dist = next;
  }
  return dist;
}

function triggerSplit(dist) {
  const sum = (from, to) => dist.slice(from, to).reduce((a, x) => a + x, 0);
  return { R: sum(MIN_SCATTERS_FOR_BONUS, MIN_SCATTERS_FOR_SUPER), S: sum(MIN_SCATTERS_FOR_SUPER, dist.length) };
}

/**
 * @param {string} rtpProfile
 * @param {"base"|"baseplus"} betMode
 * @returns {{R: number, S: number}} probability per round of a natural R-mode / S-mode trigger
 */
function naturalTriggerProbabilities(rtpProfile, betMode = 'base') {
  const profile = getRtpProfile(rtpProfile);
  const strip = REELS[profileReelName(profile, 'BR0')];
  const dist = scatterCountDistribution(strip);
  if (betMode !== 'baseplus') return triggerSplit(dist);

  const cells = strip[0].length * VISIBLE_ROWS;
  const boosted = dist.map((_, k) => dist[k] * (k / cells) + (k > 0 ? dist[k - 1] * ((cells - k + 1) / cells) : 0));
  const { hits, outOf } = profile.basePlusBoostChance;
  const boostedAndChecked = (hits / outOf) * (1 - 1 / profile.switchTables.INITIAL_DROP_CHANCE_ONE_IN.base);
  return triggerSplit(dist.map((p, k) => p + boostedAndChecked * (boosted[k] - p)));
}

module.exports = { scatterCountDistribution, naturalTriggerProbabilities };
