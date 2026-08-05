// Builds fresh reel-strip CSVs from the weight tables in reelWeights.js, then converts
// them to JSON via convertReels.js's existing convertOne(). Run via `npm run gen-reels`.
//
// BR0 uses per-reel cluster configs (see reelWeights.js header). Each reel column is
// generated independently via generateClusteredColumn(), then assembled into row-major
// form. FR0 and FR1 use flat random strips (no clustering).

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

// Minimum S cells guaranteed per reel column. With this seed (20260619) the column-by-
// column RNG consumption pattern lands some reels well below the expected count. Injecting
// S at random positions brings each column up to the floor without changing cluster runs in
// aggregate (S breaks individual cluster slots occasionally, which is fine — S is a scatter
// and players expect it to appear anywhere). Target count keeps total E[S visible per board]
// near the original ~0.43 (6 reels × 5 rows × 12/1000 = 0.36; natural counts typically add
// another 2–6 on luckier reels, pushing the average closer to original).
const TARGET_S_PER_REEL = 10;

/**
 * Generates one reel's 1000-row column using alternating cluster / random sections.
 * Cluster symbols (H1-H5, L1-L5) fill clusterMinLen–clusterMaxLen consecutive rows.
 * W and S appear only as single random cells (not in clusterWeights).
 * Scatter count is guaranteed to be at least TARGET_S_PER_REEL via post-injection.
 */
function generateClusteredColumn(config, rng) {
  const { randomWeights, clusterProbability, clusterWeights, clusterMinLen, clusterMaxLen } = config;
  const randomPool  = buildWeightedPool(randomWeights);
  const clusterPool = buildWeightedPool(clusterWeights);
  const col = [];

  // clusterProbability is a per-decision probability. At each position we decide:
  //   - with probability p: start a cluster of length [min, max] and advance by that length
  //   - with probability 1-p: place one random cell and advance by 1
  // The integer threshold scales p to match rng.randInt(1000)'s [0, 999] output.
  const threshold = Math.round(clusterProbability * 1000);

  while (col.length < STRIP_ROWS) {
    const remaining = STRIP_ROWS - col.length;
    if (rng.randInt(1000) < threshold) {
      const sym = clusterPool[rng.randInt(clusterPool.length)];
      const len = clusterMinLen + rng.randInt(clusterMaxLen - clusterMinLen + 1);
      for (let i = 0; i < Math.min(len, remaining); i++) col.push(sym);
    } else {
      col.push(randomPool[rng.randInt(randomPool.length)]);
    }
  }

  // Guarantee minimum scatter count. Injecting S into cluster runs is acceptable — the
  // visual cluster is mostly preserved and S is expected to appear anywhere on the board.
  let sCount = col.filter((s) => s === "S").length;
  while (sCount < TARGET_S_PER_REEL) {
    const pos = rng.randInt(STRIP_ROWS);
    if (col[pos] !== "S") {
      col[pos] = "S";
      sCount++;
    }
  }

  return col; // length === STRIP_ROWS
}

/**
 * Generates a full strip from an array of NUM_REELS cluster configs.
 * Returns STRIP_ROWS rows × NUM_REELS columns (row-major, matching the existing JSON format).
 */
function generateClusteredStrip(reelConfigs, rng) {
  const cols = reelConfigs.map((cfg) => generateClusteredColumn(cfg, rng));
  return Array.from({ length: STRIP_ROWS }, (_, row) => cols.map((col) => col[row]));
}

/**
 * Generates a flat-random strip (all reels share one pool, or each reel has its own pool).
 * @param {object|object[]} weights - single {symbol:weight} or array of NUM_REELS objects
 * @returns {string[][]} STRIP_ROWS rows × NUM_REELS columns
 */
function generateStrip(weights, rng) {
  const pools = Array.isArray(weights)
    ? weights.map(buildWeightedPool)
    : Array.from({ length: NUM_REELS }, () => buildWeightedPool(weights));
  return Array.from({ length: STRIP_ROWS }, () =>
    pools.map((pool) => pool[rng.randInt(pool.length)])
  );
}

function writeStripCsv(name, rows) {
  const csvPath = path.join(REELS_DIR, `${name}.csv`);
  fs.writeFileSync(csvPath, rows.map((row) => row.join(",")).join("\n"));
}

function generateAndConvert(name, weights, rng) {
  const isCluster = Array.isArray(weights) && weights[0]?.clusterProbability !== undefined;
  const rows = isCluster ? generateClusteredStrip(weights, rng) : generateStrip(weights, rng);
  writeStripCsv(name, rows);
  convertOne(name);
}

if (require.main === module) {
  // Each strip gets its own independent RNG so FR0/FR1 are stable regardless of how
  // many RNG calls BR0 cluster generation consumes (which varies with cluster decisions).
  generateAndConvert("BR0", BR0_WEIGHTS, createLocalPrng(20260619));
  generateAndConvert("FR0", FR0_WEIGHTS, createLocalPrng(20261001));
  generateAndConvert("FR1", FR1_WEIGHTS, createLocalPrng(20261002));
}

module.exports = { generateStrip, generateClusteredStrip, generateAndConvert };
