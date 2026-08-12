// Design-time symbol weight tables used by generateReels.js to build fresh reel strips.
// Not the engine's runtime data (that's reels/*.json, generated from these) - this file
// is the tunable input for math balancing. SW is deliberately absent from every table: it
// never appears on a natural reel strip, it's always injected programmatically at a
// random position when a switch-spins drop occurs (see engine/features/switchSpins.js).

// --- CLUSTER STRIP DESIGN (BR0) ---
//
// Each reel column is generated independently. At each position the generator either:
//   A) Cluster mode: picks a symbol from clusterWeights, fills clusterMinLen–clusterMaxLen
//      consecutive rows with that symbol, then advances.
//   B) Random mode: picks one symbol from randomWeights, fills exactly one row, advances.
//
// clusterProbability is the per-decision probability of mode A (not the strip fraction).
// Relationship: cluster_fraction ≈ p × avgLen / (1 + p × (avgLen − 1))
//   avgLen = (clusterMinLen + clusterMaxLen) / 2 = 6.5
//   p = 0.05  →  ~25% cluster coverage
//   p = 0.09  →  ~40% cluster coverage
//   p = 0.04  →  ~20% cluster coverage
//
// CLUSTER RULES:
//   H1–H5 and L1–L5 are the only eligible cluster symbols.
//   W never clusters — switch spins are responsible for W flooding the board.
//   S never clusters — keeps S cells spread so multiple S per window stays low.
//   W and S appear only in randomWeights; they are absent from every clusterWeights table.
//
// PER-REEL STRATEGY:
//   Reel 0  — anchor reel, moderate clustering (25%), balanced H/L clusters.
//             Standard W density (no backdoor-closing needed; reel1's H-bias limits L wins
//             from W wildcard substitution).
//   Reel 1  — H-biased (40% coverage). H ≈ 60% in random, 81% in clusters.
//             Effective L density ≈ 28% vs 70% original → blocks most L-anchor runs.
//   Reel 2  — L-biased opposite (40% coverage). H ≈ 14% in random, 26% in clusters.
//             Blocks H runs that survived reel 1; keeps L wins reachable when they do
//             clear reel 1.
//   Reels 3–5 — standard weights, light clustering (20%). Provides depth for 4-6OAK wins
//               on paylines that manage to align through reels 0–2.
//
// FULLSCREEN: All 30 cells showing the same symbol is theoretically achievable when all
// 6 reels simultaneously land within a same-symbol cluster (extremely rare naturally).
// Switch spins remain the primary vehicle for near-fullscreen states in practice.

const _BR0_REEL0 = {
  // Reduced L (480 vs 585) to cut L-anchor frequency. H stays standard (~25%).
  randomWeights: { H5: 10, H4: 30, H3: 40, H2: 60, H1: 70, L5: 70, L4: 80, L3: 95, L2: 110, L1: 125, W: 28, S: 11 },
  clusterProbability: 0.04,
  clusterWeights:    { H5:  2, H4:  6, H3:  8, H2: 12, H1: 14, L5:  7, L4:  8, L3:  10, L2:  11, L1:  13 },
  clusterMinLen: 5,
  clusterMaxLen: 8,
};

const _BR0_REEL1 = {
  // H-biased, 50% cluster coverage (p=0.13 ≈ 0.5/(6.5-0.5×5.5)).
  // Blocks more L runs than 40% coverage; also reduces W-sub-L backdoor (W on reel0 +
  // reel1=H-cluster → H-anchor win, not L).
  randomWeights: { H5: 15, H4: 45, H3: 60, H2: 90, H1: 105, L5: 35, L4: 40, L3: 50, L2: 60, L1: 70, W: 28, S: 11 },
  clusterProbability: 0.19,  // 60% H-cluster coverage: p = 0.6/(6.5-0.6×5.5) = 0.6/3.2 = 0.1875
  clusterWeights:    { H5:  5, H4: 15, H3: 20, H2:  30, H1:  35, L5:  3, L4:  4, L3:   5, L2:   6, L1:   7 },
  clusterMinLen: 5,
  clusterMaxLen: 8,
};

const _BR0_REEL2 = {
  // Strongly L-dominant (50% L-cluster coverage, H only 7% effective).
  // Blocks H runs from reels 0+1: when reel2 lands in L-cluster, H line stops at reel2.
  // clusterProbability 0.13 ≈ 50% coverage: p = 0.5/(6.5 - 0.5×5.5) = 0.5/3.75 = 0.133
  randomWeights: { H5:  2, H4:  6, H3:  8, H2:  12, H1:  14, L5: 85, L4: 95, L3: 115, L2: 135, L1: 155, W: 28, S: 11 },
  clusterProbability: 0.13,
  clusterWeights:    { H5:  0, H4:  1, H3:  1, H2:   2, H1:   2, L5: 10, L4: 11, L3:  13, L2:  15, L1:  17 },
  clusterMinLen: 5,
  clusterMaxLen: 8,
};

const _BR0_REEL_STD = {
  // Reels 3-5: standard weights, 20% clustering. Standard L depth allows 4-6OAK wins on
  // paylines that successfully align through the blocking reels 1 and 2.
  randomWeights: { H5: 10, H4: 30, H3: 40, H2:  60, H1:  70, L5: 85, L4: 95, L3: 115, L2: 135, L1: 155, W: 28, S: 11 },
  clusterProbability: 0.04,
  clusterWeights:    { H5:  2, H4:  6, H3:  8, H2:  12, H1:  14, L5:  9, L4: 10, L3:  12, L2:  14, L1:  16 },
  clusterMinLen: 5,
  clusterMaxLen: 8,
};

const BR0_WEIGHTS = [
  _BR0_REEL0,
  _BR0_REEL1,
  _BR0_REEL2,
  _BR0_REEL_STD,
  _BR0_REEL_STD,
  _BR0_REEL_STD,
];

// Free-spin strips are flat random (no clustering) — switch spins handle symbol flooding.
// Non-S weights are x10 of the original table so S can be tuned at one-tenth granularity.
const FR0_WEIGHTS = {
  // H reduced ~50% vs original: fewer switch-target cells = lower per-trigger win.
  // W cut from 31→10: natural wilds drive a disproportionate share of FS RTP.
  H5: 4, H4: 4, H3: 9, H2: 13, H1: 17,
  L5: 90, L4: 100, L3: 110, L2: 120, L1: 130,
  W: 10,
  S: 18,
};

const FR1_WEIGHTS = {
  H5: 4, H4: 5, H3: 6, H2: 7, H1: 8,
  L5: 9, L4: 10, L3: 11, L2: 12, L1: 13,
  W: 6,
  S: 2,
};

// Buy-mode strips — decoupled from FR0/FR1 so bonus/super buy RTP can be calibrated
// independently of naturally-triggered FS sessions.

// FR0_BUY: bonus buy (R-mode FS). H and W boosted vs FR0 to push bonus buy toward
// 96% RTP at 100x cost. Natural FS (FR0) is untouched.
// H: 47->79 (+68%), W: 10->28 (+180%) to increase switch win and natural W lines.
const FR0_BUY_WEIGHTS = {
  H5: 7, H4: 8, H3: 15, H2: 22, H1: 27,
  L5: 90, L4: 100, L3: 110, L2: 120, L1: 130,
  W: 28,
  S: 18,
};

// FR1_BUY: super buy (S-mode FS). H reduced 30->20 while L increases by 10 to keep
// total pool = 93 (same as FR1). S and W absolute counts unchanged so retrigger rate
// and natural W wins stay the same; only H density drops (32%->21.5%).
// Target: ~96% RTP at 300x cost.
const FR1_BUY_WEIGHTS = {
  H5: 3, H4: 4, H3: 4, H2: 4, H1: 5,
  L5: 12, L4: 13, L3: 14, L2: 13, L1: 13,
  W: 6,
  S: 2,
};

module.exports = { BR0_WEIGHTS, FR0_WEIGHTS, FR1_WEIGHTS, FR0_BUY_WEIGHTS, FR1_BUY_WEIGHTS };
