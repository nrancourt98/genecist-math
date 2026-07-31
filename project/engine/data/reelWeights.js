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

// Tuned empirically for base/baseplus RTP (~94-95% at last check, see
// docs/architecture.md's judgment-call log "S2 merged into S" for the iteration history).
// Scaled x10 from the original table (e.g. H5 1->10) so S can be tuned at one-tenth
// granularity now that it's one merged pool instead of two separate S/S2 ones - integer
// weights elsewhere would otherwise force S to round to a whole multiple of a much
// coarser step.
const BR0_WEIGHTS = {
  H5: 10,
  H4: 30,
  H3: 40,
  H2: 60,
  H1: 70,
  L5: 130,
  L4: 150,
  L3: 180,
  L2: 210,
  L1: 240,
  W: 50,
  S: 14,
};

// Every non-S weight here is the original table x10 (e.g. H5 1->10) purely so S can be
// tuned at one-tenth granularity - integer weights elsewhere would force S to round to a
// whole multiple of a much coarser step. Ratios among the paying symbols/W are otherwise
// identical to BR0_WEIGHTS' relative shape, just scaled.
const FR0_WEIGHTS = {
  H5: 10,
  H4: 10,
  H3: 20,
  H2: 30,
  H1: 40,
  L5: 90,
  L4: 100,
  L3: 110,
  L2: 120,
  L1: 130,
  W: 30,
  S: 17,
};

const FR1_WEIGHTS = {
  H5: 4,
  H4: 5,
  H3: 6,
  H2: 7,
  H1: 8,
  L5: 9,
  L4: 10,
  L3: 11,
  L2: 12,
  L1: 13,
  W: 9,
  S: 2,
};

module.exports = { BR0_WEIGHTS, FR0_WEIGHTS, FR1_WEIGHTS };
