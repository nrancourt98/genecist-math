// Aggregates per-round outcomes into running statistics for the RTP/feature-frequency
// report. One collector per bet mode - each mode's cost differs, so RTP/hit-rate are not
// comparable across modes without separate aggregation. See docs/architecture.md
// "Offline simulation / RTP CLI".

/** @param {number} costCenti - this mode's round cost, in centi-multiplier units (BET_MODE_COST_MULTIPLIER * 100) */
function createStatsCollector(costCenti) {
  let rounds = 0;
  let totalWinCenti = 0;
  let totalWinCentiSquared = 0; // for stddev via E[X^2] - E[X]^2
  let roundsWithWin = 0;

  let switchSequencesTriggered = 0;
  let switchSpinsSteps = 0;
  let switchWildSequences = 0;
  let switchHighestSequences = 0;

  let fsTriggeredR = 0;
  let fsTriggeredS = 0;
  let wincapHits = 0;

  /**
   * @param {{winCenti: number, switchSequenceCount: number, switchSpinsSteps: number,
   *   switchWildCount: number, switchHighestCount: number, fsTriggerMode: "R"|"S"|null,
   *   hitWincap: boolean}} outcome - see sim/simulate.js's simulateOneRound
   */
  function recordRound(outcome) {
    rounds += 1;
    totalWinCenti += outcome.winCenti;
    totalWinCentiSquared += outcome.winCenti * outcome.winCenti;
    if (outcome.winCenti > 0) roundsWithWin += 1;

    switchSequencesTriggered += outcome.switchSequenceCount;
    switchSpinsSteps += outcome.switchSpinsSteps;
    switchWildSequences += outcome.switchWildCount;
    switchHighestSequences += outcome.switchHighestCount;

    if (outcome.fsTriggerMode === "R") fsTriggeredR += 1;
    else if (outcome.fsTriggerMode === "S") fsTriggeredS += 1;

    if (outcome.hitWincap) wincapHits += 1;
  }

  function summary() {
    const meanWinCenti = rounds > 0 ? totalWinCenti / rounds : 0;
    const varianceWinCenti = rounds > 0 ? totalWinCentiSquared / rounds - meanWinCenti * meanWinCenti : 0;
    const stdDevWinCenti = Math.sqrt(Math.max(0, varianceWinCenti));
    const switchWildOrHighest = switchWildSequences + switchHighestSequences;

    return {
      rounds,
      rtp: rounds > 0 ? totalWinCenti / (rounds * costCenti) : 0,
      hitRate: rounds > 0 ? roundsWithWin / rounds : 0,
      avgWinMultiplier: meanWinCenti / 100,
      stdDevWinMultiplier: stdDevWinCenti / 100,
      switchTriggerRate: rounds > 0 ? switchSequencesTriggered / rounds : 0,
      avgSpinsPerSwitchSequence: switchSequencesTriggered > 0 ? switchSpinsSteps / switchSequencesTriggered : 0,
      switchWildShare: switchWildOrHighest > 0 ? switchWildSequences / switchWildOrHighest : 0,
      fsTriggerRateR: rounds > 0 ? fsTriggeredR / rounds : 0,
      fsTriggerRateS: rounds > 0 ? fsTriggeredS / rounds : 0,
      wincapRate: rounds > 0 ? wincapHits / rounds : 0,
    };
  }

  return { recordRound, summary };
}

module.exports = { createStatsCollector };
