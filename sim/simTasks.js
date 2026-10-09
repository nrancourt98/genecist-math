'use strict';
// The units of work the simulation tools hand to worker threads (see workerPool.js). Every task
// carries its own seed parts, so a run's results depend only on how it's split into tasks, never
// on how many workers ran them.
//
//   rounds   - full rounds of one bet mode, aggregated by statsCollector
//   sessions - naturally-triggered free-spin sessions of one mode ("R" or "S")
//   phase    - base phases of one bet mode, up to their natural trigger
//   paired   - samples [from, to), each replayed once per variant from the same seed (see paired.js)

const { createSimPrng } = require('./simPrng');
const { simulateOneRound, simulateFreeSpinSession, simulateBasePhase } = require('./roundSimulator');
const { createStatsCollector } = require('./statsCollector');
const { BET_MODE_COST_MULTIPLIER, RTP_PROFILES } = require('../project/engine');
const { REELS } = require('../project/engine/config/reels');
const { DERIVED_REELS } = require('../project/engine/data/reelWeights');
const { deriveStrip } = require('../project/engine/data/generateReels');
const { bagFromCounts } = require('../project/engine/config/switchTables');

function runRounds({ betMode, rtpProfile, n, seed }) {
  const rng = createSimPrng(...seed);
  const collector = createStatsCollector(BET_MODE_COST_MULTIPLIER[betMode] * 100);
  for (let i = 0; i < n; i++) collector.recordRound(simulateOneRound(betMode, rng, rtpProfile));
  return collector.getRawTotals();
}

function runSessions({ mode, rtpProfile, n, seed }) {
  const rng = createSimPrng(...seed);
  const t = { n: 0, sum: 0, sumSq: 0, capped: 0 };
  for (let i = 0; i < n; i++) {
    const { winCenti, capped } = simulateFreeSpinSession(mode, rng, rtpProfile);
    const w = winCenti / 100;
    t.n++; t.sum += w; t.sumSq += w * w;
    if (capped) t.capped++;
  }
  return t;
}

function runPhase({ betMode, rtpProfile, n, seed }) {
  const rng = createSimPrng(...seed);
  const t = { n: 0, sum: 0, sumSq: 0, R: 0, S: 0 };
  for (let i = 0; i < n; i++) {
    const { winCenti, trigger } = simulateBasePhase(betMode, rng, rtpProfile);
    const w = winCenti / 100;
    t.n++; t.sum += w; t.sumSq += w * w;
    if (trigger) t[trigger]++;
  }
  return t;
}

// --- paired ---

/** Win (in bet multiples) of one sample of the given kind: "rounds:<betMode>", "sessions:<R|S>", "phase:<betMode>". */
function playSample(sampleKind, rng, rtpProfile) {
  const [kind, arg] = sampleKind.split(':');
  if (kind === 'rounds') return simulateOneRound(arg, rng, rtpProfile).winCenti / 100;
  if (kind === 'sessions') return simulateFreeSpinSession(arg, rng, rtpProfile).winCenti / 100;
  if (kind === 'phase') return simulateBasePhase(arg, rng, rtpProfile).winCenti / 100;
  throw new Error(`unknown sample kind: ${sampleKind}`);
}

const variantCache = new Map();

/**
 * A variant overrides the profile's derived strips ({ BR0_94: 53 } = that swap count), switch-table
 * bags (arrays, or {value: count} objects) and/or baseplus boost chance ({ hits, outOf }).
 */
function prepareVariant(variant) {
  const key = JSON.stringify(variant);
  if (!variantCache.has(key)) {
    const strips = Object.fromEntries(Object.entries(variant.derived || {}).map(([name, count]) => {
      const spec = DERIVED_REELS[name];
      if (!spec) throw new Error(`unknown derived strip: ${name}`);
      return [name, deriveStrip(REELS[spec.source], { ...spec, count })];
    }));
    const bags = Object.fromEntries(Object.entries(variant.bags || {}).map(([name, bag]) =>
      [name, Array.isArray(bag) ? bag : bagFromCounts(bag)]));
    variantCache.set(key, { strips, bags, boost: variant.boost });
  }
  return variantCache.get(key);
}

const originalStrips = Object.fromEntries(Object.keys(DERIVED_REELS).map((name) => [name, REELS[name]]));
const originalProfiles = Object.fromEntries(Object.entries(RTP_PROFILES).map(([name, p]) =>
  [name, { switchTables: p.switchTables, basePlusBoostChance: p.basePlusBoostChance }]));

function applyVariant(rtpProfile, prepared) {
  for (const name of Object.keys(originalStrips)) REELS[name] = prepared.strips[name] || originalStrips[name];
  const profile = RTP_PROFILES[rtpProfile];
  const original = originalProfiles[rtpProfile];
  profile.switchTables = { ...original.switchTables, ...prepared.bags };
  profile.basePlusBoostChance = prepared.boost || original.basePlusBoostChance;
}

function runPaired({ sampleKind, rtpProfile, variants, from, to, seed }) {
  const prepared = variants.map(prepareVariant);
  const V = variants.length;
  const t = { n: 0, sum: Array(V).fill(0), sumSq: Array(V).fill(0), dSum: Array(V).fill(0), dSumSq: Array(V).fill(0) };
  try {
    for (let k = from; k < to; k++) {
      const wins = prepared.map((p) => {
        applyVariant(rtpProfile, p);
        return playSample(sampleKind, createSimPrng(...seed, k), rtpProfile);
      });
      t.n++;
      for (let v = 0; v < V; v++) {
        const d = wins[v] - wins[0];
        t.sum[v] += wins[v]; t.sumSq[v] += wins[v] * wins[v];
        t.dSum[v] += d; t.dSumSq[v] += d * d;
      }
    }
  } finally {
    applyVariant(rtpProfile, { strips: {}, bags: {} });
  }
  return t;
}

const RUNNERS = { rounds: runRounds, sessions: runSessions, phase: runPhase, paired: runPaired };

function runTask(task) {
  const runner = RUNNERS[task.kind];
  if (!runner) throw new Error(`unknown task kind: ${task.kind}`);
  return runner(task);
}

/** Merges two task results of the same kind (statsCollector raw totals or plain sums). */
function mergeTotals(a, b) {
  if (!a) return structuredClone(b);
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (key === 'costCenti') continue;
    if (Array.isArray(value)) out[key] = a[key].map((x, i) => x + value[i]);
    else if (key.startsWith('max')) out[key] = Math.max(a[key], value);
    else out[key] = a[key] + value;
  }
  return out;
}

module.exports = { runTask, mergeTotals };
