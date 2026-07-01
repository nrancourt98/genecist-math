// god_data lets a developer script deterministic RNG outcomes for testing - see
// docs/bgaming-compliance.md "GodMode". Must be ignored entirely outside of explicit
// opt-in; the reference sample backend does NOT gate this, which the docs call out as a
// known gap in that stub - this implementation adds the gate explicitly.
//
// BGaming's documented shape is a single override value, e.g. {"random": 2}, repeated
// for every draw the request makes. We extend that (our own choice, not a BGaming
// requirement - see docs/architecture.md's judgment-call log) to also accept an array,
// drained sequentially one raw value per rng call and holding its last entry once
// exhausted, so a test can script more than one decision per request.

const { createRngFromUint32Source } = require("../../engine");

const ENABLED = process.env.ENABLE_GOD_MODE === "1";

/**
 * @param {{random?: number|number[]}|undefined} godData - the `god_data` request param
 * @returns {import("../../engine/rng/rngInterface")|null} a scripted RngInterface if
 *   godData carries an override AND god mode is enabled, otherwise null (caller should
 *   fall back to the real RNG service).
 */
function maybeCreateGodRng(godData) {
  if (!ENABLED || !godData || godData.random === undefined) return null;

  const values = Array.isArray(godData.random) ? godData.random : [godData.random];
  let cursor = 0;

  function nextUint32() {
    const value = values[Math.min(cursor, values.length - 1)];
    cursor += 1;
    return value >>> 0;
  }

  return createRngFromUint32Source(nextUint32);
}

module.exports = { maybeCreateGodRng, ENABLED };
