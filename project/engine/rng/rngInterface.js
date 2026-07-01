// Synchronous RNG contract every engine module depends on (never Math.random() or a
// network call directly - see docs/architecture.md "RNG abstraction").
//
// Two implementations satisfy this contract:
// - localPrng.js: fast synchronous PRNG, used by the simulation CLI and tests.
// - backend/src/rng/rngClient.js: prefetches a batch from BGaming's RNG microservice and
//   serves draws synchronously from that buffer, so the engine itself never awaits
//   anything mid-spin.
//
// @typedef {object} RngInterface
// @property {(maxExclusive: number) => number} randInt - integer in [0, maxExclusive)
// @property {(min: number, maxInclusive: number) => number} randRange - integer in [min, maxInclusive]
// @property {() => boolean} randBool - uniform true/false
// @property {(bag: any[]) => any} pickFromBag - uniform pick of one element from a literal
//   (possibly weighted-by-repetition) array; mirrors Python's random.choice
// @property {(pool: any[], count: number) => any[]} sampleWithoutReplacement - mirrors
//   Python's random.sample
// @property {(arr: any[]) => any[]} shuffle - returns a new shuffled array, source untouched

module.exports = {};
