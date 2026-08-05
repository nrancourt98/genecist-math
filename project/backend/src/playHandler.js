// The `play` JSON-RPC method. One call resolves a complete round — base spin plus all
// resulting freespins (retriggers, switch sequences, upgrades, wincap) — and always
// returns final:true with round:{} so Runner never needs to poll for bonus steps.
// All events from every internal spin are concatenated in chronological order;
// finance.win_change is the total round win across base and freegame.

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
// - req.purchased_feature: "buy_bonus" (100x, R-mode) | "buy_super" (300x, S-mode) -
//   buys straight into the matching free-spin mode, skipping the base phase entirely.
// - req.bet_mode: "baseplus" - opts a *normal* (non-buy) round into the ante-bet mode
//   with boosted free-spin odds. Defaults to "base" when absent/unrecognized.
const PURCHASED_FEATURE_TO_BET_MODE = { buy_bonus: "bonus", buy_super: "super" };

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
  const fresh = isFreshRound(round);
  console.log(`[play] req.bet=${req.bet} purchased_feature=${req.purchased_feature ?? "-"} fresh=${fresh}`);

  const betAmountCents = Math.trunc(Number(req.bet));
  const roundState = fresh ? createInitialRoundState(resolveBetMode(req), betAmountCents) : round;

  const rng = maybeCreateGodRng(god_data) || (await createRemoteRng());

  const { events, winDeltaCenti } = resolveFullRound(roundState, rng);

  const winChangeCents = centiMultiplierToCents(winDeltaCenti, roundState.betAmountCents);
  const costMultiplier = BET_MODE_COST_MULTIPLIER[roundState.betMode];

  const finance = [
    {
      type: "betting",
      bet: fresh ? -Math.round(betAmountCents * costMultiplier) : 0,
      base: betAmountCents,
      win_change: winChangeCents,
    },
  ];

  return {
    round: {},
    game: game || {},
    finance,
    resp: { events, bet: roundState.betAmountCents },
    final: true,
  };
}

module.exports = { handlePlay, resolveBetMode, VALID_BET_MODES };
