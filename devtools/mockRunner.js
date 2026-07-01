#!/usr/bin/env node
// Minimal stand-in for BGaming's real Runner, for manual smoke-testing the backend
// without it (the designer has the real `runner_cli` but only a Linux build so far - see
// docs/bgaming-compliance.md). Drives one or more rounds against a live `play` endpoint,
// carrying `round`/`game` forward exactly like the real Runner would, and prints a
// concise per-step summary. Not a test runner - just a convenience wrapper around an
// already-working backend (see docs/architecture.md's Build Sequence).
//
// Usage:
//   node devtools/mockRunner.js [--url http://127.0.0.1:4051/api] [--bet 100]
//     [--mode base|baseplus|bonus|super] [--rounds 1] [--god 4000000000] [--quiet]
//     [--visual] [--dump <file.json>]
//
// --god accepts a single integer, a comma-separated list, or the literal string "random"
// (forwarded as god_data.random - see backend/src/godMode.js); only honored by the
// backend if it was started with ENABLE_GOD_MODE=1. Without --god, the backend will
// attempt the real RNG microservice. A fixed integer/list replays identically every step
// (god mode's draw cursor resets fresh per HTTP call) - use "random" to re-roll a fresh
// value each step instead, e.g. to confirm free spins draw a different board each spin.
//
// --visual renders each step's board + event summary via eventVisualizer.js instead of
// the terse one-line type list (overrides --quiet for that line, the final step-count
// summary still prints). --dump <file.json> writes every step's full play-result object
// to disk (shape: {steps: [...]})  - feed that file to either
// `node devtools/eventVisualizer.js <file.json>` or visualizer/index.html for an
// after-the-fact look, e.g. to capture one specific round for later inspection without
// needing the backend running again.

const crypto = require("node:crypto");
const fs = require("node:fs");
const { renderStep } = require("./eventVisualizer");

function parseArgs(argv) {
  const args = {
    url: "http://127.0.0.1:4051/api",
    bet: 100,
    mode: "base",
    rounds: 1,
    god: undefined,
    quiet: false,
    visual: false,
    dump: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--url") args.url = argv[++i];
    else if (flag === "--bet") args.bet = parseInt(argv[++i], 10);
    else if (flag === "--mode") args.mode = argv[++i];
    else if (flag === "--rounds") args.rounds = parseInt(argv[++i], 10);
    else if (flag === "--god") args.god = argv[++i];
    else if (flag === "--quiet") args.quiet = true;
    else if (flag === "--visual") args.visual = true;
    else if (flag === "--dump") args.dump = argv[++i];
    else {
      console.error(`Unknown argument: ${flag}`);
      process.exit(1);
    }
  }
  return args;
}

function buildReq(mode, betCents) {
  const req = { bet: betCents, bet_type: "bet" };
  if (mode === "bonus") req.purchased_feature = "buy_bonus";
  else if (mode === "super") req.purchased_feature = "buy_super";
  else if (mode === "baseplus") req.bet_mode = "baseplus";
  return req;
}

function buildGodData(godArg) {
  if (godArg === undefined) return undefined;
  const values = godArg.split(",").map((v) => parseInt(v.trim(), 10));
  return { random: values.length === 1 ? values[0] : values };
}

function randomUint32() {
  return crypto.randomBytes(4).readUInt32BE(0);
}

async function callPlay(url, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "play", params }),
  });
  const body = await response.json();
  if (body.error) {
    throw new Error(`play returned a JSON-RPC error: ${JSON.stringify(body.error)}`);
  }
  return body.result;
}

async function playOneRound(args, roundIndex) {
  let round = {};
  let game = {};
  let final = false;
  let step = 0;
  let totalWinChangeCents = 0;
  const req = buildReq(args.mode, args.bet);
  const godData = args.god === "random" ? undefined : buildGodData(args.god);
  const dumpedSteps = [];

  console.log(`\n=== Round ${roundIndex + 1} (mode=${args.mode}, bet=${args.bet}c) ===`);

  while (!final) {
    const params = {
      round,
      game,
      req: step === 0 ? req : { bet: args.bet, bet_type: "bet" },
      config: { rtp: null, purchased_features: ["buy_bonus", "buy_super"], gamble_limit: null },
      god_data: args.god === "random" ? { random: randomUint32() } : godData,
    };

    const result = await callPlay(args.url, params);
    const finance = result.finance[0];
    totalWinChangeCents += finance.win_change;
    if (args.dump) dumpedSteps.push(result);

    if (args.visual) {
      console.log(renderStep(result.resp.events || [], step));
    } else if (!args.quiet) {
      const eventTypes = (result.resp.events || []).map((e) => e.type);
      console.log(
        `  step ${step}: bet=${finance.bet} win_change=${finance.win_change} final=${result.final} events=[${eventTypes.join(", ")}]`
      );
    }

    round = result.round;
    game = result.game;
    final = result.final;
    step += 1;

    if (step > 2000) {
      throw new Error("Round did not finish within 2000 steps - aborting (possible backend bug)");
    }
  }

  console.log(`  -> ${step} step(s), total win_change=${totalWinChangeCents} cents`);
  return dumpedSteps;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Mock runner targeting ${args.url}`);
  const allDumpedSteps = [];
  for (let i = 0; i < args.rounds; i++) {
    allDumpedSteps.push(...(await playOneRound(args, i)));
  }
  if (args.dump) {
    fs.writeFileSync(args.dump, JSON.stringify({ steps: allDumpedSteps }, null, 2));
    console.log(`\nDumped ${allDumpedSteps.length} step(s) to ${args.dump}`);
  }
}

main().catch((err) => {
  console.error("Mock runner failed:", err.message);
  process.exit(1);
});
