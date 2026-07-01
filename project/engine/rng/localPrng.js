// Fast, synchronous, seedable PRNG implementing the RngInterface contract (see
// rngInterface.js). Not cryptographically secure - intentionally so, since this is only
// ever used for offline simulation and deterministic tests, never for live
// RTP-affecting decisions (those go through BGaming's RNG microservice).

const { createRngFromUint32Source } = require("./deriveRng");

/**
 * @param {number} [seed]
 * @returns {import("./rngInterface")} an RngInterface implementation
 */
function createLocalPrng(seed = (Date.now() ^ 0x9e3779b9) >>> 0) {
  let state = seed >>> 0;

  // mulberry32
  function nextUint32() {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  return createRngFromUint32Source(nextUint32);
}

module.exports = { createLocalPrng };
