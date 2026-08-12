const { createInitialSwitchState } = require("../features/switchSpins");
const { createInitialFreeSpinState } = require("../features/freeSpins");
const { BASEPLUS_COST_MULTIPLIER } = require("../features/basePlus");

// Buy-bonus cost multipliers, verified verbatim from game_config.py's bet_modes
// (base=1.0, bonus=100.0, super=300.0); baseplus has no Python precedent, see
// docs/architecture.md "baseplus mode - rationale".
const BET_MODE_COST_MULTIPLIER = {
  base: 1,
  baseplus: BASEPLUS_COST_MULTIPLIER,
  feature_spins: 20,
  bonus: 100,
  super: 300,
};

const VALID_BET_MODES = Object.keys(BET_MODE_COST_MULTIPLIER);

/**
 * roundState is plain JSON (numbers/strings/arrays/null only - no class instances) so it
 * survives an opaque JSON round-trip through BGaming's Runner. See
 * docs/architecture.md "The step-function".
 *
 * @param {"base"|"baseplus"|"bonus"|"super"} betMode
 * @param {number} betAmountCents
 * @returns {object} a fresh roundState
 */
function createInitialRoundState(betMode, betAmountCents) {
  if (!VALID_BET_MODES.includes(betMode)) {
    throw new Error(`Unknown bet mode: ${betMode}`);
  }

  const roundState = {
    version: 1,
    betMode,
    betAmountCents,
    phase: "base",
    basegameWinsCenti: 0,
    freegameWinsCenti: 0,
    cappedWin: false,
    switch: createInitialSwitchState(),
    freeSpin: null,
    basePlusBoostApplied: false,
    spinSeq: 0,
  };

  // Buy-feature entry points: skip the base loop entirely, but show a one-step synthetic
  // "triggering" board first (phase "buyTrigger", resolved by spinStep.js's
  // resolveBuyTriggerStep) before the feature itself starts - see
  // docs/architecture.md's judgment-call log, "buy-feature triggering board". freeSpin is
  // pre-populated here already so that step knows which mode (and thus scatter count) to
  // synthesize.
  if (betMode === "feature_spins") {
    roundState.guaranteedSwitchDrop = true; // first base spin is a guaranteed SW drop
  } else if (betMode === "bonus") {
    roundState.phase = "buyTrigger";
    roundState.freeSpin = createInitialFreeSpinState("R", true);
  } else if (betMode === "super") {
    roundState.phase = "buyTrigger";
    roundState.freeSpin = createInitialFreeSpinState("S", true);
  }

  return roundState;
}

/** @param {object} round - the BGaming `round` param as received by the play handler */
function isFreshRound(round) {
  return !round || Object.keys(round).length === 0;
}

module.exports = {
  BET_MODE_COST_MULTIPLIER,
  VALID_BET_MODES,
  createInitialRoundState,
  isFreshRound,
};
