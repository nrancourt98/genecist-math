'use strict';
// Long-period PRNG for offline simulation: xoshiro128** (period 2^128 - 1), seeded from any
// number of non-negative integer parts via splitmix32-style mixing, so a run can derive an
// independent stream per (job, block, sample) deterministically.
//
// Why not the engine's createLocalPrng: it's mulberry32, whose whole cycle is 2^32 draws - only
// ~17M bonus rounds (~250 draws each). Longer simulations on it just replay that one cycle, so
// they converge on a fixed finite sample instead of the true RTP. createLocalPrng stays as it is
// because generateReels.js builds the reel strips from its exact sequence. Like it, this is never
// used live - production draws come from BGaming's RNG service.

const { createRngFromUint32Source } = require('../project/engine/rng/deriveRng');

function mix32(x) {
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

function rotl(x, k) {
  return (x << k) | (x >>> (32 - k));
}

/** Raw xoshiro128** generator from an explicit 4-word state (exposed for reference-vector tests). */
function xoshiro128ss(s0, s1, s2, s3) {
  return function nextUint32() {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  };
}

/**
 * @param {...number} seedParts - non-negative integers (up to 2^53), e.g. (runSeed, block, sample)
 * @returns {import('../project/engine/rng/rngInterface')}
 */
function createSimPrng(...seedParts) {
  let h = 0x2545f491;
  for (const part of seedParts) {
    if (!Number.isSafeInteger(part) || part < 0) throw new RangeError(`createSimPrng: bad seed part ${part}`);
    h = mix32(h ^ (part >>> 0));
    h = mix32(h ^ Math.floor(part / 0x100000000));
  }
  let sm = h;
  const next = () => mix32((sm = (sm + 0x9e3779b9) | 0));
  const state = [next(), next(), next(), next()];
  if (state.every((w) => w === 0)) state[0] = 1; // all-zero is xoshiro's one fixed point
  return createRngFromUint32Source(xoshiro128ss(...state));
}

/** A seed for runs that didn't ask for a reproducible one. */
function randomSeed() {
  return (Date.now() ^ (process.pid << 10) ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
}

module.exports = { createSimPrng, xoshiro128ss, randomSeed };
