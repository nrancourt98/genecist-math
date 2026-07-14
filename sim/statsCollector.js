// Aggregates per-round outcomes into running statistics for the RTP / feature-frequency
// report. Designed to be mergeable across parallel worker threads — getRawTotals() /
// mergeRawTotals() let the main thread combine N workers' results before calling summary().

// Win distribution bucket upper edges in centi-multiplier units (100 centi = 1× bet).
// Bucket 0: exactly zero. Buckets 1–11: the ranges below. Bucket 12: > 5000× (wincap zone).
const BUCKET_UPPER_CENTI = [100, 200, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 500000];
const NUM_BUCKETS = BUCKET_UPPER_CENTI.length + 2; // 13

const BUCKET_LABELS = [
  "        Zero",
  "      < 1×  ",
  "    1× – 2× ",
  "    2× – 5× ",
  "   5× – 10× ",
  "  10× – 25× ",
  "  25× – 50× ",
  " 50× – 100× ",
  "100× – 250× ",
  "250× – 500× ",
  "500× – 1000×",
  "1000×– 5000×",
  "    > 5000× ",
];

function getBucket(winCenti) {
  if (winCenti === 0) return 0;
  for (let i = 0; i < BUCKET_UPPER_CENTI.length; i++) {
    if (winCenti <= BUCKET_UPPER_CENTI[i]) return i + 1;
  }
  return NUM_BUCKETS - 1;
}

/** @param {number} costCenti - this mode's round cost in centi-multiplier units */
function createStatsCollector(costCenti) {
  const t = {
    costCenti,
    rounds:                   0,
    totalWinCenti:            0,
    totalWinCentiSq:          0,
    roundsWithWin:            0,
    maxWinCenti:              0,

    totalBasegameWinCenti:    0,
    totalFreegameWinCenti:    0,
    roundsWithFreeSpins:      0,   // rounds that entered freespins (any mode, any entry)
    fsRTriggers:              0,   // natural R-mode triggers (base/baseplus only)
    fsSTriggers:              0,   // natural S-mode triggers (base/baseplus only)
    fsRoundsEnteredR:         0,   // rounds that entered R-mode (natural + bonus buy)
    fsRetriggerRounds:        0,   // rounds containing at least one same-mode retrigger
    fsUpgradeRounds:          0,   // rounds where R upgraded to S mid-feature

    switchSeqCount:           0,   // total sequences triggered across all rounds
    switchSpinsSteps:         0,   // total updateSwitchSpins events (= spins awarded)
    switchWildSeqs:           0,
    switchHighestSeqs:        0,
    switchSymbolsTotal:       0,   // sum of maxSwitchSymbols for rounds that had a sequence
    switchRoundsWithSeq:      0,   // rounds that had at least one sequence

    wincapHits:               0,
    winBuckets:               new Array(NUM_BUCKETS).fill(0),
  };

  function recordRound(outcome) {
    t.rounds++;
    t.totalWinCenti    += outcome.winCenti;
    t.totalWinCentiSq  += outcome.winCenti * outcome.winCenti;
    if (outcome.winCenti > 0) t.roundsWithWin++;
    if (outcome.winCenti > t.maxWinCenti) t.maxWinCenti = outcome.winCenti;

    t.totalBasegameWinCenti += outcome.basegameWinCenti;
    t.totalFreegameWinCenti += outcome.freegameWinCenti;

    if (outcome.hadFreeSpins)    t.roundsWithFreeSpins++;
    if (outcome.fsTriggerMode === "R") t.fsRTriggers++;
    if (outcome.fsTriggerMode === "S") t.fsSTriggers++;
    if (outcome.enteredRMode)    t.fsRoundsEnteredR++;
    if (outcome.hadFsRetrigger)  t.fsRetriggerRounds++;
    if (outcome.hadFsUpgrade)    t.fsUpgradeRounds++;

    t.switchSeqCount    += outcome.switchSequenceCount;
    t.switchSpinsSteps  += outcome.switchSpinsSteps;
    t.switchWildSeqs    += outcome.switchWildCount;
    t.switchHighestSeqs += outcome.switchHighestCount;
    if (outcome.switchSequenceCount > 0) {
      t.switchSymbolsTotal  += outcome.maxSwitchSymbols;
      t.switchRoundsWithSeq++;
    }

    if (outcome.hitWincap) t.wincapHits++;
    t.winBuckets[getBucket(outcome.winCenti)]++;
  }

  function getRawTotals() {
    return { ...t, winBuckets: [...t.winBuckets] };
  }

  function mergeRawTotals(other) {
    for (const key of Object.keys(t)) {
      if (key === "costCenti") continue;
      if (key === "maxWinCenti") { if (other.maxWinCenti > t.maxWinCenti) t.maxWinCenti = other.maxWinCenti; }
      else if (key === "winBuckets") { for (let i = 0; i < t.winBuckets.length; i++) t.winBuckets[i] += other.winBuckets[i]; }
      else t[key] += other[key];
    }
  }

  function summary() {
    const n = t.rounds;
    if (n === 0) return null;
    const meanCenti = t.totalWinCenti / n;
    const variance  = t.totalWinCentiSq / n - meanCenti * meanCenti;
    const swOrH     = t.switchWildSeqs + t.switchHighestSeqs;

    return {
      rounds:   n,
      rtp:      t.totalWinCenti / (n * t.costCenti),
      hitRate:  t.roundsWithWin / n,

      avgWinMultiplier:    meanCenti / 100,
      stdDevWinMultiplier: Math.sqrt(Math.max(0, variance)) / 100,
      maxWinMultiplier:    t.maxWinCenti / 100,

      basegameRtpShare: t.totalWinCenti > 0 ? t.totalBasegameWinCenti / t.totalWinCenti : 0,
      freegameRtpShare: t.totalWinCenti > 0 ? t.totalFreegameWinCenti / t.totalWinCenti : 0,

      fsTriggerRate:    t.roundsWithFreeSpins / n,
      fsRTriggerRate:   t.fsRTriggers / n,
      fsSTriggerRate:   t.fsSTriggers / n,
      fsRetriggerRate:  t.roundsWithFreeSpins > 0 ? t.fsRetriggerRounds / t.roundsWithFreeSpins : 0,
      fsUpgradeRate:    t.fsRoundsEnteredR   > 0 ? t.fsUpgradeRounds   / t.fsRoundsEnteredR   : null,
      avgFsWinMult:     t.roundsWithFreeSpins > 0 ? t.totalFreegameWinCenti / t.roundsWithFreeSpins / 100 : 0,

      switchTriggerRate:     t.switchSeqCount / n,
      avgSpinsPerSeq:        t.switchSeqCount > 0 ? t.switchSpinsSteps / t.switchSeqCount : 0,
      switchWildShare:       swOrH > 0 ? t.switchWildSeqs / swOrH : 0,
      avgPeakSwitchSymbols:  t.switchRoundsWithSeq > 0 ? t.switchSymbolsTotal / t.switchRoundsWithSeq : 0,

      wincapRate:  t.wincapHits / n,
      winBuckets:  [...t.winBuckets],
    };
  }

  return { recordRound, getRawTotals, mergeRawTotals, summary };
}

module.exports = { createStatsCollector, BUCKET_LABELS, NUM_BUCKETS };
