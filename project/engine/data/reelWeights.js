// Design-time symbol weight tables used by generateReels.js to build fresh reel strips.
// Not the engine's runtime data (that's reels/*.json, generated from these) - this file
// is the tunable input for math balancing. SW is deliberately absent from every table: it
// never appears on a natural reel strip, it's always injected programmatically at a
// random position when a switch-spins drop occurs (see engine/features/switchSpins.js).
//
// These replace the original Python prototype's reel strips entirely (per the designer:
// gamestate.py's math was never balanced - that happens separately, after simulation -
// so its reel strips aren't meaningful RTP-wise and are not ported). Tuned empirically
// against project/sim/simulate.js; see docs/architecture.md's judgment-call log for the
// target metrics and iteration history.

// Per-reel weight tables. Only reel 0 is modified; reels 1-5 use original calibrated
// weights. Reel 0 is the payline anchor reel — the symbol there determines whether any
// win can start at all on a given payline.
//
// CALIBRATION NOTE — pool index stability with fixed seed (20260619):
// The strip generator builds a flat pool array (pool[i] = symbol for each weight unit i).
// With a fixed seed, the realized S count in a 1000-row strip depends on WHICH pool
// indices S occupies: different ranges get different hit frequencies from the RNG sequence.
// Moving S (e.g., by changing W weight) shifts its pool range and changes trigger rate
// unpredictably. The HOLD phantom filler solves this: HOLD fills the space freed by
// reducing W from 28→2, keeping all subsequent symbols (W and S) at the SAME pool
// positions they occupied in the original W=28 config. S stays at pool[391..402] regardless
// of W value, so trigger rate is stable across W changes.
//
// HOLD is non-paying (not in the paytable, not a wild): lineEvaluator returns null when
// HOLD is the anchor. It functions identically to BLANK for line evaluation purposes.
//
// Result: L 3OAK drops from 70% L-density on all reels to 18.3% on reel 0 (via BLANK),
// W-sub backdoor closes (HOLD replaces 26/28 of the old W slots), and trigger stays at
// the calibrated 1/169 rate. P(any L win) ≈ 13.6% = 1/7.4 (target 1/6 max, 1/7-1/10 ok).
const _BR0_ANCHOR = {  // reel 0 ONLY — total 836 (S at pool[391-402], same as original)
  H5: 10, H4: 30, H3: 40, H2: 60, H1: 70,  // H=210, 25.1% density (unchanged)
  L5: 22, L4: 25, L3: 30, L2: 35, L1: 41,  // L=153, 18.3% density (down from 70.1%)
  HOLD: 26,  // phantom non-paying filler: occupies pool[363-388] (old W range minus 2)
             // pushes W and S back to their original pool positions — see note above
  W: 2,      // 0.24%: closes W→L wild-sub backdoor (W on reel0 was 45% of all L wins)
  S: 12,     // pool[391-402] — SAME as original W=28 config → trigger rate stable
  BLANK: 433, // main non-paying filler: blocks paylines when anchor (pool[403-835])
};
const _BR0_STANDARD = {  // reels 1-5: original calibrated weights (total 835)
  H5: 10, H4: 30, H3: 40, H2: 60, H1: 70,
  L5: 85, L4: 95, L3: 115, L2: 135, L1: 155,
  W: 28, S: 12,
};
const BR0_WEIGHTS = [_BR0_ANCHOR, _BR0_STANDARD, _BR0_STANDARD, _BR0_STANDARD, _BR0_STANDARD, _BR0_STANDARD];

// Every non-S weight here is the original table x10 (e.g. H5 1->10) purely so S can be
// tuned at one-tenth granularity - integer weights elsewhere would force S to round to a
// whole multiple of a much coarser step.
const FR0_WEIGHTS = {
  H5: 10, H4: 10, H3: 20, H2: 30, H1: 40,
  L5: 90, L4: 100, L3: 110, L2: 120, L1: 130,
  W: 33,  // raised from 17: reel0 HOLD eliminates ~13% basegame (switch×wild wins gone);
          // W=33 compensates via freegame — confirmed 96.1% total at 10M rounds
  S: 21,  // increased from 17: pushes upgrade rate ~11.6%→~20%, targeting S-trigger ~1/1200
};

const FR1_WEIGHTS = {
  H5: 4, H4: 5, H3: 6, H2: 7, H1: 8,
  L5: 9, L4: 10, L3: 11, L2: 12, L1: 13,
  W: 6,   // reduced from 9; S-mode natural W secondary to cumulative H5 pool wins
  S: 2,
};

module.exports = { BR0_WEIGHTS, FR0_WEIGHTS, FR1_WEIGHTS };
