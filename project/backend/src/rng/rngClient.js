// Prefetches a batch of raw u32 numbers from BGaming's RNG microservice in one network
// call, then serves the engine's synchronous RngInterface draws from that buffer - see
// docs/architecture.md "RNG abstraction" and docs/bgaming-compliance.md "RNG". The
// engine itself never awaits anything; playHandler.js calls createRemoteRng() and waits
// for the prefetch to land *before* invoking resolveOneSpin.
//
// randInt/randRange/randBool/pickFromBag are trivially derived from a single raw u32
// each, so they're served straight from the buffer. sampleWithoutReplacement/shuffle are
// derived locally too (via the same shared deriveRng math localPrng.js uses) rather than
// calling the RNG service's own separate "sample"/"shuffle" methods - this keeps the
// round-trip count at exactly one network call per spin instead of one per feature
// decision, while every underlying bit still genuinely originates from the RNG service.

const crypto = require("crypto");
const { createRngFromUint32Source } = require("../../../engine");

const RNG_URL = process.env.RNG_URL || "http://localhost:4002/api";

// Generous headroom over a single spin's worst-realistic draw count (board draw: 6,
// natural wild-multiplier rolls: a handful, one switch drop + award resolution: ~6,
// padding positions: 6). Refilled once per HTTP `play` call, never mid-spin - if a spin
// ever needs more than this, nextUint32() throws loudly rather than silently wrapping.
const DEFAULT_BATCH_SIZE = 128;

async function fetchRandomBatch(qty) {
  const response = await fetch(RNG_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "rand",
      params: { type: "u32", qty },
    }),
  });
  const body = await response.json();
  if (!Array.isArray(body.result) || body.result.length !== qty) {
    throw new Error(`rngClient: RNG service returned an unexpected "rand" result: ${JSON.stringify(body)}`);
  }
  return body.result;
}

/**
 * @param {number} [qty]
 * @returns {Promise<import("../../../engine/rng/rngInterface")>} a synchronous
 *   RngInterface backed by a prefetched buffer of RNG-service-sourced numbers.
 */
async function createRemoteRng(qty = DEFAULT_BATCH_SIZE) {
  const buffer = await fetchRandomBatch(qty);
  let cursor = 0;

  function nextUint32() {
    if (cursor >= buffer.length) {
      throw new Error("rngClient: prefetched RNG buffer exhausted mid-spin - increase DEFAULT_BATCH_SIZE");
    }
    return buffer[cursor++];
  }

  return createRngFromUint32Source(nextUint32);
}

module.exports = { createRemoteRng, RNG_URL, DEFAULT_BATCH_SIZE };
