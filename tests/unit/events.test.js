const test = require("node:test");
const assert = require("node:assert/strict");
const events = require("../../project/engine/spin/events");

test("revealEvent", () => {
  const board = [[{ name: "H1" }]];
  assert.deepEqual(events.revealEvent(board, "basegame", [1, 2], [0, 0]), {
    type: "reveal",
    board,
    paddingPositions: [1, 2],
    gameType: "basegame",
    anticipation: [0, 0],
  });
});

test("winInfoEvent", () => {
  const wins = [{ line: 0, win: 100 }];
  assert.deepEqual(events.winInfoEvent(100, wins), { type: "winInfo", totalWin: 100, wins });
});

test("setWinEvent", () => {
  assert.deepEqual(events.setWinEvent(100, 2), { type: "setWin", amount: 100, winLevel: 2 });
});

test("setTotalWinEvent", () => {
  assert.deepEqual(events.setTotalWinEvent(500), { type: "setTotalWin", amount: 500 });
});

test("newSwitchEvent", () => {
  assert.deepEqual(events.newSwitchEvent(3, true, ["L1", "H1"]), {
    type: "newSwitch",
    info: { spins: 3, wild: true, switch_symbols: ["L1", "H1"] },
  });
});

test("newSwitchSpinsEvent", () => {
  assert.deepEqual(events.newSwitchSpinsEvent(3), { type: "newSwitchSpins", spins: 3 });
});

test("updateSwitchSpinsEvent", () => {
  assert.deepEqual(events.updateSwitchSpinsEvent(2), { type: "updateSwitchSpins", spins: 2 });
});

test("switchingSymbolsEvent", () => {
  const changes = [{ reel: 0, row: 0, symbol: "W" }];
  assert.deepEqual(events.switchingSymbolsEvent(changes), {
    type: "switchingSymbols",
    switchedSymbols: changes,
  });
});

test("freeSpinTriggerEvent", () => {
  const positions = [{ reel: 0, row: 0 }];
  assert.deepEqual(events.freeSpinTriggerEvent(10, positions), {
    type: "freeSpinTrigger",
    totalFs: 10,
    positions,
  });
});

test("freeSpinRetriggerEvent", () => {
  const positions = [{ reel: 1, row: 1 }];
  assert.deepEqual(events.freeSpinRetriggerEvent(4, 14, positions), {
    type: "freeSpinRetrigger",
    fs_added: 4,
    totalFs: 14,
    positions,
  });
});

test("selectedModeEvent", () => {
  assert.deepEqual(events.selectedModeEvent("R"), { type: "selectedMode", mode: "R" });
});

test("updateFreeSpinEvent", () => {
  assert.deepEqual(events.updateFreeSpinEvent(3, 10), { type: "updateFreeSpin", amount: 3, total: 10 });
});

test("freeSpinEndEvent", () => {
  assert.deepEqual(events.freeSpinEndEvent(5000, 4), { type: "freeSpinEnd", amount: 5000, winLevel: 4 });
});

test("finalWinEvent", () => {
  assert.deepEqual(events.finalWinEvent(7000), { type: "finalWin", amount: 7000 });
});
