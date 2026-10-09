const test = require("node:test");
const assert = require("node:assert/strict");
const { createSimPrng, xoshiro128ss } = require("../../sim/simPrng");

test("xoshiro128** core matches the reference output for state {1, 2, 3, 4}", () => {
  const next = xoshiro128ss(1, 2, 3, 4);
  const reference = [11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597, 4258142804];
  assert.deepEqual(Array.from({ length: reference.length }, next), reference);
});

test("createSimPrng is deterministic per seed parts and differs across them", () => {
  const draw = (...seed) => { const rng = createSimPrng(...seed); return Array.from({ length: 8 }, () => rng.randInt(1e9)); };
  assert.deepEqual(draw(7, 1, 2), draw(7, 1, 2));
  assert.notDeepEqual(draw(7, 1, 2), draw(7, 1, 3));
  assert.notDeepEqual(draw(7, 1, 2), draw(7, 2, 1));
  assert.notDeepEqual(draw(2 ** 40), draw(2 ** 40 + 1)); // high bits of a part count too
});

test("createSimPrng rejects seed parts that aren't non-negative safe integers", () => {
  for (const bad of [-1, 1.5, NaN, 2 ** 60]) assert.throws(() => createSimPrng(bad), /bad seed part/);
});
