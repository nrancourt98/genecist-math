// Placeholder cosmetic win-size bucketing - no gameplay effect, used only to populate
// the `winLevel` field on setWin/freeSpinEnd events. The real bucketing logic lives in
// the missing math-SDK framework (src/...), which we don't have access to; since there
// is no frontend consuming this yet, exact tuning is low priority. See
// docs/architecture.md judgment-call log.

const LEVEL_THRESHOLDS = [
  { belowCenti: 100, level: 1 }, //  0  - 1x
  { belowCenti: 500, level: 2 }, //  1  - 5x
  { belowCenti: 1000, level: 3 }, //  5  - 10x
  { belowCenti: 2500, level: 4 }, // 10  - 25x
  { belowCenti: 5000, level: 5 }, // 25  - 50x
  { belowCenti: 10000, level: 6 }, // 50  - 100x
];

/**
 * @param {number} winCenti
 * @returns {number} 1-7 (7 = 100x bet or more)
 */
function getWinLevel(winCenti) {
  for (const { belowCenti, level } of LEVEL_THRESHOLDS) {
    if (winCenti < belowCenti) return level;
  }
  return 7;
}

module.exports = { getWinLevel };
