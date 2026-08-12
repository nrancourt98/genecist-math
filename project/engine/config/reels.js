// Loads the converted reel-strip JSON files (run `npm run gen-reels` to regenerate them
// from engine/data/reelWeights.js after tuning a weight table, or `npm run convert-reels`
// after hand-editing a reels/*.csv directly).

const BR0 = require("../data/reels/BR0.json");
const FR0 = require("../data/reels/FR0.json");
const FR1 = require("../data/reels/FR1.json");
const FR0_BUY = require("../data/reels/FR0_BUY.json");
const FR1_BUY = require("../data/reels/FR1_BUY.json");

const REELS = { BR0, FR0, FR1, FR0_BUY, FR1_BUY };

/**
 * @param {"BR0"|"FR0"|"FR1"|"FR0_BUY"|"FR1_BUY"} name
 * @returns {string[][]}
 */
function getReel(name) {
  const reel = REELS[name];
  if (!reel) throw new Error(`Unknown reel set: ${name}`);
  return reel;
}

module.exports = { REELS, getReel };
