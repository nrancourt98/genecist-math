const { WILD } = require("../config/symbols");

// Weighted bag for a wild's own multiplier, free-spin modes only. Verified verbatim from
// game_config.py:256 (padding_symbol_values) + game_override.py:19-26 (assign_mult_property).
const WILD_MULTIPLIER_WEIGHTS = { 2: 100, 3: 50, 4: 50, 5: 50, 10: 30, 20: 20, 50: 5 };

// Expanded into a literal repeated-element bag (total length 305) so a uniform
// rng.pickFromBag draw reproduces the same weighting as Python's random.choice over an
// equivalently-repeated list.
const WILD_MULTIPLIER_BAG = Object.entries(WILD_MULTIPLIER_WEIGHTS).flatMap(([value, weight]) =>
  Array(weight).fill(Number(value))
);

/**
 * Roll a single wild's multiplier. Always 1 in base game; weighted-random in both
 * free-spin modes (R and S).
 * @param {"base"|"R"|"S"} gameMode
 * @param {import("../rng/rngInterface")} rng
 * @returns {number}
 */
function rollWildMultiplier(gameMode, rng) {
  if (gameMode === "base") return 1;
  return rng.pickFromBag(WILD_MULTIPLIER_BAG);
}

/**
 * Assign a rolled multiplier to every "W" cell on the board that doesn't already carry
 * one. Idempotent re-application is safe (already-assigned cells are skipped) - call
 * this after drawing a board AND again after switch-symbol replacement, since
 * replacement can create new W cells mid-spin.
 * @param {{name: string, wild?: boolean, multiplier?: number}[][]} board
 * @param {"base"|"R"|"S"} gameMode
 * @param {import("../rng/rngInterface")} rng
 */
function assignWildMultipliers(board, gameMode, rng) {
  for (const column of board) {
    for (const cellObj of column) {
      if (cellObj.name === WILD && cellObj.multiplier === undefined) {
        cellObj.wild = true;
        cellObj.multiplier = rollWildMultiplier(gameMode, rng);
      }
    }
  }
}

/**
 * A winning line's multiplier = sum of every participating wild's multiplier where that
 * multiplier is > 1 (a wild with multiplier exactly 1 contributes nothing); defaults to 1
 * if no qualifying wild is on the line. Best-available reading of readme.txt - see
 * docs/game-design-spec.md "Wild multiplier".
 * @param {{reel: number, row: number}[]} positions
 * @param {{name: string, multiplier?: number}[][]} board
 * @returns {number}
 */
function computeLineMultiplier(positions, board) {
  let sum = 0;
  for (const { reel, row } of positions) {
    const cellObj = board[reel][row];
    if (cellObj.name === WILD && cellObj.multiplier > 1) {
      sum += cellObj.multiplier;
    }
  }
  return sum > 0 ? sum : 1;
}

/**
 * Convert lineEvaluator's raw candidates into full winInfo-shaped entries, applying the
 * wild-multiplier-sum on top of each line's base win. Matches the real event shape:
 * {symbol, kind, win, positions, meta: {lineIndex, multiplier, winWithoutMult, globalMult, lineMultiplier}}.
 * @param {ReturnType<import("./lineEvaluator").evaluateLines>} lineResults
 * @param {{name: string, multiplier?: number}[][]} board
 */
function buildWinEntries(lineResults, board) {
  return lineResults.map((candidate) => {
    const lineMultiplier = computeLineMultiplier(candidate.positions, board);
    const globalMult = 1; // generic engine field, no active mechanic in this game
    const multiplier = lineMultiplier * globalMult;
    const winWithoutMult = candidate.payoutCenti;
    const win = winWithoutMult * multiplier;
    return {
      symbol: candidate.symbol,
      kind: candidate.kind,
      win,
      positions: candidate.positions,
      meta: {
        lineIndex: candidate.lineIndex,
        multiplier,
        winWithoutMult,
        globalMult,
        lineMultiplier,
      },
    };
  });
}

module.exports = {
  WILD_MULTIPLIER_WEIGHTS,
  WILD_MULTIPLIER_BAG,
  rollWildMultiplier,
  assignWildMultipliers,
  computeLineMultiplier,
  buildWinEntries,
};
