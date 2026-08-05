// Ported verbatim from game_config.py:32-84 (GameConfig.paytable dict).
// See docs/game-design-spec.md "Paytable" and "Internal unit convention".
//
// Values below are decimal multiplier-of-bet, exactly as in the Python source. They are
// converted once, at module load, into integer "centi-multiplier" units (decimal * 100)
// so the rest of the engine never does runtime float multiplication.

const PAYTABLE_DECIMAL = {
  W: { 6: 30 }, // wild pays only on 6-of-a-kind; no 3/4/5-kind entry exists
  H5: { 3: 5, 4: 10, 5: 20, 6: 30 },
  H4: { 3: 2, 4: 5, 5: 12.5, 6: 25 },
  H3: { 3: 1.5, 4: 4, 5: 10, 6: 20 },
  H2: { 3: 1, 4: 2.5, 5: 7.5, 6: 15 },
  H1: { 3: 1, 4: 2.5, 5: 7.5, 6: 15 },
  L5: { 3: 0.3, 4: 1, 5: 3, 6: 7.5 },
  L4: { 3: 0.2, 4: 0.6, 5: 2, 6: 5 },
  L3: { 3: 0.2, 4: 0.6, 5: 2, 6: 5 },
  L2: { 3: 0.1, 4: 0.3, 5: 1, 6: 2.5 },
  L1: { 3: 0.1, 4: 0.3, 5: 1, 6: 2.5 },
};

const PAYTABLE_CENTI = {};
for (const [symbol, kinds] of Object.entries(PAYTABLE_DECIMAL)) {
  PAYTABLE_CENTI[symbol] = {};
  for (const [kind, decimalMultiplier] of Object.entries(kinds)) {
    PAYTABLE_CENTI[symbol][kind] = Math.round(decimalMultiplier * 100);
  }
}

/**
 * @param {number} kind - run length (3-6)
 * @param {string} symbol - symbol name
 * @returns {number|undefined} centi-multiplier payout, or undefined if no such paytable entry
 */
function getPayoutCenti(kind, symbol) {
  const bySymbol = PAYTABLE_CENTI[symbol];
  if (!bySymbol) return undefined;
  return bySymbol[kind];
}

module.exports = { PAYTABLE_CENTI, getPayoutCenti };
