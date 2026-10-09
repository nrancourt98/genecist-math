#!/usr/bin/env node
// Offline RTP / feature-frequency simulator. Imports the engine directly (no HTTP) and plays
// rounds through resolveOneSpin until each is final. This is the project's primary
// math-documentation artifact for BGaming's submission requirements; sim/certify.js runs it
// (plus the variance-reduced base/baseplus estimate) for every mode and RTP profile at once.
//
// Usage:
//   node sim/simulate.js --mode base --n 1000000 [--seed 42] [--workers 8] [--rtp 94]
//   node sim/simulate.js --all [--n 500000] [--workers 8] [--rtp 94]
//
// --rtp selects the RTP profile (engine/config/rtpProfiles.js); defaults to the 96% profile.
// --workers defaults to every logical core but one.
//
// Rounds are split into fixed-size blocks, each with its own PRNG stream seeded from
// (seed, block), so a given --seed reproduces the same result on any machine and worker count.
// Simulation uses sim/simPrng.js (period 2^128), not the engine's 2^32-period createLocalPrng.

'use strict';

const { BET_MODE_COST_MULTIPLIER, VALID_BET_MODES, RTP_PROFILES } = require('../project/engine');
const { DEFAULT_RTP_PROFILE } = require('../project/engine/config/rtpProfiles');
const { createStatsCollector } = require('./statsCollector');
const { formatReport }         = require('./reportFormat');
const { mergeTotals }          = require('./simTasks');
const { randomSeed }           = require('./simPrng');
const { createWorkerPool, defaultWorkerCount, runBlocks } = require('./workerPool');

const DEFAULT_N_BY_MODE = { base: 100_000, baseplus: 100_000, feature_spins: 100_000, bonus: 50_000, super: 50_000 };
// Rounds per seeded block - small enough to spread evenly over workers, large enough that
// dispatch overhead is negligible.
const BLOCK_SIZE_BY_MODE = { base: 200_000, baseplus: 200_000, feature_spins: 20_000, bonus: 20_000, super: 20_000 };

/** Simulates n rounds of one bet mode on the pool; returns statsCollector.summary(). */
async function runSimulation(pool, betMode, n, seed, rtpProfile) {
  const blockSize = BLOCK_SIZE_BY_MODE[betMode];
  const merged = await runBlocks(pool, {
    count: Math.ceil(n / blockSize),
    makeTask: (block) => ({
      kind: 'rounds', betMode, rtpProfile, seed: [seed, block],
      n: Math.min(blockSize, n - block * blockSize),
    }),
    merge: mergeTotals,
  });
  const collector = createStatsCollector(BET_MODE_COST_MULTIPLIER[betMode] * 100);
  collector.mergeRawTotals(merged);
  return collector.summary();
}

async function simulateAndPrint(pool, mode, n, seed, rtpProfile) {
  console.log(`Simulating ${n.toLocaleString()} rounds of "${mode}" (RTP profile ${rtpProfile}, seed ${seed}) · ${pool.size} workers...`);
  const start = Date.now();
  const summary = await runSimulation(pool, mode, n, seed, rtpProfile);
  console.log(formatReport(mode, n, summary, Date.now() - start, pool.size, rtpProfile));
}

function parseArgs(argv) {
  const args = { mode: null, n: null, seed: undefined, all: false, workers: defaultWorkerCount(), rtp: DEFAULT_RTP_PROFILE };
  for (let i = 0; i < argv.length; i++) {
    if      (argv[i] === '--mode')    args.mode    = argv[++i];
    else if (argv[i] === '--n')       args.n       = parseInt(argv[++i], 10);
    else if (argv[i] === '--seed')    args.seed    = parseInt(argv[++i], 10);
    else if (argv[i] === '--workers') args.workers = parseInt(argv[++i], 10);
    else if (argv[i] === '--all')     args.all     = true;
    else if (argv[i] === '--rtp')     args.rtp     = argv[++i];
  }
  return args;
}

async function main() {
  const { mode, n, seed = randomSeed(), all, workers, rtp } = parseArgs(process.argv.slice(2));
  if (!RTP_PROFILES[rtp]) {
    console.error(`Unknown --rtp "${rtp}". Valid: ${Object.keys(RTP_PROFILES).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const modes = all ? VALID_BET_MODES : [mode || 'base'];
  for (const m of modes) {
    if (!VALID_BET_MODES.includes(m)) {
      console.error(`Unknown --mode "${m}". Valid: ${VALID_BET_MODES.join(', ')}`);
      process.exitCode = 1;
      return;
    }
  }

  const pool = createWorkerPool(Math.max(1, workers));
  try {
    for (const m of modes) await simulateAndPrint(pool, m, n || DEFAULT_N_BY_MODE[m], seed, rtp);
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(err.stack || err.message); process.exitCode = 1; });
}

module.exports = { runSimulation, BLOCK_SIZE_BY_MODE };
