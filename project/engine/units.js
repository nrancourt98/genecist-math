// Internal engine math stays in integer "centi-multiplier" units (multiplierOfBet * 100)
// for the whole lifetime of a round - see docs/game-design-spec.md "Internal unit
// convention". This is the ONLY place floating-point-adjacent division happens, and it's
// meant to be called exactly once per HTTP response boundary, never inside the engine.

/**
 * @param {number} centiMultiplier - integer, e.g. 250 means 2.5x bet
 * @param {number} betCents - the bet amount, in integer currency cents
 * @returns {number} integer currency cents
 */
function centiMultiplierToCents(centiMultiplier, betCents) {
  return Math.round((centiMultiplier * betCents) / 100);
}

module.exports = { centiMultiplierToCents };
