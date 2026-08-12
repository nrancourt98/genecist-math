const test = require("node:test");
const assert = require("node:assert/strict");
const { getPayoutCenti } = require("../../project/engine/config/paytable");

test("paytable: H5 column matches game_config.py verbatim", () => {
  assert.equal(getPayoutCenti(3, "H5"), 500);
  assert.equal(getPayoutCenti(4, "H5"), 1000);
  assert.equal(getPayoutCenti(5, "H5"), 1500);
  assert.equal(getPayoutCenti(6, "H5"), 2000);
});

test("paytable: low symbols and decimal multipliers convert exactly", () => {
  assert.equal(getPayoutCenti(3, "L2"), 10); // 0.1x
  assert.equal(getPayoutCenti(4, "L2"), 30); // 0.3x
  assert.equal(getPayoutCenti(3, "H3"), 150); // 1.5x
});

test("paytable: wild only has a 6-kind entry", () => {
  assert.equal(getPayoutCenti(6, "W"), 2000);
  assert.equal(getPayoutCenti(3, "W"), undefined);
  assert.equal(getPayoutCenti(4, "W"), undefined);
  assert.equal(getPayoutCenti(5, "W"), undefined);
});

test("paytable: unknown symbol returns undefined", () => {
  assert.equal(getPayoutCenti(3, "S"), undefined);
  assert.equal(getPayoutCenti(3, "SW"), undefined);
});
