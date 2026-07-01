// Exercises the real Express app in-process (no mocked layers below the HTTP boundary)
// using ENABLE_GOD_MODE for deterministic RNG, per docs/architecture.md's testing
// strategy. Must be set before app.js (-> playHandler.js -> godMode.js) is first
// required, since godMode reads the env var once at module load.
process.env.ENABLE_GOD_MODE = "1";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../../project/backend/src/app");

function startServer() {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function callPlay(baseUrl, params, id = 1) {
  const response = await fetch(`${baseUrl}/api`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "play", params }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.id, id);
  assert.ok(body.result, `expected a result, got ${JSON.stringify(body)}`);
  return body.result;
}

// A large raw value so every randInt(N) derived from it (N up to a few thousand) lands
// on a non-zero quotient - keeps switch-spin drops from firing on every single spin
// (which would otherwise oscillate forever, see the derivation in deriveRng.js) so these
// contract-shape tests terminate in a small, predictable number of steps.
const SAFE_GOD_VALUE = 4000000000;

// god_data.random raw values map to outcomes via deriveRng.js's
// randInt(n) = floor((raw / 2^32) * n) - 0 always lands on index 0 of any n (forces a
// "hit" on any chance check, bag[0], pool[0]...), 0xFFFFFFFF always lands on the last
// index of any n (forces a bag's highest-weighted-position entry, e.g. the 50x wild
// multiplier - the last 5 entries of WILD_MULTIPLIER_BAG). See deriveRng.js for the
// exact formula these rely on.
const FORCE_FIRST = 0;
const FORCE_LAST = 0xffffffff;

// Inverts drawBoard's randInt(stripLen) to land on a specific strip start-row, using the
// bucket's midpoint (not its edge) - landing exactly on an edge can round back down to
// row-1 due to floating-point division error in nextFloat() (confirmed empirically while
// building these tests: the naive edge formula intermittently produced the wrong row).
function rawForStripRow(row, stripLen) {
  return Math.floor((row + 0.5) * 2 ** 32 / stripLen);
}

async function runRoundOverHttp(baseUrl, req, godData = { random: SAFE_GOD_VALUE }) {
  let round = {};
  let game = {};
  let final = false;
  let steps = 0;
  let firstResult = null;
  let totalWinChangeCents = 0;
  const allSteps = [];

  while (!final && steps < 500) {
    const result = await callPlay(baseUrl, {
      round,
      game,
      req: steps === 0 ? req : { ...req, purchased_feature: undefined },
      config: { rtp: null, purchased_features: [], gamble_limit: null },
      god_data: godData,
    });
    if (steps === 0) firstResult = result;
    else assert.equal(result.finance[0].bet, 0, "only the first step may charge a bet");

    allSteps.push(result);
    totalWinChangeCents += result.finance[0].win_change;
    round = result.round;
    game = result.game;
    final = result.final;
    steps += 1;
  }

  assert.ok(steps < 500, "round did not finish within 500 steps");
  return { steps, firstResult, finalRound: round, totalWinChangeCents, allSteps };
}

test("unknown method returns a JSON-RPC error instead of crashing", async () => {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "nope", params: {} }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(body.error);
    assert.equal(body.result, undefined);
  } finally {
    server.close();
  }
});

test("base mode: round resumes correctly across steps, bet charged once, round resets to {} when final", async () => {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const { firstResult, finalRound } = await runRoundOverHttp(baseUrl, { bet: 100, bet_type: "bet" });
    assert.equal(firstResult.finance[0].bet, -100); // base mode: 1x cost multiplier
    assert.equal(firstResult.finance[0].base, 100);
    assert.deepEqual(finalRound, {});
  } finally {
    server.close();
  }
});

test("baseplus mode: charges the 1.25x ante cost on the first step only", async () => {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const { firstResult } = await runRoundOverHttp(baseUrl, { bet: 100, bet_type: "bet", bet_mode: "baseplus" });
    assert.equal(firstResult.finance[0].bet, -125);
  } finally {
    server.close();
  }
});

for (const [feature, costMultiplier] of [
  ["buy_bonus", 100],
  ["buy_super", 300],
]) {
  test(`${feature}: charges the buy-in cost upfront and runs a multi-step free-spin round to completion`, async () => {
    const server = await startServer();
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const { steps, firstResult, finalRound, allSteps } = await runRoundOverHttp(baseUrl, {
        bet: 100,
        bet_type: "bet",
        purchased_feature: feature,
      });
      assert.equal(firstResult.finance[0].bet, -100 * costMultiplier);
      assert.ok(steps >= 11, `expected at least 11 steps (1 synthetic trigger + 10 free spins), got ${steps}`);
      assert.deepEqual(finalRound, {});

      // Event-content assertions across the real HTTP/JSON boundary (not just finance
      // and round-shape, which the assertions above already covered) - this is the gap
      // this whole batch of tests is closing, see the conversation that asked for it.
      //
      // First step: a synthetic "triggering" board, shown before the feature itself
      // starts (see docs/architecture.md's judgment-call log, "buy-feature triggering
      // board") - its incidental line wins are honoured exactly like a natural trigger
      // spin's are, so the exact event list isn't asserted here (setTotalWin always
      // appears; winInfo/setWin only if this particular forced board happens to also
      // land a win - see spinStep.test.js's dedicated, fully-controlled test for that).
      const firstStepTypes = firstResult.resp.events.map((e) => e.type);
      assert.equal(firstStepTypes[0], "reveal");
      assert.equal(firstStepTypes[firstStepTypes.length - 1], "freeSpinTrigger");
      assert.ok(firstStepTypes.includes("setTotalWin"));
      const trigger = firstResult.resp.events.find((e) => e.type === "freeSpinTrigger");
      assert.equal(trigger.totalFs, 10);
      assert.equal(trigger.positions.length, feature === "buy_bonus" ? 3 : 4);

      // Second step: the feature itself actually begins, announcing its mode.
      const secondStepTypes = allSteps[1].resp.events.map((e) => e.type);
      assert.ok(secondStepTypes.includes("selectedMode"), "second step must announce the entry mode");
      const selectedMode = allSteps[1].resp.events.find((e) => e.type === "selectedMode");
      assert.equal(selectedMode.mode, feature === "buy_bonus" ? "R" : "S");

      const lastStepTypes = allSteps[allSteps.length - 1].resp.events.map((e) => e.type);
      assert.deepEqual(
        lastStepTypes.slice(-2),
        ["freeSpinEnd", "finalWin"],
        "the final step must end with freeSpinEnd immediately followed by finalWin"
      );
    } finally {
      server.close();
    }
  });
}

test("a switch-spin drop on base mode's first spin emits newSwitch + newSwitchSpins with the forced values", async () => {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    // Draw order for resolveBaseSpinStep, verified by direct experimentation against the
    // engine (see the conversation that built this): 6 board draws, then the switch
    // drop-chance roll, then (since it's forced to hit) reel+row, then 6 padding draws
    // (cosmetic, value irrelevant), then - because this is a fresh sequence - the
    // wild-persistence roll, the spins-award bag pick, the symbol-count bag pick, and
    // finally one sampleWithoutReplacement draw per symbol the count bag awarded.
    // FORCE_FIRST at every one of those decision points forces the simplest possible
    // outcome: drop hits at (reel 0, row 0), wild=true, 1 spin awarded, exactly 1 new
    // target symbol (the first entry of the eligible pool).
    const random = [
      SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, // board
      FORCE_FIRST, // drop-chance: hit
      FORCE_FIRST, FORCE_FIRST, // reel, row
      SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, // padding
      FORCE_FIRST, // wild persistence -> true
      FORCE_FIRST, // spins-award bag -> first (lowest) entry
      FORCE_FIRST, // symbol-count bag -> first (lowest) entry
      FORCE_FIRST, // sampleWithoutReplacement pick
    ];

    const result = await callPlay(baseUrl, {
      round: {},
      game: {},
      req: { bet: 100, bet_type: "bet" },
      config: { rtp: null, purchased_features: [], gamble_limit: null },
      god_data: { random },
    });

    const newSwitch = result.resp.events.find((e) => e.type === "newSwitch");
    const newSwitchSpins = result.resp.events.find((e) => e.type === "newSwitchSpins");
    assert.ok(newSwitch, `expected a newSwitch event, got types: ${result.resp.events.map((e) => e.type)}`);
    assert.deepEqual(newSwitch.info, { spins: 1, wild: true, switch_symbols: ["L1"] });
    assert.equal(newSwitchSpins.spins, 1);
  } finally {
    server.close();
  }
});

test("a natural 3+ scatter landing in base mode triggers classic Free Spins, then selectedMode fires on the very next step", async () => {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    // BR0's actual committed strip data (scanned directly, see the conversation that
    // built this test) happens to land a visible "S" on reels 0/1/2 at these specific
    // start-rows; reels 3-5 are pinned to strip row 0 (whatever symbol that happens to
    // be is irrelevant - the trigger only needs >=3 "S" anywhere on the board). This is
    // intentionally coupled to BR0's current content, not derived from game rules - if
    // BR0 is ever regenerated (see engine/data/reelWeights.js), re-scan for fresh
    // candidate rows rather than guessing new ones.
    const stripLen = 1000;
    const boardDraws = [6, 12, 48, 0, 0, 0].map((row) => rawForStripRow(row, stripLen));
    const stepOneRandom = [...boardDraws, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE];

    const stepOne = await callPlay(baseUrl, {
      round: {},
      game: {},
      req: { bet: 100, bet_type: "bet" },
      config: { rtp: null, purchased_features: [], gamble_limit: null },
      god_data: { random: stepOneRandom },
    });

    const trigger = stepOne.resp.events.find((e) => e.type === "freeSpinTrigger");
    assert.ok(trigger, `expected freeSpinTrigger, got types: ${stepOne.resp.events.map((e) => e.type)}`);
    assert.equal(trigger.totalFs, 10);
    assert.equal(stepOne.final, false, "triggering Free Spins must not end the round");

    const stepTwo = await callPlay(baseUrl, {
      round: stepOne.round,
      game: stepOne.game,
      req: { bet: 100, bet_type: "bet" },
      config: { rtp: null, purchased_features: [], gamble_limit: null },
      god_data: { random: SAFE_GOD_VALUE },
    });
    assert.equal(stepTwo.resp.events[0].type, "selectedMode", "the mode must be announced on the first step of the feature itself");
  } finally {
    server.close();
  }
});

test("a wincap hit (forced via a hand-crafted mid-sequence round) clips the win, emits wincap, and ends the round in the same step", async () => {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    // round/game are opaque, client-supplied JSON per BGaming's stateless contract (see
    // docs/bgaming-compliance.md) - there is no integrity check, so a test is free to
    // resume from a hand-crafted mid-feature state instead of re-deriving it through many
    // forced spins. This state represents: one spin left in an active switch sequence
    // that has already accumulated all 9 eligible target symbols with wild=true - the
    // exact runaway shape the reel-strip/drop-rate rebalancing (see docs/architecture.md's
    // judgment-call log) was about taming, reconstructed deliberately here to prove the
    // wincap safety net still catches it if it ever did happen.
    const round = {
      version: 1,
      betMode: "bonus",
      betAmountCents: 100,
      phase: "freespins",
      basegameWinsCenti: 0,
      freegameWinsCenti: 0,
      cappedWin: false,
      switch: { spins: 1, symbols: ["L1", "L2", "L3", "L4", "L5", "H1", "H2", "H3", "H4"], wild: true },
      freeSpin: { mode: "R", fs: 5, totFs: 10, reelSet: "FR0" },
      basePlusBoostApplied: false,
      spinSeq: 5,
    };

    // FR0's committed strip data happens to have an "all switch-eligible-or-wild" 5-row
    // window starting at row 0 for reels 0-4 and row 3 for reel 5 (scanned directly - see
    // the conversation that built this test) - once switch-replacement converts every
    // eligible cell to W, this maximizes simultaneous winning lines. FORCE_LAST on the
    // (generous, overshooting) tail forces every wild-multiplier roll to the bag's
    // highest-weighted-position entry (50x) for however many natural/replacement wild
    // cells actually end up on the board - exact count doesn't matter, unused entries are
    // simply never consumed.
    const stripLen = 1000;
    const boardDraws = [0, 0, 0, 0, 0, 3].map((row) => rawForStripRow(row, stripLen));
    const random = [
      ...boardDraws,
      ...new Array(40).fill(FORCE_LAST), // wild-multiplier rolls, natural pass
      SAFE_GOD_VALUE, // drop-chance: miss (no second drop layered on top)
      SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, SAFE_GOD_VALUE, // padding
      ...new Array(40).fill(FORCE_LAST), // wild-multiplier rolls, post-replacement pass
    ];

    const result = await callPlay(baseUrl, {
      round,
      game: {},
      req: { bet: 100, bet_type: "bet" },
      config: { rtp: null, purchased_features: [], gamble_limit: null },
      god_data: { random },
    });

    const wincap = result.resp.events.find((e) => e.type === "wincap");
    assert.ok(wincap, `expected a wincap event, got types: ${result.resp.events.map((e) => e.type)}`);
    assert.equal(wincap.amount, 1000000); // 10,000x in centi-multiplier units
    assert.equal(result.final, true, "a wincap hit must terminate the round immediately");
    assert.deepEqual(result.round, {});
    assert.equal(result.finance[0].win_change, 1000000); // 10,000x * 100c bet, exact integer cents
    assert.equal(result.resp.events[result.resp.events.length - 1].type, "finalWin");
  } finally {
    server.close();
  }
});

test("god_data is ignored when ENABLE_GOD_MODE is not set (separate process check)", async () => {
  // Spawn a child process with ENABLE_GOD_MODE unset to confirm the gate actually gates,
  // since this file's own process has it forced on for every other test above.
  const { spawnSync } = require("node:child_process");
  const script = `
    const { maybeCreateGodRng } = require(${JSON.stringify(require.resolve("../../project/backend/src/godMode"))});
    const rng = maybeCreateGodRng({ random: 777 });
    process.stdout.write(JSON.stringify(rng));
  `;
  const env = { ...process.env };
  delete env.ENABLE_GOD_MODE;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env });
  assert.equal(result.stdout.trim(), "null");
});
