// Ported verbatim from gamestate.py's literal random.choice([...]) lists. Kept as literal
// arrays (not pre-collapsed to probabilities) so they stay diffable against the Python
// source by eye. See docs/game-design-spec.md "Switch Spins feature".

// Spins-to-award per drop, base game and R-mode (regular free spins) share this bag.
// gamestate.py run_spin:117, run_freespin:213.
const SPINS_AWARD_BAG_BASE_AND_R = [
  1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6, 6, 7, 7, 8, 8, 9, 10,
];

// S-mode (super free spins) uses a slightly different, lower-skewed bag.
// gamestate.py run_super_freespin:313, upgrade_super_freespin:408.
const SPINS_AWARD_BAG_S = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 5, 6, 7, 8, 9, 10,
];

// Count of NEW switch-target symbols to add per drop, shared across all modes.
// gamestate.py run_spin:119, run_freespin:215, run_super_freespin:315, upgrade_super_freespin:410.
const SYMBOL_COUNT_BAG = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4,
];

// Per-spin drop chance, expressed as 1-in-N, split into two tunable rates rather than one
// shared value - see docs/architecture.md's judgment-call log ("switch-spins
// balancing"). Corrected per the designer (the literal Python source's special-cased
// "guaranteed on spin 1" behavior is temporary test-only code, not ported - see
// docs/game-design-spec.md "Corrections vs. literal Python source").
//
// - INITIAL: chance per spin while no sequence is active - how often the feature
//   triggers at all.
// - RESTACK: chance per spin *while a sequence is already active* - how often a fresh
//   drop stacks on top of (extends) a running sequence. Empirically, via the offline
//   simulator: even with INITIAL tuned low, sharing one rate for both meant a tiny
//   fraction of sequences kept re-triggering long enough to exhaust the 9-symbol cap and
//   spend many remaining spins with most of the board converted to the top symbol - a
//   handful of those rare runs dominated the average (4 wincap-hits out of 2000 rounds
//   accounted for 93% of total win). RESTACK is kept far rarer than INITIAL specifically
//   to keep that compounding tail negligible while still allowing it in principle, since
//   the designer wants stacking preserved as a mechanic, not removed.
const INITIAL_DROP_CHANCE_ONE_IN = { base: 200, R: 120, S: 150 };
const RESTACK_DROP_CHANCE_ONE_IN = { base: 4000, R: 2500, S: 3000 };

// Base game and S-mode both block further SW drops once switch_symbols reaches 9 unique
// entries (the whole eligible pool) - base derives this implicitly from clamping
// numToAdd to the exhausted pool size and setting prevent_switch (gamestate.py
// run_spin:121-123); S-mode checks this explicitly before rolling a drop
// (run_super_freespin:271, upgrade_super_freespin:366). R-mode has NO such cap at all
// (run_freespin never sets/checks prevent_switch) - ported as-is, not unified, see
// docs/architecture.md judgment-call log.
const SYMBOL_CAP = 9;
const BLOCKS_AT_SYMBOL_CAP = { base: true, R: false, S: true };

module.exports = {
  SPINS_AWARD_BAG_BASE_AND_R,
  SPINS_AWARD_BAG_S,
  SYMBOL_COUNT_BAG,
  INITIAL_DROP_CHANCE_ONE_IN,
  RESTACK_DROP_CHANCE_ONE_IN,
  SYMBOL_CAP,
  BLOCKS_AT_SYMBOL_CAP,
};
