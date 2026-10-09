// Ported verbatim from gamestate.py's literal random.choice([...]) lists. Kept as literal
// arrays (not pre-collapsed to probabilities) so they stay diffable against the Python
// source by eye. See docs/game-design-spec.md "Switch Spins feature".
// Bags tuned for RTP (no longer Python-verbatim) are written as {value: count} via
// bagFromCounts instead, since fine RTP steps need long bags (up to 160 entries).

/** Expands {value: count} into a pickFromBag array, in ascending value order. */
function bagFromCounts(counts) {
  return Object.entries(counts).flatMap(([value, count]) => Array(count).fill(Number(value)));
}

// Base game spin bag — longer sequences feel exciting in base since triggers are rarer.
const SPINS_AWARD_BAG_BASE_AND_R = [1, 1, 1, 1, 2, 2, 2, 3, 3, 4]; // mean 2.0; 1=40%, 2=30%, 3=20%, 4=10%

// R-mode freespin bag — mostly 1 spin so high trigger frequency (10%/spin) doesn't
// compound into massive board conversions. 2 spins is a rare treat; 3 is very rare.
const SPINS_AWARD_BAG_R = [1, 1, 1, 1, 1, 1, 1, 1, 2, 3]; // mean 1.4; 1=80%, 2=10%, 3=10%

// R-mode bag for bonus BUY sessions only. Richer than the natural-FS R bag (mean 1.4)
// to deliver ~96% RTP at 100x cost. Max capped at 8 (vs S-mode's 10) since R-mode
// sequences convert fewer symbols per spin.
// 80 entries so each +1 to the total is ~0.13pp of bonus RTP (measured by paired simulation).
// vs [1,1,2,2,3,4,4,5,6,8] x8: four 8s -> 7 and two 2s -> 1 -> bonus 96.10% (2026-10).
const SPINS_AWARD_BAG_R_BUY = bagFromCounts({ 1: 18, 2: 14, 3: 8, 4: 16, 5: 8, 6: 8, 7: 4, 8: 4 }); // mean 3.53

// S-mode (super free spins) uses a slightly different, lower-skewed bag.
// gamestate.py run_super_freespin:313, upgrade_super_freespin:408.
// Extended with 3 extra 1s to lower the mean (2.91 vs original 3.10) while keeping max=10.
// 1-spin: 41%, 2-spin: 19%, 3-spin: 16%, 4-spin: 6%, 5–10: rare; 10-spin jackpot preserved.
// Used by buy sessions (super, and bonus after an R->S upgrade) - calibrated for super at 300x.
// 128 entries (the 32-entry original x4) so each +1 to the total is ~0.12pp of super RTP
// (measured by paired simulation); one 1 -> 2 on top of the original -> super 96.07% (2026-10).
const SPINS_AWARD_BAG_S_BUY = bagFromCounts({ 1: 51, 2: 25, 3: 20, 4: 8, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4 }); // mean 2.91

// S-mode bag for naturally-triggered/upgraded Super FS (base, baseplus, feature_spins). Split
// from the buy bag (same pattern as R / R_BUY) so base RTP can be tuned without moving super.
// S-mode sessions carry most of base's free-spin value (incl. R->S upgrades). 128 entries
// so each +1 to the total is ~0.06pp of base RTP (measured by paired simulation).
// vs the original S bag x4: six 1s -> 2 and eight 1s -> 3 (+22) -> base 96.12% (2026-10).
const SPINS_AWARD_BAG_S = bagFromCounts({ 1: 38, 2: 30, 3: 28, 4: 8, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4 }); // mean 3.08

// feature_spins buy mode: guaranteed first-spin drop on base reels at 20× cost.
// Needs a much richer bag than the standard base bag (mean 2.0) to reach 96% RTP.
// Steep lever: each +0.1 on the mean is ~+1.2pp RTP, so 160 entries, where each +1 to the
// total is ~0.065pp (measured by paired simulation). Built from [5,6,6,7,8,8,9,10,10,13]
// x16 (mean 8.2) with three 10s -> 9 -> 96.09% (2026-10).
const SPINS_AWARD_BAG_FEATURE_SPINS = bagFromCounts({ 5: 16, 6: 32, 7: 16, 8: 32, 9: 19, 10: 29, 13: 16 }); // mean 8.18

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
// Natural FS (base/baseplus modes): R=23 → ~37% trigger rate over 10 spins, calibrated to
// give ~96% total base-mode RTP without over-powering natural free spins.
// Buy FS (bonus/super): keeps the original R=14 (~52% over 10 spins) so bonus/super
// maintain their richer switch frequency without needing heavy FR0_BUY weight adjustments.
const INITIAL_DROP_CHANCE_ONE_IN = { base: 31, R: 23, S: 14 };
const INITIAL_DROP_CHANCE_ONE_IN_BUY = { base: 31, R: 14, S: 14 };
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

// Per-mode probability that a switch sequence substitutes to Wild (W) vs the highest
// paying symbol (H5). Expressed as 1-in-N: N=2 → 50%, N=5 → 20%, N=10 → 10%.
// Base game stays at 50/50 (randBool). Bonus modes can be dialled toward H5 to reduce
// per-trigger RTP contribution while keeping trigger frequency high.
// R/S: 0 = always H5, never W. Bonus switch fires frequently (INITIAL=25, ~46% per session)
// but always creates H5 stacks rather than wild floods — this is what allows ~96% total RTP
// at high trigger frequency. Set R/S to a positive integer (e.g. 10 = 10%) to add occasional
// wild-mode sequences back, but compensate by lowering FR0/FR1 W by ~1-2 units each.
const WILD_CHANCE_ONE_IN = { base: 3, R: 0, S: 0 };

// Weighted selection for switch-target symbols: higher weight = more likely to be chosen.
// Biased toward H symbols (rare on board: 0.8–1.8 expected cells per spin) vs L symbols
// (common: 3.3–6.2 expected cells). Keeps L symbols reachable for rare exciting events
// but makes H the dominant pick so RTP per trigger stays manageable at higher frequencies.
// Inverse-density rationale: H4 has ~0.8 board cells expected vs L1's ~6.2, so giving H4
// ~60× L1's weight normalises the expected conversion count across symbols.
const SWITCH_SOURCE_WEIGHTS = {
  H4: 50, H3: 40, H2: 30, H1: 20,  // 140 total; each H averages 0.8–1.8 cells on board
  L5: 8,  L4: 5,  L3: 3,  L2: 2, L1: 1,  // 19 total; L1 picked ~0.6% of the time
};

module.exports = {
  bagFromCounts,
  SPINS_AWARD_BAG_BASE_AND_R,
  SPINS_AWARD_BAG_R,
  SPINS_AWARD_BAG_R_BUY,
  SPINS_AWARD_BAG_S,
  SPINS_AWARD_BAG_S_BUY,
  SPINS_AWARD_BAG_FEATURE_SPINS,
  SYMBOL_COUNT_BAG,
  INITIAL_DROP_CHANCE_ONE_IN,
  INITIAL_DROP_CHANCE_ONE_IN_BUY,
  RESTACK_DROP_CHANCE_ONE_IN,
  SYMBOL_CAP,
  BLOCKS_AT_SYMBOL_CAP,
  SWITCH_SOURCE_WEIGHTS,
  WILD_CHANCE_ONE_IN,
};
