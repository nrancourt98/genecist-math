#!/usr/bin/env node
// Offline RTP / feature-frequency simulator. Imports the engine directly (no HTTP) and
// loops resolveOneSpin synchronously with the local PRNG until a round is final. This is
// the project's primary math-documentation artifact for BGaming's submission requirements.
//
// Usage:
//   node sim/simulate.js --mode base --n 1000000 [--seed 42] [--workers 4]
//   node sim/simulate.js --all [--n 500000] [--workers 8]
//
// --workers uses Node.js worker_threads to parallelize across CPU cores; each worker
// gets its own seeded PRNG (seed + workerIndex * largePrime) for uncorrelated results.
// Without --workers the run is single-threaded (safe for any seed, including --seed).

'use strict';

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const { resolveOneSpin, createInitialRoundState, createLocalPrng, BET_MODE_COST_MULTIPLIER, VALID_BET_MODES } =
  require('../project/engine');
const { createStatsCollector } = require('./statsCollector');
const { formatReport }         = require('./reportFormat');

const ROUND_STEP_GUARD    = 5000;
const PLACEHOLDER_BET     = 100;
const DEFAULT_N_BY_MODE   = { base: 100_000, baseplus: 100_000, bonus: 50_000, super: 50_000 };
// Large prime used to spread seeds across workers while keeping runs reproducible.
const WORKER_SEED_STRIDE  = 1_000_003;

// ─── Per-round simulation ─────────────────────────────────────────────────────

function simulateOneRound(betMode, rng) {
  let roundState     = createInitialRoundState(betMode, PLACEHOLDER_BET);
  let prevSwitchSpins = roundState.switch.spins;

  let switchSequenceCount = 0;
  let switchSpinsSteps    = 0;
  let switchWildCount     = 0;
  let switchHighestCount  = 0;
  let maxSwitchSymbols    = 0;

  let fsTriggerMode    = null;
  let hadFreeSpins     = betMode === 'bonus' || betMode === 'super'; // always true for buys
  let hadFsRetrigger   = false;
  let hadFsUpgrade     = false;
  let hitWincap        = false;

  for (let step = 0; step < ROUND_STEP_GUARD; step++) {
    const wasBuyTriggerStep = roundState.phase === 'buyTrigger';
    const { events, roundState: next, isRoundFinal } = resolveOneSpin(roundState, rng);

    // Switch Spins: 0 → nonzero transition = fresh sequence started
    if (prevSwitchSpins === 0 && next.switch.spins > 0) {
      switchSequenceCount++;
      if (next.switch.wild) switchWildCount++;
      else                   switchHighestCount++;
    }
    if (events.some((e) => e.type === 'updateSwitchSpins')) switchSpinsSteps++;
    if (next.switch.symbols.length > maxSwitchSymbols) maxSwitchSymbols = next.switch.symbols.length;

    // Free Spins: natural first trigger (buy trigger step excluded from this stat)
    if (fsTriggerMode === null && !wasBuyTriggerStep && events.some((e) => e.type === 'freeSpinTrigger')) {
      fsTriggerMode = next.freeSpin ? next.freeSpin.mode : null;
    }

    // Free Spins: detect retrigger (+4 spins, same mode) and upgrade (R → S)
    if (events.some((e) => e.type === 'freeSpinRetrigger')) hadFsRetrigger = true;
    if (roundState.freeSpin?.mode === 'R' && next.freeSpin?.mode === 'S') hadFsUpgrade = true;

    // Track whether any FS phase was visited (base/baseplus only — buys initialised above)
    if (!hadFreeSpins && next.freeSpin !== null) hadFreeSpins = true;

    if (events.some((e) => e.type === 'wincap')) hitWincap = true;

    prevSwitchSpins = next.switch.spins;
    roundState = next;

    if (isRoundFinal) {
      // enteredRMode: bonus always enters R; base/baseplus enter R when fsTriggerMode==="R"
      const enteredRMode = betMode === 'bonus' || fsTriggerMode === 'R';
      return {
        winCenti:          roundState.basegameWinsCenti + roundState.freegameWinsCenti,
        basegameWinCenti:  roundState.basegameWinsCenti,
        freegameWinCenti:  roundState.freegameWinsCenti,
        switchSequenceCount,
        switchSpinsSteps,
        switchWildCount,
        switchHighestCount,
        maxSwitchSymbols,
        fsTriggerMode,
        hadFreeSpins,
        enteredRMode,
        hadFsRetrigger,
        hadFsUpgrade,
        hitWincap,
      };
    }
  }

  throw new Error(`simulateOneRound: round did not finish in ${ROUND_STEP_GUARD} steps (mode=${betMode})`);
}

// ─── Single-threaded run ──────────────────────────────────────────────────────

function runSimulation(betMode, n, seed) {
  const rng       = createLocalPrng(seed);
  const costCenti = BET_MODE_COST_MULTIPLIER[betMode] * 100;
  const collector = createStatsCollector(costCenti);
  for (let i = 0; i < n; i++) collector.recordRound(simulateOneRound(betMode, rng));
  return collector.summary();
}

// ─── Parallel run (worker_threads) ───────────────────────────────────────────

function runSimulationParallel(betMode, n, numWorkers, seed) {
  return new Promise((resolve, reject) => {
    const costCenti  = BET_MODE_COST_MULTIPLIER[betMode] * 100;
    const collector  = createStatsCollector(costCenti);
    const chunkSize  = Math.ceil(n / numWorkers);
    let completed    = 0;
    let actualWorkers = 0;

    for (let i = 0; i < numWorkers; i++) {
      const workerN = Math.min(chunkSize, n - i * chunkSize);
      if (workerN <= 0) break;
      actualWorkers++;

      // Each worker gets a distinct seed so their PRNG streams don't correlate.
      const workerSeed = seed !== undefined ? seed + i * WORKER_SEED_STRIDE : undefined;

      const worker = new Worker(__filename, { workerData: { betMode, n: workerN, seed: workerSeed } });
      worker.on('message', (rawTotals) => {
        collector.mergeRawTotals(rawTotals);
        if (++completed === actualWorkers) resolve(collector.summary());
      });
      worker.on('error', reject);
    }

    if (actualWorkers === 0) reject(new Error('No rounds to simulate'));
  });
}

// ─── Reporting ────────────────────────────────────────────────────────────────

async function simulateAndPrint(mode, n, seed, numWorkers) {
  const parallel = numWorkers > 1;
  const label    = parallel ? ` · ${numWorkers} workers` : '';
  console.log(`Simulating ${n.toLocaleString()} rounds of "${mode}"${label}...`);
  const start = Date.now();
  const summary = parallel
    ? await runSimulationParallel(mode, n, numWorkers, seed)
    : runSimulation(mode, n, seed);
  console.log(formatReport(mode, n, summary, Date.now() - start, numWorkers));
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { mode: null, n: null, seed: undefined, all: false, workers: 1 };
  for (let i = 0; i < argv.length; i++) {
    if      (argv[i] === '--mode')    args.mode    = argv[++i];
    else if (argv[i] === '--n')       args.n       = parseInt(argv[++i], 10);
    else if (argv[i] === '--seed')    args.seed    = parseInt(argv[++i], 10);
    else if (argv[i] === '--workers') args.workers = parseInt(argv[++i], 10);
    else if (argv[i] === '--all')     args.all     = true;
  }
  return args;
}

async function main() {
  const { mode, n, seed, all, workers } = parseArgs(process.argv.slice(2));
  const numWorkers = Math.max(1, workers);

  if (all) {
    for (const betMode of VALID_BET_MODES) {
      await simulateAndPrint(betMode, n || DEFAULT_N_BY_MODE[betMode], seed, numWorkers);
    }
    return;
  }

  const resolvedMode = mode || 'base';
  if (!VALID_BET_MODES.includes(resolvedMode)) {
    console.error(`Unknown --mode "${resolvedMode}". Valid: ${VALID_BET_MODES.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  await simulateAndPrint(resolvedMode, n || DEFAULT_N_BY_MODE[resolvedMode], seed, numWorkers);
}

// ─── Worker entry / main dispatch ─────────────────────────────────────────────

if (!isMainThread) {
  // Running as a spawned worker: simulate and post raw totals back to the main thread.
  const { betMode, n, seed } = workerData;
  const costCenti = BET_MODE_COST_MULTIPLIER[betMode] * 100;
  const rng       = createLocalPrng(seed);
  const collector = createStatsCollector(costCenti);
  for (let i = 0; i < n; i++) collector.recordRound(simulateOneRound(betMode, rng));
  parentPort.postMessage(collector.getRawTotals());
} else {
  main().catch((err) => { console.error(err.stack || err.message); process.exitCode = 1; });
}
