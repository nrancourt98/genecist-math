const test = require("node:test");
const assert = require("node:assert/strict");
const { WINCAP_CENTI, checkWincap } = require("../../project/engine/wins/wincap");

function baseRoundState(overrides = {}) {
  return {
    phase: "base",
    basegameWinsCenti: 0,
    freegameWinsCenti: 0,
    cappedWin: false,
    switch: { spins: 3, symbols: ["L1"], wild: true },
    freeSpin: null,
    ...overrides,
  };
}

test("below the cap: returns null and leaves the round state untouched", () => {
  const state = baseRoundState({ basegameWinsCenti: WINCAP_CENTI - 100 });
  const event = checkWincap(state);
  assert.equal(event, null);
  assert.equal(state.basegameWinsCenti, WINCAP_CENTI - 100);
  assert.equal(state.cappedWin, false);
  assert.equal(state.switch.spins, 3); // untouched
});

test("exactly at the cap: triggers with zero excess to clip", () => {
  const state = baseRoundState({ basegameWinsCenti: WINCAP_CENTI });
  const event = checkWincap(state);
  assert.deepEqual(event, { type: "wincap", amount: WINCAP_CENTI });
  assert.equal(state.basegameWinsCenti, WINCAP_CENTI);
  assert.equal(state.cappedWin, true);
});

test("over the cap in base phase: clips the excess out of basegameWinsCenti", () => {
  const state = baseRoundState({ phase: "base", basegameWinsCenti: WINCAP_CENTI + 12345 });
  const event = checkWincap(state);
  assert.deepEqual(event, { type: "wincap", amount: WINCAP_CENTI });
  assert.equal(state.basegameWinsCenti + state.freegameWinsCenti, WINCAP_CENTI);
  assert.equal(state.basegameWinsCenti, WINCAP_CENTI); // freegameWinsCenti was 0, so the clip lands fully here
});

test("over the cap in freespins phase: clips the excess out of freegameWinsCenti, leaving basegame untouched", () => {
  const state = baseRoundState({
    phase: "freespins",
    basegameWinsCenti: 5000, // small leftover from the triggering base spin
    freegameWinsCenti: WINCAP_CENTI,
  });
  const event = checkWincap(state);
  assert.deepEqual(event, { type: "wincap", amount: WINCAP_CENTI });
  assert.equal(state.basegameWinsCenti, 5000); // untouched
  assert.equal(state.freegameWinsCenti, WINCAP_CENTI - 5000);
  assert.equal(state.basegameWinsCenti + state.freegameWinsCenti, WINCAP_CENTI);
});

test("hitting the cap forcibly terminates the active switch sequence and free-spin feature", () => {
  const state = baseRoundState({
    phase: "freespins",
    freegameWinsCenti: WINCAP_CENTI + 999,
    switch: { spins: 7, symbols: ["H2"], wild: false },
    freeSpin: { mode: "S", fs: 3, totFs: 10, reelSet: "FR1" },
  });
  checkWincap(state);
  assert.equal(state.switch.spins, 0);
  assert.equal(state.freeSpin, null);
});

test("never leaves a negative win bucket, even with a large excess", () => {
  const state = baseRoundState({ phase: "base", basegameWinsCenti: WINCAP_CENTI * 5 });
  checkWincap(state);
  assert.ok(state.basegameWinsCenti >= 0);
  assert.equal(state.basegameWinsCenti, WINCAP_CENTI);
});
