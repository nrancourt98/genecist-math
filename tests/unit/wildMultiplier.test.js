const test = require("node:test");
const assert = require("node:assert/strict");
const {
  WILD_MULTIPLIER_BAG,
  rollWildMultiplier,
  assignWildMultipliers,
  computeLineMultiplier,
  buildWinEntries,
} = require("../../project/engine/wins/wildMultiplier");
const { createMockRng } = require("../fixtures/mockRng");
const { createLocalPrng } = require("../../project/engine/rng/localPrng");

test("WILD_MULTIPLIER_BAG has the correct total weight and value set", () => {
  assert.equal(WILD_MULTIPLIER_BAG.length, 305); // 100+50+50+50+30+20+5
  assert.deepEqual(new Set(WILD_MULTIPLIER_BAG), new Set([2, 3, 4, 5, 10, 20, 50]));
});

test("rollWildMultiplier always returns 1 in base game without drawing from rng", () => {
  const rng = createMockRng({}); // empty queues - throws if any method is called
  assert.equal(rollWildMultiplier("base", rng), 1);
});

test("rollWildMultiplier draws from the weighted bag in free-spin modes", () => {
  const rng = createMockRng({ bagPicks: [20] });
  assert.equal(rollWildMultiplier("R", rng), 20);
  const rng2 = createMockRng({ bagPicks: [50] });
  assert.equal(rollWildMultiplier("S", rng2), 50);
});

test("assignWildMultipliers sets wild+multiplier only on W cells, leaves others untouched", () => {
  const board = [
    [{ name: "W" }, { name: "H1" }],
    [{ name: "L2" }, { name: "W" }],
  ];
  const rng = createMockRng({ bagPicks: [10, 5] });
  assignWildMultipliers(board, "R", rng);

  assert.equal(board[0][0].wild, true);
  assert.equal(board[0][0].multiplier, 10);
  assert.equal(board[0][1].wild, undefined);
  assert.equal(board[0][1].multiplier, undefined);
  assert.equal(board[1][0].wild, undefined);
  assert.equal(board[1][1].wild, true);
  assert.equal(board[1][1].multiplier, 5);
});

test("assignWildMultipliers is idempotent - already-assigned W cells are not re-rolled", () => {
  const board = [[{ name: "W", wild: true, multiplier: 7 }]];
  const rng = createMockRng({}); // would throw if a draw were attempted
  assignWildMultipliers(board, "R", rng);
  assert.equal(board[0][0].multiplier, 7);
});

test("assignWildMultipliers sets multiplier 1 for every wild in base game", () => {
  const board = [[{ name: "W" }, { name: "W" }]];
  const rng = createMockRng({});
  assignWildMultipliers(board, "base", rng);
  assert.equal(board[0][0].multiplier, 1);
  assert.equal(board[0][1].multiplier, 1);
});

test("computeLineMultiplier defaults to 1 when no wild participates", () => {
  const board = [[{ name: "H1" }], [{ name: "H1" }], [{ name: "H1" }]];
  const positions = [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 }];
  assert.equal(computeLineMultiplier(positions, board), 1);
});

test("computeLineMultiplier defaults to 1 when the only wild has multiplier exactly 1", () => {
  const board = [[{ name: "W", multiplier: 1 }], [{ name: "H1" }], [{ name: "H1" }]];
  const positions = [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 }];
  assert.equal(computeLineMultiplier(positions, board), 1);
});

test("computeLineMultiplier sums multipliers of every qualifying (>1) wild on the line", () => {
  const board = [
    [{ name: "W", multiplier: 3 }],
    [{ name: "W", multiplier: 5 }],
    [{ name: "H1" }],
  ];
  const positions = [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 }];
  assert.equal(computeLineMultiplier(positions, board), 8);
});

test("computeLineMultiplier ignores a non-qualifying wild (multiplier 1) but counts a qualifying one", () => {
  const board = [
    [{ name: "W", multiplier: 1 }],
    [{ name: "W", multiplier: 10 }],
    [{ name: "H1" }],
  ];
  const positions = [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 }];
  assert.equal(computeLineMultiplier(positions, board), 10);
});

test("buildWinEntries applies the line multiplier on top of the base win and matches the real event shape", () => {
  const board = [
    [{ name: "W", multiplier: 3 }],
    [{ name: "H3" }],
    [{ name: "H3" }],
  ];
  const lineResults = [
    {
      lineIndex: 3,
      symbol: "H3",
      kind: 3,
      payoutCenti: 150,
      positions: [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 }],
    },
  ];
  const entries = buildWinEntries(lineResults, board);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    symbol: "H3",
    kind: 3,
    win: 450, // 150 * 3
    positions: [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 }],
    meta: { lineIndex: 3, multiplier: 3, winWithoutMult: 150, globalMult: 1, lineMultiplier: 3 },
  });
});

test("buildWinEntries leaves win unchanged (multiplier 1) when no qualifying wild is present", () => {
  const board = [[{ name: "H3" }], [{ name: "H3" }], [{ name: "H3" }]];
  const lineResults = [
    {
      lineIndex: 1,
      symbol: "H3",
      kind: 3,
      payoutCenti: 150,
      positions: [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 }],
    },
  ];
  const entries = buildWinEntries(lineResults, board);
  assert.equal(entries[0].win, 150);
  assert.equal(entries[0].meta.multiplier, 1);
});

test("rollWildMultiplier distribution roughly matches the documented weights over many draws (statistical sanity check)", () => {
  const rng = createLocalPrng(99);
  const counts = {};
  const total = 50000;
  for (let i = 0; i < total; i++) {
    const value = rollWildMultiplier("R", rng);
    counts[value] = (counts[value] || 0) + 1;
  }
  // 2x should be the most common outcome at ~32.8% (100/305)
  const ratio2x = counts[2] / total;
  assert.ok(ratio2x > 0.30 && ratio2x < 0.36, `2x ratio ${ratio2x} not close to expected ~0.328`);
  // 50x should be the rarest outcome at ~1.6% (5/305)
  const ratio50x = counts[50] / total;
  assert.ok(ratio50x > 0.008 && ratio50x < 0.028, `50x ratio ${ratio50x} not close to expected ~0.016`);
});
