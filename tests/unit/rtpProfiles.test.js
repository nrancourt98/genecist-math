const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_RTP_PROFILE,
  RTP_PROFILES,
  resolveRtpProfile,
  getRtpProfile,
  profileReelName,
} = require("../../project/engine/config/rtpProfiles");
const { createInitialRoundState } = require("../../project/engine/spin/roundState");
const { resolveOneSpin } = require("../../project/engine/spin/spinStep");
const { REELS } = require("../../project/engine/config/reels");
const { DERIVED_REELS } = require("../../project/engine/data/reelWeights");
const { deriveStrip } = require("../../project/engine/data/generateReels");
const { createMockRng } = require("../fixtures/mockRng");
const { singleRowStrip, buildReelProvider } = require("../fixtures/syntheticReels");

test("resolveRtpProfile maps config.rtp to a profile by exact numeric value", () => {
  assert.equal(resolveRtpProfile("94"), "94");
  assert.equal(resolveRtpProfile("94.0"), "94");
  assert.equal(resolveRtpProfile(94), "94");
  assert.equal(resolveRtpProfile("96"), "96");
});

test("resolveRtpProfile falls back to the 96% profile for anything it doesn't know", () => {
  for (const value of [null, undefined, "", "95.5", "94.5", "abc"]) {
    assert.equal(resolveRtpProfile(value), DEFAULT_RTP_PROFILE, `config.rtp=${value}`);
  }
  assert.equal(DEFAULT_RTP_PROFILE, "96");
});

test("getRtpProfile rejects an unknown profile and defaults when none is recorded", () => {
  assert.throws(() => getRtpProfile("95"), /Unknown RTP profile/);
  assert.equal(getRtpProfile(undefined), RTP_PROFILES["96"]);
});

test("profileReelName maps logical reel names to the profile's strips", () => {
  assert.equal(profileReelName(RTP_PROFILES["96"], "BR0"), "BR0");
  assert.equal(profileReelName(RTP_PROFILES["94"], "BR0"), "BR0_94");
  assert.equal(profileReelName(RTP_PROFILES["94"], "FR1_BUY"), "FR1_BUY_94");
});

test("every profile reel name resolves to a loaded strip", () => {
  for (const [name, profile] of Object.entries(RTP_PROFILES)) {
    for (const logical of ["BR0", "FR0", "FR1", "FR0_BUY", "FR1_BUY"]) {
      assert.ok(REELS[profileReelName(profile, logical)], `profile ${name}: ${logical}`);
    }
  }
});

test("a round records its RTP profile, defaulting to 96, and rejects an unknown one", () => {
  assert.equal(createInitialRoundState("base", 100).rtpProfile, "96");
  assert.equal(createInitialRoundState("super", 100, "94").rtpProfile, "94");
  assert.throws(() => createInitialRoundState("base", 100, "95"), /Unknown RTP profile/);
});

test("a 94% round draws its board from the 94% reel strip", () => {
  const reelProvider = buildReelProvider({
    BR0: singleRowStrip(["L1", "L1", "L1", "L1", "L1", "L1"]),
    BR0_94: singleRowStrip(["L2", "L2", "L2", "L2", "L2", "L2"]),
  });
  const rng = createMockRng({ randInts: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0] });

  const result = resolveOneSpin(createInitialRoundState("base", 100, "94"), rng, reelProvider);

  const board = result.events.find((e) => e.type === "reveal").board;
  assert.ok(board.every((reel) => reel.every((cell) => cell.name === "L2")));
});

test("each 94% strip differs from its source only by its configured swaps; scatters never move", () => {
  for (const [name, spec] of Object.entries(DERIVED_REELS)) {
    const source = REELS[spec.source];
    const derived = REELS[name];
    let swaps = 0;
    for (let row = 0; row < source.length; row++) {
      for (let reel = 0; reel < source[row].length; reel++) {
        const from = source[row][reel];
        const to = derived[row][reel];
        if (from === "S" || to === "S") assert.equal(from, to, `${name} scatter moved at ${row},${reel}`);
        if (from !== to) {
          assert.equal(spec.map[from], to, `${name} unexpected swap ${from}->${to}`);
          swaps++;
        }
      }
    }
    assert.equal(swaps, spec.count, name);
  }
});

test("deriveStrip swaps are nested: a higher count keeps every lower count's swaps", () => {
  const source = REELS.FR0;
  const spec = { seed: 7, map: { H1: "L1", H2: "L2" }, count: 0 };
  const changed = (rows) => rows.flatMap((r, row) => r.map((sym, reel) => (sym !== source[row][reel] ? `${row},${reel}` : null))).filter(Boolean);
  const ten = new Set(changed(deriveStrip(source, { ...spec, count: 10 })));
  const twenty = changed(deriveStrip(source, { ...spec, count: 20 }));
  assert.equal(ten.size, 10);
  assert.equal(twenty.length, 20);
  for (const cell of ten) assert.ok(twenty.includes(cell), `swap at ${cell} missing at count 20`);
});

test("deriveStrip with maxRun leaves cells inside longer runs untouched", () => {
  // Column 0: a 5-long H1 run then isolated H1s; only the isolated ones are eligible at maxRun 2.
  const rows = ["H1", "H1", "H1", "H1", "H1", "L3", "H1", "L3", "H1", "L3"].map((s) => [s]);
  const out = deriveStrip(rows, { seed: 1, map: { H1: "L1" }, count: 2, maxRun: 2 });
  assert.deepEqual(out.slice(0, 5).map((r) => r[0]), ["H1", "H1", "H1", "H1", "H1"]);
  assert.deepEqual([out[6][0], out[8][0]], ["L1", "L1"]);
  assert.throws(() => deriveStrip(rows, { seed: 1, map: { H1: "L1" }, count: 3, maxRun: 2 }), /eligible/);
});
