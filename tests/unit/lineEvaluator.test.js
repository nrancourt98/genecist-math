const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateLines } = require("../../project/engine/wins/lineEvaluator");
const fixtures = require("../fixtures/boards");

test("3-of-a-kind win on line 1", () => {
  const results = evaluateLines(fixtures.threeKindWin());
  assert.equal(results.length, 1);
  assert.deepEqual(results[0], {
    lineIndex: 1,
    symbol: "H5",
    kind: 3,
    payoutCenti: 500,
    positions: [
      { reel: 0, row: 0 },
      { reel: 1, row: 0 },
      { reel: 2, row: 0 },
    ],
  });
});

test("wild substitution extends a real symbol's run", () => {
  const results = evaluateLines(fixtures.wildSubstitutionWin());
  assert.equal(results.length, 1);
  assert.deepEqual(results[0], {
    lineIndex: 1,
    symbol: "H3",
    kind: 4,
    payoutCenti: 400,
    positions: [
      { reel: 0, row: 0 },
      { reel: 1, row: 0 },
      { reel: 2, row: 0 },
      { reel: 3, row: 0 },
    ],
  });
});

test("6 wilds with no non-wild anchor anywhere pay as a pure-wild line (50x)", () => {
  const results = evaluateLines(fixtures.sixWildWin());
  assert.equal(results.length, 1);
  assert.equal(results[0].symbol, "W");
  assert.equal(results[0].kind, 6);
  assert.equal(results[0].payoutCenti, 5000);
});

test("a long wild prefix anchors to the first real symbol it finds, not to whichever symbol would pay best", () => {
  const results = evaluateLines(fixtures.longWildPrefixAnchorsToFirstRealSymbol());
  assert.equal(results.length, 1);
  // 4 bare wilds then L2 -> anchors to L2 (the first non-wild cell), extending the run to
  // 5 (reel 5's NEUTRAL breaks it) -> 5-kind L2 (100 centi), not 4-kind H5.
  assert.deepEqual(results[0], {
    lineIndex: 1,
    symbol: "L2",
    kind: 5,
    payoutCenti: 100,
    positions: [
      { reel: 0, row: 0 },
      { reel: 1, row: 0 },
      { reel: 2, row: 0 },
      { reel: 3, row: 0 },
      { reel: 4, row: 0 },
    ],
  });
});

test("no win anywhere returns an empty array", () => {
  const results = evaluateLines(fixtures.noWin());
  assert.deepEqual(results, []);
});

test("two independent simultaneous wins on different lines are both reported", () => {
  const results = evaluateLines(fixtures.twoSimultaneousWins());
  assert.equal(results.length, 2);

  const line1 = results.find((r) => r.lineIndex === 1);
  const line2 = results.find((r) => r.lineIndex === 2);

  assert.deepEqual(line1, {
    lineIndex: 1,
    symbol: "H4",
    kind: 3,
    payoutCenti: 200,
    positions: [
      { reel: 0, row: 0 },
      { reel: 1, row: 0 },
      { reel: 2, row: 0 },
    ],
  });
  assert.deepEqual(line2, {
    lineIndex: 2,
    symbol: "L1",
    kind: 3,
    payoutCenti: 10,
    positions: [
      { reel: 0, row: 1 },
      { reel: 1, row: 1 },
      { reel: 2, row: 1 },
    ],
  });
});
