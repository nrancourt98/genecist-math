const test = require("node:test");
const assert = require("node:assert/strict");
const { createLocalPrng } = require("../../project/engine/rng/localPrng");

test("randInt always stays within [0, max)", () => {
  const rng = createLocalPrng(1);
  for (let i = 0; i < 10000; i++) {
    const value = rng.randInt(6);
    assert.ok(value >= 0 && value < 6, `value ${value} out of range`);
  }
});

test("randInt is deterministic given the same seed", () => {
  const a = createLocalPrng(123).randInt(1000);
  const b = createLocalPrng(123).randInt(1000);
  assert.equal(a, b);
});

test("randRange stays within [min, maxInclusive] inclusive of both ends", () => {
  const rng = createLocalPrng(2);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const value = rng.randRange(1, 10);
    assert.ok(value >= 1 && value <= 10);
    seen.add(value);
  }
  // with 5000 draws over 10 possible values, every value should have appeared at least once
  assert.equal(seen.size, 10);
});

test("pickFromBag only ever returns elements present in the bag", () => {
  const rng = createLocalPrng(3);
  const bag = [1, 1, 1, 2, 2, 3];
  for (let i = 0; i < 1000; i++) {
    assert.ok(bag.includes(rng.pickFromBag(bag)));
  }
});

test("sampleWithoutReplacement never returns duplicates and respects pool/count", () => {
  const rng = createLocalPrng(4);
  const pool = ["L1", "L2", "L3", "L4", "L5", "H1", "H2", "H3", "H4"];
  for (let i = 0; i < 500; i++) {
    const count = 1 + (i % 4); // 1..4
    const sample = rng.sampleWithoutReplacement(pool, count);
    assert.equal(sample.length, count);
    assert.equal(new Set(sample).size, count, "sample contained a duplicate");
    for (const item of sample) assert.ok(pool.includes(item));
  }
});

test("sampleWithoutReplacement throws if count exceeds pool size", () => {
  const rng = createLocalPrng(5);
  assert.throws(() => rng.sampleWithoutReplacement(["a", "b"], 3));
});

test("shuffle returns every original element exactly once, in a new array", () => {
  const rng = createLocalPrng(6);
  const original = [1, 2, 3, 4, 5];
  const shuffled = rng.shuffle(original);
  assert.notEqual(shuffled, original); // different array instance
  assert.deepEqual([...shuffled].sort(), [1, 2, 3, 4, 5]);
});

test("randBool returns roughly balanced true/false over many draws", () => {
  const rng = createLocalPrng(7);
  let trueCount = 0;
  const total = 20000;
  for (let i = 0; i < total; i++) {
    if (rng.randBool()) trueCount++;
  }
  const ratio = trueCount / total;
  assert.ok(ratio > 0.47 && ratio < 0.53, `randBool ratio ${ratio} not close to 0.5`);
});
