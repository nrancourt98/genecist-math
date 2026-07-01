// Loads the converted reel-strip JSON files (run `npm run gen-reels` to regenerate them
// from engine/data/reelWeights.js after tuning a weight table, or `npm run convert-reels`
// after hand-editing a reels/*.csv directly).

const BR0 = require("../data/reels/BR0.json");
const FR0 = require("../data/reels/FR0.json");
const FR1 = require("../data/reels/FR1.json");

const REELS = { BR0, FR0, FR1 };

/**
 * @param {"BR0"|"FR0"|"FR1"} name
 * @returns {string[][]}
 */
function getReel(name) {
  const reel = REELS[name];
  if (!reel) throw new Error(`Unknown reel set: ${name}`);
  return reel;
}

module.exports = { REELS, getReel };
