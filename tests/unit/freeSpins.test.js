const test = require("node:test");
const assert = require("node:assert/strict");
const {
  checkBaseTrigger,
  checkFreeSpinContinuation,
  createInitialFreeSpinState,
} = require("../../project/engine/features/freeSpins");
const { emptyBoard, setCell } = require("../fixtures/boards");

function boardWithSymbolAt(symbolName, cells) {
  const board = emptyBoard();
  for (const [reel, row] of cells) {
    setCell(board, reel, row, symbolName);
  }
  return board;
}

test("checkBaseTrigger: exactly 3 S triggers R mode", () => {
  const board = boardWithSymbolAt("S", [[0, 1], [2, 3], [4, 2]]);
  const result = checkBaseTrigger(board);
  assert.equal(result.mode, "R");
  assert.equal(result.positions.length, 3);
});

test("checkBaseTrigger: 4 S triggers S mode directly, bypassing R", () => {
  const board = boardWithSymbolAt("S", [[0, 0], [1, 1], [2, 2], [3, 3]]);
  const result = checkBaseTrigger(board);
  assert.equal(result.mode, "S");
  assert.equal(result.positions.length, 4);
});

test("checkBaseTrigger: 2 scatters is not enough", () => {
  const board = boardWithSymbolAt("S", [[0, 0], [1, 1]]);
  assert.equal(checkBaseTrigger(board), null);
});

test("checkBaseTrigger: more than 4 scatters still triggers S mode (count above 4 doesn't matter)", () => {
  const board = boardWithSymbolAt("S", [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 0]]);
  const result = checkBaseTrigger(board);
  assert.equal(result.mode, "S");
  assert.equal(result.positions.length, 6);
});

test("checkFreeSpinContinuation: R-mode retriggers on exactly 3 S", () => {
  const board = boardWithSymbolAt("S", [[0, 0], [1, 0], [2, 0]]);
  const result = checkFreeSpinContinuation({ mode: "R" }, board);
  assert.deepEqual(result, { type: "retrigger", fsAdded: 4, positions: result.positions });
  assert.equal(result.positions.length, 3);
});

test("checkFreeSpinContinuation: R-mode upgrades to S on 4+ S", () => {
  const board = boardWithSymbolAt("S", [[0, 0], [1, 0], [2, 0], [3, 0]]);
  const result = checkFreeSpinContinuation({ mode: "R" }, board);
  assert.equal(result.type, "upgrade");
  assert.equal(result.positions.length, 4);
});

test("checkFreeSpinContinuation: R-mode returns null with fewer than 3 S", () => {
  const board = boardWithSymbolAt("S", [[0, 0], [1, 0]]);
  assert.equal(checkFreeSpinContinuation({ mode: "R" }, board), null);
});

test("checkFreeSpinContinuation: S-mode retriggers on 3+ S, no higher tier", () => {
  const board = boardWithSymbolAt("S", [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
  const result = checkFreeSpinContinuation({ mode: "S" }, board);
  assert.deepEqual(result, { type: "retrigger", fsAdded: 4, positions: result.positions });
  assert.equal(result.positions.length, 5);
});

test("checkFreeSpinContinuation: S-mode returns null below 3 S", () => {
  const board = boardWithSymbolAt("S", [[0, 0], [1, 0]]);
  assert.equal(checkFreeSpinContinuation({ mode: "S" }, board), null);
});

test("createInitialFreeSpinState: R mode uses FR0, 10 spins, fs=0", () => {
  assert.deepEqual(createInitialFreeSpinState("R"), { mode: "R", fs: 0, totFs: 10, reelSet: "FR0" });
});

test("createInitialFreeSpinState: S mode uses FR1", () => {
  assert.deepEqual(createInitialFreeSpinState("S"), { mode: "S", fs: 0, totFs: 10, reelSet: "FR1" });
});
