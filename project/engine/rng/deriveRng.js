// Builds a full RngInterface (randInt/randRange/randBool/pickFromBag/
// sampleWithoutReplacement/shuffle) on top of any raw uint32 source. Shared by
// localPrng.js (mulberry32) and the backend's remote RNG client (a buffer prefetched
// from BGaming's RNG microservice) so both implementations derive draws identically -
// only the underlying bit source differs. See docs/architecture.md "RNG abstraction".

/**
 * @param {() => number} nextUint32 - returns the next raw unsigned 32-bit integer
 * @returns {import("./rngInterface")} an RngInterface implementation
 */
function createRngFromUint32Source(nextUint32) {
  function nextFloat() {
    return nextUint32() / 0x100000000; // [0, 1)
  }

  function randInt(maxExclusive) {
    if (!(maxExclusive > 0)) {
      throw new RangeError(`randInt: maxExclusive must be > 0, got ${maxExclusive}`);
    }
    return Math.floor(nextFloat() * maxExclusive);
  }

  function randRange(min, maxInclusive) {
    return min + randInt(maxInclusive - min + 1);
  }

  function randBool() {
    return randInt(2) === 0;
  }

  function pickFromBag(bag) {
    if (!bag || bag.length === 0) {
      throw new RangeError("pickFromBag: bag must be non-empty");
    }
    return bag[randInt(bag.length)];
  }

  function sampleWithoutReplacement(pool, count) {
    if (count > pool.length) {
      throw new RangeError(`sampleWithoutReplacement: count (${count}) exceeds pool size (${pool.length})`);
    }
    const remaining = pool.slice();
    const picked = [];
    for (let i = 0; i < count; i++) {
      const idx = randInt(remaining.length);
      picked.push(remaining[idx]);
      remaining.splice(idx, 1);
    }
    return picked;
  }

  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  return { randInt, randRange, randBool, pickFromBag, sampleWithoutReplacement, shuffle };
}

module.exports = { createRngFromUint32Source };
