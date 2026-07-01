const { SCATTER } = require("../config/symbols");

// Placeholder, tunable constants - no Python or BGaming-doc precedent exists for this
// mode at all (confirmed with the designer it's an intentional gap to design fresh).
// See docs/architecture.md "baseplus mode - rationale".
const BASEPLUS_COST_MULTIPLIER = 1.25;
const BASEPLUS_BOOST_CHANCE_ONE_IN = 14;

/**
 * Once per round (the caller guards this via roundState.basePlusBoostApplied - it must
 * NOT re-apply on every switch-extended sub-spin, to keep this knob's RTP contribution
 * simple to reason about), a 1-in-14 independent chance to force-add one extra "S" onto
 * the naturally-drawn board, on top of whatever landed naturally. Must be called before
 * the classic Free Spins trigger check so it can actually influence that same spin's
 * outcome.
 * @param {{name: string}[][]} board
 * @param {import("../rng/rngInterface")} rng
 * @returns {{reel: number, row: number, symbol: string}|null}
 */
function maybeApplyBasePlusBoost(board, rng) {
  if (rng.randInt(BASEPLUS_BOOST_CHANCE_ONE_IN) !== 0) return null;

  const reel = rng.randInt(board.length);
  const row = rng.randInt(board[0].length);
  board[reel][row] = { name: SCATTER, scatter: true };
  return { reel, row, symbol: SCATTER };
}

module.exports = { BASEPLUS_COST_MULTIPLIER, BASEPLUS_BOOST_CHANCE_ONE_IN, maybeApplyBasePlusBoost };
