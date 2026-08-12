const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createInitialSwitchState,
  maybeDropSwitch,
  resolveSwitchAward,
  applySwitchReplacement,
} = require("../../project/engine/features/switchSpins");
const { createMockRng } = require("../fixtures/mockRng");
const { createLocalPrng } = require("../../project/engine/rng/localPrng");

test("createInitialSwitchState starts with no active sequence", () => {
  assert.deepEqual(createInitialSwitchState(), { spins: 0, symbols: [], wild: null });
});

test("maybeDropSwitch: base mode (no active sequence) drops on an INITIAL-rate hit and picks a reel/row", () => {
  const state = createInitialSwitchState(); // spins=0 -> uses INITIAL_DROP_CHANCE_ONE_IN
  const rng = createMockRng({ randInts: [0, 2, 3] }); // drop check=0 (hit), reel=2, row=3
  assert.deepEqual(maybeDropSwitch(state, "base", rng), { reel: 2, row: 3 });
});

test("maybeDropSwitch: base mode does not drop on a miss, and never draws reel/row", () => {
  const state = createInitialSwitchState();
  const rng = createMockRng({ randInts: [1] }); // miss - only one draw expected
  assert.equal(maybeDropSwitch(state, "base", rng), null);
});

test("maybeDropSwitch: R-mode (no active sequence) uses its own INITIAL rate", () => {
  const state = createInitialSwitchState();
  const rng = createMockRng({ randInts: [0, 1, 4] });
  assert.deepEqual(maybeDropSwitch(state, "R", rng), { reel: 1, row: 4 });
});

test("maybeDropSwitch: S-mode (no active sequence) uses its own INITIAL rate", () => {
  const state = createInitialSwitchState();
  const rng = createMockRng({ randInts: [0, 5, 0] });
  assert.deepEqual(maybeDropSwitch(state, "S", rng), { reel: 5, row: 0 });
});

test("maybeDropSwitch: switches to the (much rarer) RESTACK rate once a sequence is already active", () => {
  const state = { spins: 4, symbols: ["L1"], wild: true }; // spins > 0 -> active sequence
  const rng = createMockRng({ randInts: [0, 0, 0] }); // 0 is valid against any denominator - confirms no crash/mismatch picking the table
  assert.deepEqual(maybeDropSwitch(state, "base", rng), { reel: 0, row: 0 });
});

test("maybeDropSwitch: base mode blocks drops once 9 symbols accumulated, without drawing", () => {
  const state = { spins: 1, symbols: ["L1", "L2", "L3", "L4", "L5", "H1", "H2", "H3", "H4"], wild: true };
  const rng = createMockRng({}); // would throw on any draw
  assert.equal(maybeDropSwitch(state, "base", rng), null);
});

test("maybeDropSwitch: S-mode blocks drops once 9 symbols accumulated, without drawing", () => {
  const state = { spins: 1, symbols: ["L1", "L2", "L3", "L4", "L5", "H1", "H2", "H3", "H4"], wild: true };
  const rng = createMockRng({});
  assert.equal(maybeDropSwitch(state, "S", rng), null);
});

test("maybeDropSwitch: R-mode has NO cap - still draws and can drop even with all 9 symbols accumulated", () => {
  const state = { spins: 1, symbols: ["L1", "L2", "L3", "L4", "L5", "H1", "H2", "H3", "H4"], wild: true };
  const rng = createMockRng({ randInts: [0, 3, 2] });
  assert.deepEqual(maybeDropSwitch(state, "R", rng), { reel: 3, row: 2 });
});

test("resolveSwitchAward: first drop of a sequence rolls wild persistence, spins, and target symbols", () => {
  const state = createInitialSwitchState();
  // randInt(3)===0 → wild=true; bagPicks: spins=3, numToAdd=1, then weightedSampleSymbols pick
  const rng = createMockRng({ randInts: [0], bagPicks: [3, 1, "L3"] });
  const result = resolveSwitchAward(state, "base", rng);

  assert.equal(result.wild, true);
  assert.equal(result.spinsAwarded, 3);
  assert.deepEqual(result.symbols, ["L3"]);
  assert.equal(result.totalSpins, 3);
  assert.deepEqual(state, { spins: 3, symbols: ["L3"], wild: true });
});

test("resolveSwitchAward: a stacking drop mid-sequence does not re-roll wild persistence", () => {
  const state = { spins: 2, symbols: ["L3"], wild: true };
  // No randInts queued - would throw if code incorrectly tried to re-roll wild.
  // Third bagPick is weightedSampleSymbols picking the new symbol.
  const rng = createMockRng({ bagPicks: [1, 1, "H2"] });
  const result = resolveSwitchAward(state, "base", rng);

  assert.equal(result.wild, true); // unchanged
  assert.equal(result.spinsAwarded, 1);
  assert.deepEqual(result.symbols, ["L3", "H2"]);
  assert.equal(result.totalSpins, 3); // 2 + 1
});

test("resolveSwitchAward: numToAdd is clamped to the remaining available pool", () => {
  // 8 of the 9 eligible symbols already chosen - only "H4" remains available.
  const state = { spins: 0, symbols: ["L1", "L2", "L3", "L4", "L5", "H1", "H2", "H3"], wild: null };
  // randInt(3)→1 (wild=false); bagPicks: spins=2, numToAdd=3 (clamped to 1), then weightedSample pick
  const rng = createMockRng({ randInts: [1], bagPicks: [2, 3, "H4"] });
  const result = resolveSwitchAward(state, "base", rng);

  assert.equal(result.symbols.length, 9);
  assert.ok(result.symbols.includes("H4"));
});

test("resolveSwitchAward: adds zero new symbols once the pool is fully exhausted (R-mode's no-cap path)", () => {
  const allNine = ["L1", "L2", "L3", "L4", "L5", "H1", "H2", "H3", "H4"];
  const state = { spins: 0, symbols: allNine.slice(), wild: null };
  // R-mode: WILD_CHANCE_ONE_IN.R=0 → no wild roll at all (short-circuit, no RNG draw).
  // No third bagPick - weightedSampleSymbols is skipped entirely when available=[].
  const rng = createMockRng({ bagPicks: [2, 3] });
  const result = resolveSwitchAward(state, "R", rng);

  assert.deepEqual(result.symbols, allNine); // unchanged - nothing left to add
  assert.equal(result.spinsAwarded, 2);
});

test("resolveSwitchAward: S-mode draws from its own (slightly different) spins-award bag", () => {
  const state = createInitialSwitchState();
  // S-mode: WILD_CHANCE_ONE_IN.S=0 → no wild roll. Third pick is weightedSampleSymbols.
  const rng = createMockRng({ bagPicks: [7, 1, "L1"] });
  const result = resolveSwitchAward(state, "S", rng);
  assert.equal(result.spinsAwarded, 7); // valid in the S-mode bag
});

test("applySwitchReplacement: no-op when no switch symbols are active yet", () => {
  const board = [[{ name: "L1" }]];
  const changes = applySwitchReplacement(board, { spins: 0, symbols: [], wild: true });
  assert.deepEqual(changes, []);
  assert.equal(board[0][0].name, "L1");
});

test("applySwitchReplacement: replaces every matching cell with W when wild=true", () => {
  const board = [
    [{ name: "L2" }, { name: "H1" }],
    [{ name: "L2" }, { name: "L2" }],
  ];
  const changes = applySwitchReplacement(board, { spins: 1, symbols: ["L2"], wild: true });

  assert.equal(board[0][0].name, "W");
  assert.equal(board[0][1].name, "H1"); // untouched
  assert.equal(board[1][0].name, "W");
  assert.equal(board[1][1].name, "W");
  assert.equal(changes.length, 3);
  assert.ok(changes.every((c) => c.symbol === "W"));
});

test("applySwitchReplacement: replaces every matching cell with H5 when wild=false, across multiple target symbols", () => {
  const board = [
    [{ name: "L4" }, { name: "H2" }],
    [{ name: "H2" }, { name: "L1" }],
  ];
  const changes = applySwitchReplacement(board, { spins: 1, symbols: ["L4", "H2"], wild: false });

  assert.equal(board[0][0].name, "H5");
  assert.equal(board[0][1].name, "H5");
  assert.equal(board[1][0].name, "H5");
  assert.equal(board[1][1].name, "L1"); // untouched
  assert.equal(changes.length, 3);
  assert.ok(changes.every((c) => c.symbol === "H5"));
});

test("statistical: maybeDropSwitch base-mode INITIAL drop rate converges to ~1/200 over many trials", () => {
  const { INITIAL_DROP_CHANCE_ONE_IN } = require("../../project/engine/config/switchTables");
  const rng = createLocalPrng(11);
  let drops = 0;
  const total = 600000;
  for (let i = 0; i < total; i++) {
    const state = createInitialSwitchState();
    if (maybeDropSwitch(state, "base", rng)) drops++;
  }
  const expected = 1 / INITIAL_DROP_CHANCE_ONE_IN.base;
  const ratio = drops / total;
  assert.ok(
    ratio > expected * 0.8 && ratio < expected * 1.2,
    `drop ratio ${ratio} not close to expected ~${expected}`
  );
});

test("statistical: maybeDropSwitch base-mode RESTACK drop rate (active sequence) converges to its own, much rarer ratio", () => {
  const { RESTACK_DROP_CHANCE_ONE_IN } = require("../../project/engine/config/switchTables");
  const rng = createLocalPrng(13);
  let drops = 0;
  const total = 600000;
  for (let i = 0; i < total; i++) {
    const state = { spins: 1, symbols: ["L1"], wild: true };
    if (maybeDropSwitch(state, "base", rng)) drops++;
  }
  const expected = 1 / RESTACK_DROP_CHANCE_ONE_IN.base;
  const ratio = drops / total;
  assert.ok(
    ratio > expected * 0.7 && ratio < expected * 1.3,
    `drop ratio ${ratio} not close to expected ~${expected}`
  );
});

test("statistical: spins-award bag (base) produces 1 about 40% of the time, matching its 4/10 weight", () => {
  const rng = createLocalPrng(12);
  const { SPINS_AWARD_BAG_BASE_AND_R } = require("../../project/engine/config/switchTables");
  let onesCount = 0;
  const total = 50000;
  for (let i = 0; i < total; i++) {
    if (rng.pickFromBag(SPINS_AWARD_BAG_BASE_AND_R) === 1) onesCount++;
  }
  const ratio = onesCount / total;
  assert.ok(ratio > 0.35 && ratio < 0.45, `ratio ${ratio} not close to expected ~0.4 (4/10)`);
});
