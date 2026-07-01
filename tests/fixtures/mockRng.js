// A scripted RngInterface for deterministic tests: each method pulls its next return
// value from a queue supplied up front, in the exact order the code under test is
// expected to call it. Throws loudly if a queue runs dry, so a test fails clearly when
// it under-specifies how many draws the code under test actually makes, rather than
// silently returning undefined.

function createMockRng({ randInts = [], randRanges = [], randBools = [], bagPicks = [], samples = [] } = {}) {
  const randIntQueue = randInts.slice();
  const randRangeQueue = randRanges.slice();
  const randBoolQueue = randBools.slice();
  const bagPickQueue = bagPicks.slice();
  const sampleQueue = samples.slice();

  function takeFrom(queue, label) {
    if (queue.length === 0) {
      throw new Error(`mockRng: ${label} queue exhausted - test under-specified the expected draws`);
    }
    return queue.shift();
  }

  return {
    randInt(maxExclusive) {
      const value = takeFrom(randIntQueue, "randInt");
      if (value < 0 || value >= maxExclusive) {
        throw new Error(`mockRng: queued randInt ${value} is out of range [0, ${maxExclusive})`);
      }
      return value;
    },
    randRange(min, maxInclusive) {
      const value = takeFrom(randRangeQueue, "randRange");
      if (value < min || value > maxInclusive) {
        throw new Error(`mockRng: queued randRange ${value} is out of range [${min}, ${maxInclusive}]`);
      }
      return value;
    },
    randBool() {
      return takeFrom(randBoolQueue, "randBool");
    },
    pickFromBag(bag) {
      const value = takeFrom(bagPickQueue, "pickFromBag");
      if (!bag.includes(value)) {
        throw new Error(`mockRng: queued pickFromBag value ${value} is not in the supplied bag`);
      }
      return value;
    },
    sampleWithoutReplacement(pool, count) {
      const value = takeFrom(sampleQueue, "sampleWithoutReplacement");
      if (value.length !== count) {
        throw new Error(`mockRng: queued sample has length ${value.length}, expected ${count}`);
      }
      return value;
    },
    shuffle(arr) {
      return arr.slice();
    },
  };
}

module.exports = { createMockRng };
