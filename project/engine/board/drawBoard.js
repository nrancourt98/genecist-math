// Draws a board from a reel strip. Per reel, pick one random row-index into that reel's
// strip (independently per reel), then read the visible-row window starting there,
// wrapping around at the strip's end - standard reel-strip slot drawing.

const { SCATTER } = require("../config/symbols");

// Wild gets its wild+multiplier flags from assignWildMultipliers (engine/wins/wildMultiplier.js)
// and SW only ever appears via an explicit forced placement (never drawn from a reel
// strip), so this is the only place a natural scatter cell needs tagging to match the
// real event schema. The "scatter" flag name is directly confirmed (not just inferred) by
// a real recorded example in event_config_base.json - see
// tests/unit/eventSchemaConformance.test.js.
function buildCell(name) {
  const cellObj = { name };
  if (name === SCATTER) cellObj.scatter = true;
  return cellObj;
}

/**
 * @param {string[][]} reelStrip - rows of the strip; each row has one symbol name per reel column
 * @param {import("../rng/rngInterface")} rng
 * @param {number} [numRows] - visible rows per reel (default 5)
 * @returns {{name: string}[][]} board[reel][row]
 */
function drawBoard(reelStrip, rng, numRows = 5) {
  const numReels = reelStrip[0].length;
  const stripLen = reelStrip.length;
  const board = [];

  for (let reel = 0; reel < numReels; reel++) {
    const startRow = rng.randInt(stripLen);
    const column = [];
    for (let offset = 0; offset < numRows; offset++) {
      const stripRow = (startRow + offset) % stripLen;
      column.push(buildCell(reelStrip[stripRow][reel]));
    }
    board.push(column);
  }

  return board;
}

module.exports = { drawBoard };
