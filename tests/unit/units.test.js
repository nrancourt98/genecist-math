const test = require("node:test");
const assert = require("node:assert/strict");
const { centiMultiplierToCents } = require("../../project/engine/units");

test("centiMultiplierToCents converts a simple multiplier", () => {
  // 5x win (500 centi) on a 100-cent bet -> 500 cents
  assert.equal(centiMultiplierToCents(500, 100), 500);
});

test("centiMultiplierToCents handles fractional-of-bet multipliers", () => {
  // 0.1x win (10 centi) on a 100-cent bet -> 10 cents
  assert.equal(centiMultiplierToCents(10, 100), 10);
});

test("centiMultiplierToCents rounds to the nearest integer cent", () => {
  // 0.1x win (10 centi) on a 33-cent bet -> 3.3 cents -> rounds to 3
  assert.equal(centiMultiplierToCents(10, 33), 3);
});

test("centiMultiplierToCents handles the wincap amount", () => {
  // wincap = 10,000x = 1,000,000 centi, on a 100-cent bet -> 1,000,000 cents
  assert.equal(centiMultiplierToCents(1000000, 100), 1000000);
});

test("centiMultiplierToCents returns 0 for a zero win", () => {
  assert.equal(centiMultiplierToCents(0, 250), 0);
});
