const { WILD } = require("../config/symbols");
const { getPayoutCenti } = require("../config/paytable");

/**
 * Evaluate all 35 paylines against a board.
 *
 * Per payline, scanning from reel 0: the line's symbol is determined by the first
 * non-WILD cell encountered ("the anchor") - WILD substitutes for whatever the anchor
 * turns out to be, so a prefix of wilds never gets evaluated against every possible
 * symbol independently. If every cell on the line is WILD (no anchor found), the line is
 * a pure-wild line instead. The run length is then just how many cells, starting from
 * reel 0, are the anchor symbol or WILD before the first non-match.
 *
 * Verified directly against real recorded book data: a line of [W,W,W,H1,H2,L2] pays as
 * H1 4-kind (the anchor found at reel 3), never as H5 3-kind even though H5 would pay
 * more for the 3-wild prefix alone - so this is NOT "try every paying symbol and take
 * the best payout" (an earlier, incorrect implementation did that and was caught via the
 * offline simulator producing an impossible ~330x average win - see
 * docs/architecture.md's judgment-call log).
 *
 * @param {{name: string}[][]} board - board[reel][row], 6 reels x 5 rows
 * @param {number[][]} [paylines] - defaults to the 35 fixed paylines
 * @returns {Array<{lineIndex: number, symbol: string, kind: number, payoutCenti: number, positions: {reel: number, row: number}[]}>}
 */
function evaluateLines(board, paylines) {
  const lines = paylines || require("../config/paylines").PAYLINES;
  const results = [];

  lines.forEach((rowPath, idx) => {
    const candidate = evaluateLine(board, rowPath);
    if (candidate) {
      results.push({ lineIndex: idx + 1, ...candidate });
    }
  });

  return results;
}

function evaluateLine(board, rowPath) {
  const cellNames = rowPath.map((row, reel) => board[reel][row].name);

  const anchorIndex = cellNames.findIndex((name) => name !== WILD);
  const anchorSymbol = anchorIndex === -1 ? WILD : cellNames[anchorIndex];

  let run = 0;
  for (const name of cellNames) {
    if (name === anchorSymbol || name === WILD) run++;
    else break;
  }

  const payoutCenti = getPayoutCenti(run, anchorSymbol);
  if (payoutCenti == null) return null;

  return {
    symbol: anchorSymbol,
    kind: run,
    payoutCenti,
    positions: rowPath.slice(0, run).map((row, reel) => ({ reel, row })),
  };
}

module.exports = { evaluateLines };
