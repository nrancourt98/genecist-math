const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BET_MODE_COST_MULTIPLIER,
  VALID_BET_MODES,
  createInitialRoundState,
  isFreshRound,
} = require("../../project/engine/spin/roundState");

test("createInitialRoundState rejects an unknown bet mode", () => {
  assert.throws(() => createInitialRoundState("nope", 100), /Unknown bet mode/);
});

test("base mode starts in the base phase with no free-spin state", () => {
  const state = createInitialRoundState("base", 100);
  assert.equal(state.betMode, "base");
  assert.equal(state.betAmountCents, 100);
  assert.equal(state.phase, "base");
  assert.equal(state.freeSpin, null);
  assert.equal(state.basegameWinsCenti, 0);
  assert.equal(state.freegameWinsCenti, 0);
  assert.equal(state.cappedWin, false);
  assert.equal(state.basePlusBoostApplied, false);
  assert.equal(state.spinSeq, 0);
  assert.deepEqual(state.switch, { spins: 0, symbols: [], wild: null });
});

test("baseplus mode starts in the base phase, same as base", () => {
  const state = createInitialRoundState("baseplus", 125);
  assert.equal(state.phase, "base");
  assert.equal(state.freeSpin, null);
});

test("bonus mode starts at the synthetic buy-trigger phase, pre-populated for R-mode free spins", () => {
  const state = createInitialRoundState("bonus", 10000);
  assert.equal(state.phase, "buyTrigger");
  assert.deepEqual(state.freeSpin, { mode: "R", fs: 0, totFs: 10, reelSet: "FR0_BUY" });
});

test("super mode starts at the synthetic buy-trigger phase, pre-populated for S-mode super free spins", () => {
  const state = createInitialRoundState("super", 30000);
  assert.equal(state.phase, "buyTrigger");
  assert.deepEqual(state.freeSpin, { mode: "S", fs: 0, totFs: 10, reelSet: "FR1_BUY" });
});

test("every bet mode's initial state survives a JSON round-trip unchanged", () => {
  for (const betMode of VALID_BET_MODES) {
    const state = createInitialRoundState(betMode, 100);
    const roundTripped = JSON.parse(JSON.stringify(state));
    assert.deepEqual(roundTripped, state, `betMode=${betMode}`);
  }
});

test("cost multipliers match the bet-mode table", () => {
  assert.equal(BET_MODE_COST_MULTIPLIER.base, 1);
  assert.equal(BET_MODE_COST_MULTIPLIER.baseplus, 1.25);
  assert.equal(BET_MODE_COST_MULTIPLIER.bonus, 100);
  assert.equal(BET_MODE_COST_MULTIPLIER.super, 300);
});

test("isFreshRound treats undefined, null, and {} as fresh", () => {
  assert.equal(isFreshRound(undefined), true);
  assert.equal(isFreshRound(null), true);
  assert.equal(isFreshRound({}), true);
});

test("isFreshRound treats any non-empty object as a resumed round", () => {
  assert.equal(isFreshRound({ phase: "base" }), false);
});
