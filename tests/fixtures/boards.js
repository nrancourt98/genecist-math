// Hand-built boards with fully-predictable wins, for deterministic line-evaluator tests.
//
// Technique: "NEUTRAL" is not a real game symbol - it never matches any paying symbol
// nor WILD (and isn't SCATTER either, which matters for tests that reuse these
// helpers from freeSpins.test.js), so any payline whose reel-0 cell is "NEUTRAL" can
// never produce a run >= 1 and therefore never wins, regardless of what's on later
// reels. Filling the whole board with "NEUTRAL" and then overriding only the specific
// cells under test acts as a precise "kill switch" for every other payline.

function cell(name) {
  return { name };
}

const NEUTRAL = cell("NEUTRAL");

function emptyBoard() {
  // 6 reels x 5 rows, every cell "NEUTRAL" (matches nothing, breaks every run at reel 0)
  return Array.from({ length: 6 }, () => Array.from({ length: 5 }, () => ({ ...NEUTRAL })));
}

function setCell(board, reel, row, name) {
  board[reel][row] = cell(name);
}

// Line 1's path is row 0 across every reel: H5,H5,H5,NEUTRAL,NEUTRAL,NEUTRAL -> simple 3-of-a-kind.
function threeKindWin() {
  const board = emptyBoard();
  setCell(board, 0, 0, "H5");
  setCell(board, 1, 0, "H5");
  setCell(board, 2, 0, "H5");
  // reels 3-5 row0 stay "NEUTRAL", breaking the run at exactly 3.
  return board;
}

// Line 1: W,H3,H3,H3,NEUTRAL,NEUTRAL -> wild extends the H3 run to 4. The bare-wild run
// alone (length 1) never reaches the >=3 threshold, so substitution is the *only* valid candidate here.
function wildSubstitutionWin() {
  const board = emptyBoard();
  setCell(board, 0, 0, "W");
  setCell(board, 1, 0, "H3");
  setCell(board, 2, 0, "H3");
  setCell(board, 3, 0, "H3");
  return board;
}

// Line 1: W,W,W,W,W,W -> no non-wild cell anywhere on the line, so there's no anchor to
// substitute for - the line resolves as a pure-wild line (6-kind W = 50x = 5000 centi).
function sixWildWin() {
  const board = emptyBoard();
  for (let reel = 0; reel < 6; reel++) {
    setCell(board, reel, 0, "W");
  }
  return board;
}

// Line 1: W,W,W,W,L2,NEUTRAL -> 4 bare wilds, then the first non-wild cell (L2) anchors
// the line. The run extends from reel 0 through every wild-or-L2 cell (5 total; reel 5's
// NEUTRAL breaks it) -> 5-kind L2 (1x = 100 centi). Verified directly against real
// recorded book data: a wild prefix is never independently compared against every other
// paying symbol - it only ever substitutes for whichever real symbol anchors the line.
function longWildPrefixAnchorsToFirstRealSymbol() {
  const board = emptyBoard();
  setCell(board, 0, 0, "W");
  setCell(board, 1, 0, "W");
  setCell(board, 2, 0, "W");
  setCell(board, 3, 0, "W");
  setCell(board, 4, 0, "L2");
  return board;
}

// No wins anywhere - confirms evaluateLines returns an empty array, not null/undefined.
function noWin() {
  return emptyBoard();
}

// Two independent simultaneous wins on different paylines (line 1 = row0, line 2 = row1),
// which share no cells, to confirm multiple results can be returned in one pass.
function twoSimultaneousWins() {
  const board = emptyBoard();
  setCell(board, 0, 0, "H4");
  setCell(board, 1, 0, "H4");
  setCell(board, 2, 0, "H4");
  setCell(board, 0, 1, "L1");
  setCell(board, 1, 1, "L1");
  setCell(board, 2, 1, "L1");
  return board;
}

module.exports = {
  cell,
  emptyBoard,
  setCell,
  threeKindWin,
  wildSubstitutionWin,
  sixWildWin,
  longWildPrefixAnchorsToFirstRealSymbol,
  noWin,
  twoSimultaneousWins,
};
