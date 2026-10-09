const test = require("node:test");
const assert = require("node:assert/strict");
const { scatterCountDistribution, naturalTriggerProbabilities } = require("../../sim/triggerProbabilities");
const { REELS } = require("../../project/engine/config/reels");

test("scatter count distribution over a real strip sums to 1", () => {
  const dist = scatterCountDistribution(REELS.BR0);
  assert.equal(dist.length, 31); // 0..30 scatters on a 6x5 board
  assert.ok(Math.abs(dist.reduce((a, x) => a + x, 0) - 1) < 1e-12);
});

test("scatter count distribution of a tiny hand-built strip matches a manual count", () => {
  // One reel, three rows, two visible: windows {S,L1} {L1,L1} {L1,S} -> P(0)=1/3, P(1)=2/3.
  const dist = scatterCountDistribution([["S"], ["L1"], ["L1"]], 2);
  assert.deepEqual(dist.map((p) => Math.round(p * 3)), [1, 2, 0]);
});

test("the 94% profile keeps the 96% base trigger rates exactly (scatters are never swapped)", () => {
  assert.deepEqual(naturalTriggerProbabilities("94", "base"), naturalTriggerProbabilities("96", "base"));
});

test("baseplus triggers more often than base", () => {
  const base = naturalTriggerProbabilities("96", "base");
  const plus = naturalTriggerProbabilities("96", "baseplus");
  assert.ok(plus.R > base.R && plus.S > base.S);
});
