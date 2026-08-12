// The `play` JSON-RPC method. Resolves a complete round in two steps so the frontend
// can control pacing:
//
// Step 1 — computation: resolveFullRound runs, all events returned with final: false.
//   Bet is charged and full win credited in finance. A small sentinel stored in `round`
//   keeps the runner's lock open until the frontend is ready to commit.
//
// Step 2 — confirm: frontend sends a second play call after finishing animations.
//   Backend detects awaiting_confirm, returns final: true with round: {} and
//   win_change: 0 (already applied in step 1). Runner releases the round lock.
//
// Disconnect recovery: if the player disconnects between steps, the runner preserves
// the sentinel in state_lock. On re-init, state.awaiting_confirm === true tells the
// frontend to skip animations and fire the confirm call immediately, echoing
// state.winChangeCents for any summary display.

const {
  resolveFullRound,
  createInitialRoundState,
  isFreshRound,
  BET_MODE_COST_MULTIPLIER,
  VALID_BET_MODES,
  centiMultiplierToCents,
} = require("../../engine");
const { createRemoteRng } = require("./rng/rngClient");
const { maybeCreateGodRng } = require("./godMode");

// Our own custom req fields (BGaming's docs explicitly allow custom req fields - see
// docs/architecture.md's judgment-call log):
// - req.purchased_feature: "buy_bonus" (100x, R-mode) | "buy_chance" (300x, S-mode) -
//   buys straight into the matching free-spin mode, skipping the base phase entirely.
//   Names are runner-constrained: only buy_bonus/buy_chance/buy_bonus_and_chance are valid.
// - req.bet_mode: "baseplus" - opts a *normal* (non-buy) round into the ante-bet mode
//   with boosted free-spin odds. Defaults to "base" when absent/unrecognized.
const PURCHASED_FEATURE_TO_BET_MODE = { buy_bonus: "bonus", buy_chance: "super" };

function resolveBetMode(req) {
  if (req.purchased_feature) {
    const mode = PURCHASED_FEATURE_TO_BET_MODE[req.purchased_feature];
    if (!mode) throw new Error(`Unknown purchased_feature: ${req.purchased_feature}`);
    return mode;
  }
  return req.bet_mode === "baseplus" ? "baseplus" : "base";
}

async function handlePlay(params) {
  const { round, game, req, god_data } = params;

  // Step 2: frontend signals it has finished animating — close the round
  if (round?.awaiting_confirm) {
    console.log(`[play] confirm betAmountCents=${round.betAmountCents} winChangeCents=${round.winChangeCents}`);
    return {
      round: {},
      game: game || {},
      finance: [{ type: "betting", bet: 0, base: round.betAmountCents, win_change: 0 }],
      resp: { events: [], bet: round.betAmountCents, totalWin: round.winChangeCents },
      final: true,
    };
  }

  // Step 1: resolve the full round and deliver all events
  const fresh = isFreshRound(round);
  console.log(`[play] req.bet=${req.bet} purchased_feature=${req.purchased_feature ?? "-"} fresh=${fresh}`);

  const betAmountCents = Math.trunc(Number(req.bet));
  const roundState = fresh ? createInitialRoundState(resolveBetMode(req), betAmountCents) : round;

  const isBonusMode = roundState.betMode === "bonus" || roundState.betMode === "super";
  const rng = maybeCreateGodRng(god_data) || (await createRemoteRng(isBonusMode ? 800 : 600));

  const { events, winDeltaCenti } = resolveFullRound(roundState, rng);

  const winChangeCents = centiMultiplierToCents(winDeltaCenti, roundState.betAmountCents);
  const costMultiplier = BET_MODE_COST_MULTIPLIER[roundState.betMode];

  return {
    round: { awaiting_confirm: true, betAmountCents: roundState.betAmountCents, winChangeCents },
    game: game || {},
    finance: [{
      type: "betting",
      bet: fresh ? -Math.round(betAmountCents * costMultiplier) : 0,
      base: betAmountCents,
      win_change: winChangeCents,
    }],
    resp: { events, bet: roundState.betAmountCents, totalWin: winChangeCents },
    final: false,
  };
}

module.exports = { handlePlay, resolveBetMode, VALID_BET_MODES };