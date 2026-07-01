const { SCATTER } = require("../config/symbols");
const { drawBoard } = require("../board/drawBoard");

// game_executables.py hardcodes tot_fs = 10 / += 4 unconditionally once a threshold is
// met - the exact scatter count never changes the award beyond which threshold it
// crosses (3 vs 4+).
const INITIAL_FREE_SPINS = 10;
const RETRIGGER_FREE_SPINS = 4;
const MIN_SCATTERS_FOR_BONUS = 3;
const MIN_SCATTERS_FOR_SUPER = 4;

// Arbitrary, cosmetic only - buildSyntheticTriggerBoard's board is never evaluated for
// wins, so the specific filler symbol used to de-scatter any naturally-landed "S" doesn't
// matter mathematically.
const SYNTHETIC_FILLER_SYMBOL = "L1";

/** @returns {{reel: number, row: number}[]} every board position whose cell matches symbolName */
function findSymbolPositions(board, symbolName) {
  const positions = [];
  for (let reel = 0; reel < board.length; reel++) {
    const column = board[reel];
    for (let row = 0; row < column.length; row++) {
      if (column[row].name === symbolName) {
        positions.push({ reel, row });
      }
    }
  }
  return positions;
}

/**
 * Base-game (or baseplus) trigger check: a single scatter symbol "S", tiered purely by
 * how many land on one board. 4+ goes straight to Super Free Spins (S mode), bypassing R
 * entirely; exactly 3 triggers regular Free Spins (R mode). Fully independent of Switch
 * Spins - see docs/game-design-spec.md "Classic Free Spins feature".
 * @param {{name: string}[][]} board
 * @returns {{mode: "R"|"S", positions: {reel:number, row:number}[]}|null}
 */
function checkBaseTrigger(board) {
  const positions = findSymbolPositions(board, SCATTER);
  if (positions.length >= MIN_SCATTERS_FOR_SUPER) {
    return { mode: "S", positions };
  }
  if (positions.length >= MIN_SCATTERS_FOR_BONUS) {
    return { mode: "R", positions };
  }
  return null;
}

/**
 * Continuation check for a board drawn DURING an active free-spin feature. R-mode checks
 * for an upgrade (4+ S) first, then a same-tier retrigger (3 S). S-mode only ever has the
 * retrigger path (3+ S) - it's already the top tier, no further upgrade exists.
 * @param {{mode: "R"|"S"}} freeSpinState
 * @param {{name: string}[][]} board
 * @returns {{type: "upgrade", positions: object[]} | {type: "retrigger", fsAdded: number, positions: object[]} | null}
 */
function checkFreeSpinContinuation(freeSpinState, board) {
  const positions = findSymbolPositions(board, SCATTER);

  if (freeSpinState.mode === "R") {
    if (positions.length >= MIN_SCATTERS_FOR_SUPER) {
      return { type: "upgrade", positions };
    }
    if (positions.length >= MIN_SCATTERS_FOR_BONUS) {
      return { type: "retrigger", fsAdded: RETRIGGER_FREE_SPINS, positions };
    }
    return null;
  }

  // S-mode: already the top tier - any 3+ is just a retrigger, never another upgrade.
  if (positions.length >= MIN_SCATTERS_FOR_BONUS) {
    return { type: "retrigger", fsAdded: RETRIGGER_FREE_SPINS, positions };
  }
  return null;
}

/**
 * @param {"R"|"S"} mode
 * @returns {{mode: "R"|"S", fs: number, totFs: number, reelSet: "FR0"|"FR1"}}
 */
function createInitialFreeSpinState(mode) {
  return { mode, fs: 0, totFs: INITIAL_FREE_SPINS, reelSet: mode === "S" ? "FR1" : "FR0" };
}

/**
 * Builds the board for a bought feature's synthetic "triggering" reveal - purely
 * cosmetic (see docs/architecture.md's judgment-call log, "buy-feature triggering
 * board"), never evaluated for wins, so the buy price/feature math stay exactly as priced
 * regardless of what lands here. Draws a natural board from the given reel strip for
 * realistic-looking filler, clears any scatters that happened to land naturally, then
 * forces exactly the minimum scatter count for the target mode onto random distinct
 * cells, so the displayed trigger always matches the mode actually being bought (3 for R,
 * 4 for S - never more, so it reads as the minimum qualifying trigger, not a retrigger).
 * @param {"R"|"S"} mode
 * @param {string[][]} reelStrip
 * @param {import("../rng/rngInterface")} rng
 * @returns {{name: string}[][]}
 */
function buildSyntheticTriggerBoard(mode, reelStrip, rng) {
  const board = drawBoard(reelStrip, rng);
  const requiredScatters = mode === "S" ? MIN_SCATTERS_FOR_SUPER : MIN_SCATTERS_FOR_BONUS;

  const allPositions = [];
  for (let reel = 0; reel < board.length; reel++) {
    for (let row = 0; row < board[reel].length; row++) {
      if (board[reel][row].name === SCATTER) board[reel][row] = { name: SYNTHETIC_FILLER_SYMBOL };
      allPositions.push({ reel, row });
    }
  }

  const chosen = rng.sampleWithoutReplacement(allPositions, requiredScatters);
  for (const { reel, row } of chosen) {
    board[reel][row] = { name: SCATTER, scatter: true };
  }

  return board;
}

module.exports = {
  INITIAL_FREE_SPINS,
  RETRIGGER_FREE_SPINS,
  MIN_SCATTERS_FOR_BONUS,
  MIN_SCATTERS_FOR_SUPER,
  findSymbolPositions,
  checkBaseTrigger,
  checkFreeSpinContinuation,
  createInitialFreeSpinState,
  buildSyntheticTriggerBoard,
};
