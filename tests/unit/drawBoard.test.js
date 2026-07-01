const test = require("node:test");
const assert = require("node:assert/strict");
const { drawBoard } = require("../../project/engine/board/drawBoard");
const { createMockRng } = require("../fixtures/mockRng");

// Tiny synthetic 4-row x 6-column strip where each cell encodes its own (row, col) so
// picks (including wraparound) are unambiguously verifiable.
function syntheticStrip(rows = 4, cols = 6) {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => `r${r}c${c}`));
}

test("drawBoard reads the correct 5-row window per reel, independently per reel", () => {
  const strip = syntheticStrip(4, 6);
  // One randInt draw per reel (6 reels), startRow values chosen to require wraparound on
  // reel 3 (start=3, window spans rows 3,0,1,2 with numRows=4) and to confirm independence
  // across reels (each reel gets a different start row).
  const rng = createMockRng({ randInts: [0, 1, 2, 3, 0, 2] });

  const board = drawBoard(strip, rng, 4);

  assert.equal(board.length, 6); // 6 reels
  assert.equal(board[0].length, 4); // 4 visible rows (matches numRows arg)

  // reel 0, start row 0 -> rows 0,1,2,3
  assert.deepEqual(board[0].map((c) => c.name), ["r0c0", "r1c0", "r2c0", "r3c0"]);
  // reel 1, start row 1 -> rows 1,2,3,0
  assert.deepEqual(board[1].map((c) => c.name), ["r1c1", "r2c1", "r3c1", "r0c1"]);
  // reel 2, start row 2 -> rows 2,3,0,1
  assert.deepEqual(board[2].map((c) => c.name), ["r2c2", "r3c2", "r0c2", "r1c2"]);
  // reel 3, start row 3 -> rows 3,0,1,2 (wraparound)
  assert.deepEqual(board[3].map((c) => c.name), ["r3c3", "r0c3", "r1c3", "r2c3"]);
  // reel 4, start row 0 -> rows 0,1,2,3
  assert.deepEqual(board[4].map((c) => c.name), ["r0c4", "r1c4", "r2c4", "r3c4"]);
  // reel 5, start row 2 -> rows 2,3,0,1
  assert.deepEqual(board[5].map((c) => c.name), ["r2c5", "r3c5", "r0c5", "r1c5"]);
});

test("drawBoard defaults to 5 visible rows", () => {
  const strip = syntheticStrip(5, 6);
  const rng = createMockRng({ randInts: [0, 0, 0, 0, 0, 0] });
  const board = drawBoard(strip, rng);
  assert.equal(board.length, 6);
  assert.equal(board[0].length, 5);
});

test("drawBoard produces board cells with a .name field (object cells, not bare strings)", () => {
  const strip = syntheticStrip(5, 6);
  const rng = createMockRng({ randInts: [0, 0, 0, 0, 0, 0] });
  const board = drawBoard(strip, rng);
  assert.equal(typeof board[0][0], "object");
  assert.equal(board[0][0].name, "r0c0");
});

test("drawBoard works against the real BR0 reel set end-to-end", () => {
  const { getReel } = require("../../project/engine/config/reels");
  const { createLocalPrng } = require("../../project/engine/rng/localPrng");
  const board = drawBoard(getReel("BR0"), createLocalPrng(42));
  assert.equal(board.length, 6);
  for (const column of board) {
    assert.equal(column.length, 5);
    for (const cellObj of column) {
      assert.equal(typeof cellObj.name, "string");
      assert.ok(cellObj.name.length > 0);
    }
  }
});
