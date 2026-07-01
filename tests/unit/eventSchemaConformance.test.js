// Diffs every event type our engine emits against the real recorded reference shapes in
// info/wildly-monsters (python)/library/configs/event_config_{base,bonus,super}.json -
// the canonical event vocabulary this whole project was told to imitate (see
// docs/bgaming-compliance.md "resp is free-form... reuse the established event
// vocabulary"). Compares key *structure* only (field names/nesting), not values - the
// goal is catching field-name drift (a rename, a typo, a dropped/added field), not
// re-deriving exact numbers, which the rest of the suite already covers.
//
// Three reference files are merged because no single one exercises every optional field
// (e.g. only "base"/"bonus" happen to include a freeSpinRetrigger sample) - the union of
// all three is the closest thing to a complete schema we have without the actual missing
// Stake-Engine framework source (see docs/architecture.md's judgment-call log).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const events = require("../../project/engine/spin/events");
const { checkWincap } = require("../../project/engine/wins/wincap");

const REFERENCE_DIR = path.join(
  __dirname,
  "../../info/wildly-monsters (python)/library/configs"
);
const REFERENCE_FILES = ["event_config_base.json", "event_config_bonus.json", "event_config_super.json"];

function loadReferenceSamplesByType() {
  const samplesByType = {};
  for (const file of REFERENCE_FILES) {
    const config = JSON.parse(fs.readFileSync(path.join(REFERENCE_DIR, file), "utf8"));
    for (const [type, sample] of Object.entries(config)) {
      (samplesByType[type] = samplesByType[type] || []).push(sample);
    }
  }
  return samplesByType;
}

// Walks an arbitrary JSON value, recording every key path seen. Arrays collapse to a
// single "[]" segment, but EVERY element is walked (not just the first) and their key
// paths unioned together - board/wins cells are heterogeneous (a board has plain/wild/
// switch/scatter cells with different optional fields; checking only element [0] would
// silently miss whichever shapes don't happen to land at index 0 in a given sample).
function collectKeyPaths(value, prefix, into) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeyPaths(item, `${prefix}[]`, into);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, val] of Object.entries(value)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      into.add(nextPrefix);
      collectKeyPaths(val, nextPrefix, into);
    }
  }
}

function keyPathSet(value) {
  const into = new Set();
  collectKeyPaths(value, "", into);
  return into;
}

function unionKeyPaths(samples) {
  const union = new Set();
  for (const sample of samples) {
    for (const keyPath of keyPathSet(sample)) union.add(keyPath);
  }
  return union;
}

const referenceSamplesByType = loadReferenceSamplesByType();

// The Python prototype had two scatter symbols (S/S2); this game's design was corrected
// to a single scatter symbol "S" with count-based trigger tiers instead (3 -> bonus, 4+
// -> super - see docs/architecture.md's judgment-call log, "S2 merged into S"). Our
// engine can therefore never emit a "scatter2" cell again, even though
// event_config_super.json's reference sample still legitimately has one (it's historical
// Python-derived data, not something we edit). This is an intentional, documented
// divergence from the reference union, not field-name drift - excluded from the
// "missing field" check below so the rest of that check stays meaningful.
const KNOWN_INTENTIONAL_OMISSIONS = {
  reveal: ["board[][].scatter2"],
};

function assertMatchesReference(type, actualEvent) {
  const samples = referenceSamplesByType[type];
  assert.ok(samples && samples.length > 0, `no reference sample found for event type "${type}"`);

  const expected = unionKeyPaths(samples);
  const actual = keyPathSet(actualEvent);
  const intentionallyOmitted = new Set(KNOWN_INTENTIONAL_OMISSIONS[type] || []);

  const missing = [...expected].filter((p) => !actual.has(p) && !intentionallyOmitted.has(p)).sort();
  const extra = [...actual].filter((p) => !expected.has(p)).sort();

  assert.deepEqual(missing, [], `"${type}" is missing field(s) the real reference has: ${missing.join(", ")}`);
  assert.deepEqual(extra, [], `"${type}" has field(s) absent from every real reference sample: ${extra.join(", ")}`);
}

// One representative board exercising every cell shape our engine can actually produce:
// a plain symbol (no extra flags), a natural wild (wild+multiplier, from
// assignWildMultipliers), a switch symbol (switch:true, from spinStep's forced
// placement), and a scatter (scatter:true, from drawBoard's buildCell). No "scatter2"
// cell - see KNOWN_INTENTIONAL_OMISSIONS above for why the reveal check still passes
// without one.
const sampleBoard = [
  [{ name: "L3" }],
  [{ name: "W", wild: true, multiplier: 5 }],
  [{ name: "SW", switch: true }],
  [{ name: "S", scatter: true }],
];

test("reveal event matches the real reference schema", () => {
  assertMatchesReference("reveal", events.revealEvent(sampleBoard, "basegame", [1, 2, 3, 4], [0, 0, 0, 0]));
});

test("winInfo event (including nested wins[].meta) matches the real reference schema", () => {
  const wins = [
    {
      symbol: "H1",
      kind: 4,
      win: 250,
      positions: [
        { reel: 0, row: 0 },
        { reel: 1, row: 0 },
        { reel: 2, row: 0 },
        { reel: 3, row: 0 },
      ],
      meta: { lineIndex: 3, multiplier: 2, winWithoutMult: 125, globalMult: 1, lineMultiplier: 2 },
    },
  ];
  assertMatchesReference("winInfo", events.winInfoEvent(250, wins));
});

test("setWin event matches the real reference schema", () => {
  assertMatchesReference("setWin", events.setWinEvent(250, 2));
});

test("setTotalWin event matches the real reference schema", () => {
  assertMatchesReference("setTotalWin", events.setTotalWinEvent(250));
});

test("newSwitch event matches the real reference schema", () => {
  assertMatchesReference("newSwitch", events.newSwitchEvent(3, true, ["L1", "H2"]));
});

test("newSwitchSpins event matches the real reference schema", () => {
  assertMatchesReference("newSwitchSpins", events.newSwitchSpinsEvent(3));
});

test("updateSwitchSpins event matches the real reference schema", () => {
  assertMatchesReference("updateSwitchSpins", events.updateSwitchSpinsEvent(2));
});

test("switchingSymbols event matches the real reference schema", () => {
  assertMatchesReference(
    "switchingSymbols",
    events.switchingSymbolsEvent([{ reel: 0, row: 0, symbol: "W" }])
  );
});

test("freeSpinTrigger event matches the real reference schema", () => {
  assertMatchesReference("freeSpinTrigger", events.freeSpinTriggerEvent(10, [{ reel: 0, row: 1 }]));
});

test("freeSpinRetrigger event matches the real reference schema", () => {
  assertMatchesReference(
    "freeSpinRetrigger",
    events.freeSpinRetriggerEvent(4, 14, [{ reel: 1, row: 1 }])
  );
});

test("selectedMode event matches the real reference schema", () => {
  assertMatchesReference("selectedMode", events.selectedModeEvent("R"));
});

test("updateFreeSpin event matches the real reference schema", () => {
  assertMatchesReference("updateFreeSpin", events.updateFreeSpinEvent(3, 10));
});

test("freeSpinEnd event matches the real reference schema", () => {
  assertMatchesReference("freeSpinEnd", events.freeSpinEndEvent(5000, 4));
});

test("finalWin event matches the real reference schema", () => {
  assertMatchesReference("finalWin", events.finalWinEvent(7000));
});

test("wincap event (built by the real checkWincap function, not a hand-built fixture) matches the real reference schema", () => {
  const state = {
    phase: "base",
    basegameWinsCenti: 2_000_000,
    freegameWinsCenti: 0,
    cappedWin: false,
    switch: { spins: 2 },
    freeSpin: null,
  };
  const wincapEvent = checkWincap(state);
  assert.ok(wincapEvent, "expected checkWincap to fire given a state already over the cap");
  assertMatchesReference("wincap", wincapEvent);
});

test("every event type this engine can emit has at least one real reference sample backing it", () => {
  const emittedTypes = [
    "reveal",
    "winInfo",
    "setWin",
    "setTotalWin",
    "newSwitch",
    "newSwitchSpins",
    "updateSwitchSpins",
    "switchingSymbols",
    "freeSpinTrigger",
    "freeSpinRetrigger",
    "selectedMode",
    "updateFreeSpin",
    "freeSpinEnd",
    "finalWin",
    "wincap",
  ];
  for (const type of emittedTypes) {
    assert.ok(referenceSamplesByType[type], `event type "${type}" has no reference sample in any config file`);
  }
});
