// Builds fresh reel-strip CSVs from the weight tables in reelWeights.js, then converts
// them to JSON via convertReels.js's existing convertOne(). Run via `npm run gen-reels`.
//
// Replaces the original Python prototype's reel strips entirely - see reelWeights.js's
// header comment for why. Only BR0/FR0/FR1 are generated: BR1 and FRWCAP from the
// original prototype are both unused by this engine (BASE_REEL_BY_MODE's "super" entry
// is unreachable - buy-mode rounds skip the base phase entirely - and no call site for
// FRWCAP exists; see docs/architecture.md's judgment-call log) and have been removed.

const fs = require("node:fs");
const path = require("node:path");
const { createLocalPrng } = require("../rng/localPrng");
const { convertOne } = require("./convertReels");
const { BR0_WEIGHTS, FR0_WEIGHTS, FR1_WEIGHTS } = require("./reelWeights");

const REELS_DIR = path.join(__dirname, "reels");
const NUM_REELS = 6;
const STRIP_ROWS = 1000;

function buildWeightedPool(weights) {
  const pool = [];
  for (const [symbol, weight] of Object.entries(weights)) {
    for (let i = 0; i < weight; i++) pool.push(symbol);
  }
  return pool;
}

/**
 * @param {object|object[]} weights - either a single {symbol:weight} object (all reels share
 *   one pool) or an array of NUM_REELS {symbol:weight} objects (per-reel pools). The
 *   per-reel form lets left reels be tuned independently of right reels - useful for
 *   controlling 3OAK frequency since paylines always start from reel 0.
 * @returns {string[][]} STRIP_ROWS rows x NUM_REELS columns
 */
function generateStrip(weights, rng) {
  const pools = Array.isArray(weights)
    ? weights.map(buildWeightedPool)
    : Array.from({ length: NUM_REELS }, () => buildWeightedPool(weights));
  const rows = [];
  for (let row = 0; row < STRIP_ROWS; row++) {
    const cells = [];
    for (let reel = 0; reel < NUM_REELS; reel++) {
      cells.push(pools[reel][rng.randInt(pools[reel].length)]);
    }
    rows.push(cells);
  }
  return rows;
}

function writeStripCsv(name, rows) {
  const csvPath = path.join(REELS_DIR, `${name}.csv`);
  fs.writeFileSync(csvPath, rows.map((row) => row.join(",")).join("\n"));
}

function generateAndConvert(name, weights, rng) {
  const rows = generateStrip(weights, rng);
  writeStripCsv(name, rows);
  convertOne(name);
}

if (require.main === module) {
  const rng = createLocalPrng(20260619); // fixed seed: regenerating without changing weights reproduces the same strip
  generateAndConvert("BR0", BR0_WEIGHTS, rng);
  generateAndConvert("FR0", FR0_WEIGHTS, rng);
  generateAndConvert("FR1", FR1_WEIGHTS, rng);
}

module.exports = { generateStrip, generateAndConvert };
