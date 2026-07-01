// One-shot conversion: reels/*.csv -> reels/*.json (array of rows, each row an array of
// per-reel symbol names). Run via `npm run convert-reels` (or via generateReels.js, which
// calls convertOne() directly after writing a fresh CSV). The JSON output is committed;
// the engine never parses CSV at runtime.

const fs = require("node:fs");
const path = require("node:path");

const REELS_DIR = path.join(__dirname, "reels");
const REEL_FILES = ["BR0", "FR0", "FR1"];

function convertOne(name) {
  const csvPath = path.join(REELS_DIR, `${name}.csv`);
  const jsonPath = path.join(REELS_DIR, `${name}.json`);

  const text = fs.readFileSync(csvPath, "utf8");
  const rows = text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split(","));

  fs.writeFileSync(jsonPath, JSON.stringify(rows));
  console.log(`${name}.csv -> ${name}.json (${rows.length} rows x ${rows[0].length} cols)`);
}

if (require.main === module) {
  for (const name of REEL_FILES) {
    convertOne(name);
  }
}

module.exports = { convertOne, REEL_FILES };
