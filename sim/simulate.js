#!/usr/bin/env node
// Offline RTP / feature-frequency simulator. Imports the engine directly (no HTTP) and
// loops resolveOneSpin synchronously with the local PRNG until a round is final. This is
// the project's primary math-documentation artifact for BGaming's submission
// requirements - see docs/architecture.md "Offline simulation / RTP CLI".
//
// Usage:
//   node sim/simulate.js --mode base --n 100000 [--seed 1234]
//   node sim/simulate.js --all [--n 100000]   (loops every bet mode, smaller default n
//                                               for bonus/super since each of their
//                                               rounds does substantially more work)

const { resolveOneSpin, createInitialRoundState, createLocalPrng, BET_MODE_COST_MULTIPLIER, VALID_BET_MODES } =
  require("../project/engine");
const { createStatsCollector } = require("./statsCollector");
const { formatReport } = require("./reportFormat");

// Generous upper bound on steps within a single round - even an extreme, multi-sigma
// chain of stacking switch-spin drops resolves in far fewer steps than this in practice;
// existing only to turn a genuine infinite-loop bug into a loud failure instead of a
// hang, never expected to trigger on a legitimate round.
const ROUND_STEP_GUARD = 5000;

const DEFAULT_N_BY_MODE = { base: 100000, baseplus: 100000, bonus: 50000, super: 50000 };

// betAmountCents is irrelevant to every stat this simulator reports - all win/cost
// accounting stays in bet-amount-independent centi-multiplier units throughout (see
// docs/game-design-spec.md "Internal unit convention"); centiMultiplierToCents is an
// HTTP-boundary concern this CLI never touches. The placeholder value below is never
// read by engine logic.
const PLACEHOLDER_BET_AMOUNT_CENTS = 100;

function parseArgs(argv) {
  const args = { mode: null, n: null, seed: undefined, all: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mode") args.mode = argv[++i];
    else if (argv[i] === "--n") args.n = parseInt(argv[++i], 10);
    else if (argv[i] === "--seed") args.seed = parseInt(argv[++i], 10);
    else if (argv[i] === "--all") args.all = true;
  }
  return args;
}

/**
 * Plays one full round to completion, deriving every reported statistic either from the
 * roundState transitions visible to this loop or from the events each step emits -
 * deliberately not reaching into any engine module beyond the public resolveOneSpin
 * contract.
 * @param {"base"|"baseplus"|"bonus"|"super"} betMode
 * @param {import("../project/engine/rng/rngInterface")} rng
 */
function simulateOneRound(betMode, rng) {
  let roundState = createInitialRoundState(betMode, PLACEHOLDER_BET_AMOUNT_CENTS);
  let prevSwitchSpins = roundState.switch.spins;

  let switchSequenceCount = 0;
  let switchSpinsSteps = 0;
  let switchWildCount = 0;
  let switchHighestCount = 0;
  let fsTriggerMode = null;
  let hitWincap = false;

  for (let step = 0; step < ROUND_STEP_GUARD; step++) {
    const wasBuyTriggerStep = roundState.phase === "buyTrigger";
    const { events, roundState: next, isRoundFinal } = resolveOneSpin(roundState, rng);

    // A 0 -> nonzero transition in switch.spins marks the start of a fresh sequence
    // (stacking drops mid-sequence never bring it back through 0, so this can't double-count).
    if (prevSwitchSpins === 0 && next.switch.spins > 0) {
      switchSequenceCount += 1;
      if (next.switch.wild) switchWildCount += 1;
      else switchHighestCount += 1;
    }
    if (events.some((e) => e.type === "updateSwitchSpins")) switchSpinsSteps += 1;

    // Buy-mode entries (bonus/super) now also emit a freeSpinTrigger on their very first
    // step - the synthetic "triggering" board shown before the feature itself starts (see
    // docs/architecture.md's judgment-call log, "buy-feature triggering board"). That's
    // not a natural in-round trigger and would otherwise mask the one stat this field
    // exists to capture for bonus mode: how often it naturally upgrades R -> S mid-feature
    // (super never upgrades further, so it stays 0% either way - see freeSpins.js).
    if (fsTriggerMode === null && !wasBuyTriggerStep && events.some((e) => e.type === "freeSpinTrigger")) {
      fsTriggerMode = next.freeSpin ? next.freeSpin.mode : null;
    }
    if (events.some((e) => e.type === "wincap")) hitWincap = true;

    prevSwitchSpins = next.switch.spins;
    roundState = next;

    if (isRoundFinal) {
      return {
        winCenti: roundState.basegameWinsCenti + roundState.freegameWinsCenti,
        switchSequenceCount,
        switchSpinsSteps,
        switchWildCount,
        switchHighestCount,
        fsTriggerMode,
        hitWincap,
      };
    }
  }

  throw new Error(`simulateOneRound: round did not finish within ${ROUND_STEP_GUARD} steps (betMode=${betMode})`);
}

function runSimulation(betMode, n, seed) {
  const rng = createLocalPrng(seed);
  const costCenti = BET_MODE_COST_MULTIPLIER[betMode] * 100;
  const collector = createStatsCollector(costCenti);

  for (let i = 0; i < n; i++) {
    collector.recordRound(simulateOneRound(betMode, rng));
  }

  return collector.summary();
}

function simulateAndPrint(mode, n, seed) {
  console.log(`Simulating ${n.toLocaleString()} rounds of mode "${mode}"...`);
  const start = Date.now();
  const summary = runSimulation(mode, n, seed);
  console.log(formatReport(mode, n, summary, Date.now() - start));
}

function main() {
  const { mode, n, seed, all } = parseArgs(process.argv.slice(2));

  if (all) {
    for (const betMode of VALID_BET_MODES) {
      simulateAndPrint(betMode, n || DEFAULT_N_BY_MODE[betMode], seed);
    }
    return;
  }

  const resolvedMode = mode || "base";
  if (!VALID_BET_MODES.includes(resolvedMode)) {
    console.error(`Unknown --mode "${resolvedMode}". Valid modes: ${VALID_BET_MODES.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  simulateAndPrint(resolvedMode, n || DEFAULT_N_BY_MODE[resolvedMode], seed);
}

main();
