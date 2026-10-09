#!/usr/bin/env node
// Variance-reduced RTP for base and baseplus. A direct simulation needs billions of rounds to pin
// these down (sigma ~37x bet per round, driven by rare free-spin sessions). Instead, since a natural
// trigger starts free spins from a clean switch state, each round splits exactly into
//
//   RTP = [ E(base-phase win) + P(R) * E(R session) + P(S) * E(S session) ] / cost
//
// P(R)/P(S) are exact (triggerProbabilities.js); the base phase and the two session values are
// simulated separately, each far cheaper than full rounds. Both modes share the session values.
//
// Usage:
//   node sim/estimateBaseRtp.js --rtp 94 [--sessR 30000000] [--sessS 10000000] [--phase 300000000] [--seed 1] [--workers 8]

'use strict';

const { BET_MODE_COST_MULTIPLIER, RTP_PROFILES } = require('../project/engine');
const { naturalTriggerProbabilities } = require('./triggerProbabilities');
const { mergeTotals } = require('./simTasks');
const { randomSeed } = require('./simPrng');
const { createWorkerPool, defaultWorkerCount, runBlocks } = require('./workerPool');

const BLOCK_SIZE = { sessions: 20_000, phase: 500_000 };

const mean = (t) => t.sum / t.n;
const stdErr = (t) => Math.sqrt(Math.max(0, t.sumSq / t.n - mean(t) ** 2) / t.n);

/**
 * @param {{phase: object, sessR: object, sessS: object, probs: {R: number, S: number}, cost: number}} parts
 *   phase/sessR/sessS are {n, sum, sumSq} totals in bet multiples
 * @returns {{rtp: number, se: number, basePhase: number, rPart: number, sPart: number, eR: number, eS: number}}
 */
function combineBaseEstimate({ phase, sessR, sessS, probs, cost }) {
  const eR = mean(sessR);
  const eS = mean(sessS);
  const basePhase = mean(phase);
  const rtp = (basePhase + probs.R * eR + probs.S * eS) / cost;
  const se = Math.sqrt(stdErr(phase) ** 2 + (probs.R * stdErr(sessR)) ** 2 + (probs.S * stdErr(sessS)) ** 2) / cost;
  return { rtp, se, basePhase: basePhase / cost, rPart: probs.R * eR / cost, sPart: probs.S * eS / cost, eR, eS };
}

/** Runs one estimator component (sessions of a mode, or base phases of a bet mode) on the pool. */
function runComponent(pool, { kind, arg, rtpProfile, n, seed, firstBlock = 0, blocks }) {
  const blockSize = BLOCK_SIZE[kind];
  const total = Math.ceil(n / blockSize);
  return runBlocks(pool, {
    firstBlock,
    count: blocks ?? total - firstBlock,
    makeTask: (block) => ({
      kind, rtpProfile, seed: [...seed, block],
      n: Math.min(blockSize, n - block * blockSize),
      ...(kind === 'sessions' ? { mode: arg } : { betMode: arg }),
    }),
    merge: mergeTotals,
  });
}

function formatEstimate(label, est) {
  const pct = (x, d = 3) => (x * 100).toFixed(d) + '%';
  return `${label.padEnd(9)} RTP ${pct(est.rtp)} ±${(1.96 * est.se * 100).toFixed(3)}pp  ` +
    `(base phase ${pct(est.basePhase, 2)} + R ${pct(est.rPart, 2)} + S ${pct(est.sPart, 2)}; E[R] ${est.eR.toFixed(2)}x, E[S] ${est.eS.toFixed(2)}x)`;
}

async function main() {
  const args = { rtp: '96', sessR: 30_000_000, sessS: 10_000_000, phase: 300_000_000, seed: randomSeed(), workers: defaultWorkerCount() };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in args)) throw new Error(`unknown option --${key}`);
    args[key] = key === 'rtp' ? argv[++i] : Number(argv[++i]);
  }
  if (!RTP_PROFILES[args.rtp]) throw new Error(`Unknown --rtp "${args.rtp}". Valid: ${Object.keys(RTP_PROFILES).join(', ')}`);

  const pool = createWorkerPool(args.workers);
  const t0 = Date.now();
  try {
    console.log(`Estimating base/baseplus RTP for profile ${args.rtp} (seed ${args.seed}, ${pool.size} workers)...`);
    const sessR = await runComponent(pool, { kind: 'sessions', arg: 'R', rtpProfile: args.rtp, n: args.sessR, seed: [args.seed, 1] });
    const sessS = await runComponent(pool, { kind: 'sessions', arg: 'S', rtpProfile: args.rtp, n: args.sessS, seed: [args.seed, 2] });
    for (const [i, betMode] of ['base', 'baseplus'].entries()) {
      const phase = await runComponent(pool, { kind: 'phase', arg: betMode, rtpProfile: args.rtp, n: args.phase, seed: [args.seed, 3 + i] });
      const probs = naturalTriggerProbabilities(args.rtp, betMode);
      console.log(formatEstimate(betMode, combineBaseEstimate({ phase, sessR, sessS, probs, cost: BET_MODE_COST_MULTIPLIER[betMode] })));
    }
    console.log(`(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(err.stack || err.message); process.exitCode = 1; });
}

module.exports = { combineBaseEstimate, runComponent, formatEstimate, BLOCK_SIZE };
