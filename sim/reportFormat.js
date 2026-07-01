function formatPercent(x) {
  return `${(x * 100).toFixed(3)}%`;
}

/**
 * @param {string} mode
 * @param {number} n
 * @param {ReturnType<import("./statsCollector").createStatsCollector>["summary"] extends () => infer R ? R : never} summary
 * @param {number} elapsedMs
 */
function formatReport(mode, n, summary, elapsedMs) {
  return [
    `\n=== ${mode} (${n.toLocaleString()} rounds, ${elapsedMs}ms) ===`,
    `RTP:                         ${formatPercent(summary.rtp)}  (target ~96%)`,
    `Hit rate:                    ${formatPercent(summary.hitRate)}`,
    `Avg win:                     ${summary.avgWinMultiplier.toFixed(3)}x bet`,
    `Win std-dev:                 ${summary.stdDevWinMultiplier.toFixed(3)}x bet`,
    `Switch Spins trigger rate:   ${formatPercent(summary.switchTriggerRate)} of rounds`,
    `  avg spins/sequence:        ${summary.avgSpinsPerSwitchSequence.toFixed(2)}`,
    `  wild/highest-symbol split: ${formatPercent(summary.switchWildShare)} / ${formatPercent(1 - summary.switchWildShare)}`,
    `Free Spins trigger rate (R): ${formatPercent(summary.fsTriggerRateR)} of rounds`,
    `Free Spins trigger rate (S): ${formatPercent(summary.fsTriggerRateS)} of rounds`,
    `Wincap hit rate:             ${formatPercent(summary.wincapRate)} of rounds`,
  ].join("\n");
}

module.exports = { formatReport };
