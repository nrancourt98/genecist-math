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
      // Two steps: step 1 computes and delivers all events (final: false), step 2 is the
      // frontend's confirm call that closes the round (final: true, events: []).
      assert.equal(steps, 2, "round must complete in exactly two HTTP calls (compute + confirm)");
      assert.equal(firstResult.final, false, "step 1 must be awaiting confirm");
      assert.equal(firstResult.round.awaiting_confirm, true);
      assert.deepEqual(finalRound, {});

      // All events are delivered in step 1. The triggering board produces the first reveal
      // and freeSpinTrigger. setTotalWin always appears; winInfo/setWin only if the forced
      // board also lands a win. selectedMode follows immediately as the feature begins.
      const firstStepTypes = firstResult.resp.events.map((e) => e.type);
      assert.equal(firstStepTypes[0], "reveal");
      assert.ok(firstStepTypes.includes("freeSpinTrigger"), `events must include freeSpinTrigger; got: [${firstStepTypes}]`);
      assert.ok(firstStepTypes.includes("setTotalWin"));
      const trigger = firstResult.resp.events.find((e) => e.type === "freeSpinTrigger");
      assert.equal(trigger.totalFs, 10);
      assert.equal(trigger.positions.length, feature === "buy_bonus" ? 3 : 4);

      // selectedMode fires as the feature begins (immediately after freeSpinTrigger in the stream).
      assert.ok(firstStepTypes.includes("selectedMode"), "events must include selectedMode announcing the entry mode");
      const selectedMode = firstResult.resp.events.find((e) => e.type === "selectedMode");
      assert.equal(selectedMode.mode, feature === "buy_bonus" ? "R" : "S");

      // freeSpinEnd + finalWin close the event stream in step 1 (not the confirm step).
      assert.deepEqual(
        firstStepTypes.slice(-2),
        ["freeSpinEnd", "finalWin"],
        "the collapsed round must end with freeSpinEnd immediately followed by finalWin"
      );

      // Confirm step (step 2) carries no events and closes the round.
      const confirmStep = allSteps[1];
      assert.equal(confirmStep.resp.events.length, 0, "confirm step must return no events");
      assert.equal(confirmStep.final, true);
      assert.deepEqual(confirmStep.round, {});
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

test("a natural 3+ scatter landing in base mode triggers classic Free Spins; freeSpinTrigger and selectedMode both appear in the step-1 event stream", async () => {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    // BR0's actual committed strip data (scanned directly, see the conversation that
    // built this test) happens to land a visible "S" on reels 0/1/2 at these specific
    // start-rows; reels 3-5 are pinned to strip row 0 (irrelevant - trigger needs >=3 S).
    // This is intentionally coupled to BR0's current content - if BR0 is ever regenerated
    // (see engine/data/reelWeights.js), re-scan for fresh candidate rows.
    //
    // resolveFullRound runs the complete round (base spin + all freespins) in step 1.
    // godMode holds its last array value once exhausted, so [...boardDraws, SAFE_GOD_VALUE]
    // forces the specific base-spin board then keeps SAFE_GOD_VALUE for all freespin draws,
    // preventing switch spins from firing uncontrollably during the freespin phase.
    const stripLen = 1000;
    const boardDraws = [32, 79, 56, 0, 0, 0].map((row) => rawForStripRow(row, stripLen));
    const godRandom = [...boardDraws, SAFE_GOD_VALUE];

    const stepOne = await callPlay(baseUrl, {
      round: {},
      game: {},
      req: { bet: 100, bet_type: "bet" },
      config: { rtp: null, purchased_features: [], gamble_limit: null },
      god_data: { random: godRandom },
    });

    const types = stepOne.resp.events.map((e) => e.type);
    const trigger = stepOne.resp.events.find((e) => e.type === "freeSpinTrigger");
    assert.ok(trigger, `expected freeSpinTrigger, got types: ${types}`);
    assert.equal(trigger.totalFs, 10);
    assert.equal(stepOne.final, false, "step 1 must be awaiting confirm");
    assert.equal(stepOne.round.awaiting_confirm, true);

    // selectedMode fires as the feature begins — must appear after freeSpinTrigger.
    const triggerIdx = types.indexOf("freeSpinTrigger");
    const selectedIdx = types.indexOf("selectedMode");
    assert.ok(selectedIdx > triggerIdx, `selectedMode must appear after freeSpinTrigger; got: [${types}]`);
    const selectedMode = stepOne.resp.events.find((e) => e.type === "selectedMode");
    assert.equal(selectedMode.mode, "R");

    // Confirm step closes the round with no new events.
    const stepTwo = await callPlay(baseUrl, {
      round: stepOne.round,
      game: stepOne.game,
      req: { bet: 100, bet_type: "bet" },
      config: { rtp: null, purchased_features: [], gamble_limit: null },
      god_data: { random: SAFE_GOD_VALUE },
    });
    assert.equal(stepTwo.final, true);
    assert.deepEqual(stepTwo.round, {});
    assert.equal(stepTwo.resp.events.length, 0, "confirm step must return no events");
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

    // Step 1: all events delivered, win applied, round awaiting confirm.
    const wincap = result.resp.events.find((e) => e.type === "wincap");
    assert.ok(wincap, `expected a wincap event, got types: ${result.resp.events.map((e) => e.type)}`);
    assert.equal(wincap.amount, 1000000); // 10,000x in centi-multiplier units
    assert.equal(result.final, false, "step 1 must be awaiting confirm even on a wincap");
    assert.equal(result.round.awaiting_confirm, true);
    assert.equal(result.finance[0].win_change, 1000000); // 10,000x * 100c bet, exact integer cents
    assert.equal(result.resp.events[result.resp.events.length - 1].type, "finalWin");

    // Step 2: confirm closes the round, no additional win.
    const confirm = await callPlay(baseUrl, {
      round: result.round,
      game: result.game,
      req: { bet: 100, bet_type: "bet" },
      config: { rtp: null, purchased_features: [], gamble_limit: null },
      god_data: { random },
    }, 2);
    assert.equal(confirm.final, true);
    assert.deepEqual(confirm.round, {});
    assert.equal(confirm.finance[0].win_change, 0);
    assert.equal(confirm.resp.events.length, 0, "confirm step must return no events");
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
