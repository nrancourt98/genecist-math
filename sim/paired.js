#!/usr/bin/env node
// Paired (common-random-number) comparison of tuning variants. Every sample k gets its own PRNG
// stream seeded from (seed, k) and is replayed once per variant, so variants only diverge where
// they actually differ - e.g. where a changed bag entry is drawn, or a swapped reel cell lands on
// the board. Differences against the first (reference) variant come out far tighter than separate
// runs could measure; this is how the bags and 94% swap counts were tuned. The absolute level
// still needs a long direct run (simulate.js / certify.js) - pairing only measures differences.
//
// Usage:
//   node sim/paired.js --sample rounds:super --rtp 94 --n 2000000 --variants variants.json [--seed 1] [--workers 8]
//
// --sample: rounds:<betMode> | sessions:<R|S> (a natural free-spin session) | phase:<betMode> (base phase only)
// variants.json: [
//   { "label": "current" },
//   { "label": "BR0_94 +5", "derived": { "BR0_94": 58 } },                       // swap count (reelWeights.js DERIVED_REELS)
//   { "label": "richer bag", "bags": { "SPINS_AWARD_BAG_S_BUY": { "1": 50, "2": 26, "3": 20 } } },  // array or {value: count}
//   { "label": "boost 6.10%", "boost": { "hits": 610, "outOf": 10000 } }
// ]

'use strict';

const fs = require('fs');
const { BET_MODE_COST_MULTIPLIER, RTP_PROFILES } = require('../project/engine');
const { mergeTotals } = require('./simTasks');
const { randomSeed } = require('./simPrng');
const { createWorkerPool, defaultWorkerCount, runBlocks } = require('./workerPool');

const SAMPLES_PER_BLOCK = 20_000;

async function main() {
  const args = { sample: null, rtp: '96', n: 1_000_000, variants: null, seed: randomSeed(), workers: defaultWorkerCount() };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in args)) throw new Error(`unknown option --${key}`);
    args[key] = ['n', 'seed', 'workers'].includes(key) ? Number(argv[++i]) : argv[++i];
  }
  if (!args.sample || !args.variants) throw new Error('usage: --sample <kind> --variants <file.json> [--rtp 94] [--n N]');
  if (!RTP_PROFILES[args.rtp]) throw new Error(`Unknown --rtp "${args.rtp}"`);
  const variants = JSON.parse(fs.readFileSync(args.variants, 'utf8'));
  const [kind, arg] = args.sample.split(':');
  const cost = kind === 'rounds' ? BET_MODE_COST_MULTIPLIER[arg] : 1;

  const pool = createWorkerPool(args.workers);
  const t0 = Date.now();
  try {
    const t = await runBlocks(pool, {
      count: Math.ceil(args.n / SAMPLES_PER_BLOCK),
      makeTask: (block) => ({
        kind: 'paired', sampleKind: args.sample, rtpProfile: args.rtp, variants, seed: [args.seed],
        from: block * SAMPLES_PER_BLOCK, to: Math.min(args.n, (block + 1) * SAMPLES_PER_BLOCK),
      }),
      merge: mergeTotals,
    });
    const unit = kind === 'rounds' ? 'pp RTP' : 'x bet';
    const scale = kind === 'rounds' ? 100 / cost : 1;
    console.log(`[${args.sample} @ ${args.rtp}] ${t.n.toLocaleString()} paired samples, seed ${args.seed}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    variants.forEach((v, i) => {
      const m = t.sum[i] / t.n, se = Math.sqrt(Math.max(0, t.sumSq[i] / t.n - m * m) / t.n);
      const d = t.dSum[i] / t.n, dse = Math.sqrt(Math.max(0, t.dSumSq[i] / t.n - d * d) / t.n);
      console.log(`  ${String(v.label).padEnd(28)} ${(m * scale).toFixed(4)} ±${(1.96 * se * scale).toFixed(4)} ${unit} | vs first ${d >= 0 ? '+' : ''}${(d * scale).toFixed(4)} ±${(1.96 * dse * scale).toFixed(4)}`);
    });
  } finally {
    await pool.close();
  }
}

main().catch((err) => { console.error(err.stack || err.message); process.exitCode = 1; });
