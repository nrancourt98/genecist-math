const { SWITCH_SOURCE_POOL, HIGHEST_SYMBOL, WILD } = require("../config/symbols");
const {
  SPINS_AWARD_BAG_BASE_AND_R,
  SPINS_AWARD_BAG_S,
  SYMBOL_COUNT_BAG,
  INITIAL_DROP_CHANCE_ONE_IN,
  RESTACK_DROP_CHANCE_ONE_IN,
  SYMBOL_CAP,
  BLOCKS_AT_SYMBOL_CAP,
} = require("../config/switchTables");

/** @returns {{spins: number, symbols: string[], wild: boolean|null}} */
function createInitialSwitchState() {
  return { spins: 0, symbols: [], wild: null };
}

/**
 * Decide whether a fresh SW symbol drops this spin. Flat, context-independent chance per
 * mode and per state - no individual spin is special-cased, see
 * docs/game-design-spec.md "Corrections vs. literal Python source". Two different rates
 * apply depending on whether a sequence is already active (see
 * docs/architecture.md's judgment-call log, "switch-spins balancing", for why a single
 * shared rate doesn't work): INITIAL_DROP_CHANCE_ONE_IN while switchState.spins is 0,
 * RESTACK_DROP_CHANCE_ONE_IN (much rarer) while a sequence is already running.
 *
 * When the mode blocks further drops at the symbol cap (base, S) and the cap is already
 * reached, the check is skipped entirely without drawing from rng - this has no effect
 * on the outcome (a capped mode would never let the drop resolve into anything anyway)
 * and simply avoids spending an RNG draw on a foregone conclusion.
 *
 * @param {{spins: number, symbols: string[]}} switchState
 * @param {"base"|"R"|"S"} gameMode
 * @param {import("../rng/rngInterface")} rng
 * @returns {{reel: number, row: number}|null}
 */
function maybeDropSwitch(switchState, gameMode, rng) {
  if (BLOCKS_AT_SYMBOL_CAP[gameMode] && switchState.symbols.length >= SYMBOL_CAP) {
    return null;
  }

  const chanceTable = switchState.spins > 0 ? RESTACK_DROP_CHANCE_ONE_IN : INITIAL_DROP_CHANCE_ONE_IN;
  const dropped = rng.randInt(chanceTable[gameMode]) === 0;
  if (!dropped) return null;

  const reel = rng.randInt(6);
  const row = rng.randInt(5);
  return { reel, row };
}

/**
 * Resolve the award for a freshly-dropped SW: roll (once per sequence) whether
 * substitution targets Wild or the highest symbol, roll how many more spins to add
 * (stacking), and roll which new symbol(s) become switch targets (stacking, deduped
 * against what's already chosen).
 *
 * Mutates switchState in place - the caller is responsible for cloning roundState
 * before calling, per the step-function's "never mutate the input" contract.
 *
 * @param {{spins: number, symbols: string[], wild: boolean|null}} switchState
 * @param {"base"|"R"|"S"} gameMode
 * @param {import("../rng/rngInterface")} rng
 * @returns {{spinsAwarded: number, wild: boolean, symbols: string[], totalSpins: number}}
 */
function resolveSwitchAward(switchState, gameMode, rng) {
  if (switchState.spins === 0) {
    switchState.wild = rng.randBool();
  }

  const spinsBag = gameMode === "S" ? SPINS_AWARD_BAG_S : SPINS_AWARD_BAG_BASE_AND_R;
  const spinsAwarded = rng.pickFromBag(spinsBag);

  let numToAdd = rng.pickFromBag(SYMBOL_COUNT_BAG);
  const available = SWITCH_SOURCE_POOL.filter((symbol) => !switchState.symbols.includes(symbol));
  numToAdd = Math.min(numToAdd, available.length);

  if (numToAdd > 0) {
    const newSymbols = rng.sampleWithoutReplacement(available, numToAdd);
    switchState.symbols.push(...newSymbols);
  }

  switchState.spins += spinsAwarded;

  return {
    spinsAwarded,
    wild: switchState.wild,
    symbols: switchState.symbols.slice(),
    totalSpins: switchState.spins,
  };
}

/**
 * Replace every board cell whose symbol name is in switchState.symbols with W (if
 * switchState.wild) or H5 (otherwise) - ALL matching occurrences. No-op (returns []) if
 * switchState.symbols is empty, which correctly covers the "the very triggering spin
 * itself never gets replaced" case automatically (the award that populates symbols[]
 * hasn't been resolved yet at the point replacement runs for that spin).
 *
 * Newly-created W cells deliberately do NOT get a multiplier assigned here - call
 * assignWildMultipliers again after this, so it picks up both natural and switch-created
 * wilds in one pass (see docs/architecture.md "Per-spin orchestration order").
 *
 * @param {{name: string}[][]} board
 * @param {{spins: number, symbols: string[], wild: boolean|null}} switchState
 * @returns {{reel: number, row: number, symbol: string}[]}
 */
function applySwitchReplacement(board, switchState) {
  if (switchState.symbols.length === 0) return [];

  const replacementName = switchState.wild ? WILD : HIGHEST_SYMBOL;
  const changes = [];

  for (let reel = 0; reel < board.length; reel++) {
    const column = board[reel];
    for (let row = 0; row < column.length; row++) {
      if (switchState.symbols.includes(column[row].name)) {
        column[row] = { name: replacementName };
        changes.push({ reel, row, symbol: replacementName });
      }
    }
  }

  return changes;
}

module.exports = {
  createInitialSwitchState,
  maybeDropSwitch,
  resolveSwitchAward,
  applySwitchReplacement,
};
