const { getReel } = require("../config/reels");
const { drawBoard } = require("../board/drawBoard");
const { evaluateLines } = require("../wins/lineEvaluator");
const { buildWinEntries, assignWildMultipliers } = require("../wins/wildMultiplier");
const { checkWincap } = require("../wins/wincap");
const { getWinLevel } = require("../wins/winLevel");
const {
  createInitialSwitchState,
  maybeDropSwitch,
  resolveSwitchAward,
  applySwitchReplacement,
} = require("../features/switchSpins");
const {
  checkBaseTrigger,
  checkFreeSpinContinuation,
  createInitialFreeSpinState,
  buildSyntheticTriggerBoard,
  findSymbolPositions,
} = require("../features/freeSpins");
const { maybeApplyBasePlusBoost } = require("../features/basePlus");
const { SCATTER } = require("../config/symbols");
const events = require("./events");

// base/baseplus reach this for their real base-game spins; bonus/super reach it too, but
// only for resolveBuyTriggerStep's synthetic filler board (see createInitialRoundState's
// "buyTrigger" phase) - they never reach resolveBaseSpinStep itself.
const BASE_REEL_BY_MODE = { base: "BR0", baseplus: "BR0", bonus: "BR0", super: "BR0" };

/**
 * Resolve exactly one spin-equivalent of work: one board reveal, its line evaluation,
 * and whatever switch/free-spin bookkeeping that single board triggers. Never more than
 * one `reveal` event per call - this is what makes a round resumable across stateless
 * HTTP calls (see docs/architecture.md "The step-function").
 *
 * @param {object} roundState - see roundState.js; NOT mutated, a clone is returned
 * @param {import("../rng/rngInterface")} rng
 * @param {(reelName: string) => string[][]} [reelProvider] - defaults to the real reel
 *   sets (engine/config/reels.js); tests inject a synthetic provider here so board
 *   content is fully known/controllable without needing to mock the real multi-thousand
 *   row reel data.
 * @returns {{events: object[], roundState: object, winDeltaCenti: number, isRoundFinal: boolean}}
 */
function resolveOneSpin(roundState, rng, reelProvider = getReel) {
  const next = structuredClone(roundState);
  next.spinSeq += 1;
  const out = [];

  const winBefore = next.basegameWinsCenti + next.freegameWinsCenti;

  if (next.phase === "base") {
    resolveBaseSpinStep(next, rng, out, reelProvider);
  } else if (next.phase === "buyTrigger") {
    resolveBuyTriggerStep(next, rng, out, reelProvider);
  } else if (next.phase === "freespins") {
    resolveFreeSpinStep(next, rng, out, reelProvider);
  } else {
    throw new Error(`resolveOneSpin called on a round already in phase "${next.phase}"`);
  }

  const isRoundFinal = next.phase === "done";
  if (isRoundFinal) {
    out.push(events.finalWinEvent(next.basegameWinsCenti + next.freegameWinsCenti));
  }

  const winAfter = next.basegameWinsCenti + next.freegameWinsCenti;

  return { events: out, roundState: next, winDeltaCenti: winAfter - winBefore, isRoundFinal };
}

function resolveBaseSpinStep(state, rng, out, reelProvider) {
  const gameMode = "base";

  // Captured before the decrement below mutates it: "was a sequence already running
  // going into this spin" (gamestate.py's switch_activated, carried over from the end of
  // the previous iteration). Gates switch-symbol replacement further down - the
  // triggering spin of a fresh sequence must never replace anything itself (matches
  // source), and an ordinary spin occurring after a PAST sequence has already ended must
  // not replace either, even though switch.symbols may still be remembered (base mode
  // never resets it - see docs/architecture.md's judgment-call log). Without this gate,
  // symbols.length>0 alone was triggering replacement on every later spin for the rest
  // of the round - a catastrophic RTP bug caught via the offline simulator.
  const sequenceWasActive = state.switch.spins > 0;

  if (sequenceWasActive) {
    state.switch.spins -= 1;
    out.push(events.updateSwitchSpinsEvent(state.switch.spins));
  }

  const reelStrip = reelProvider(BASE_REEL_BY_MODE[state.betMode]);
  const board = drawBoard(reelStrip, rng);

  // Once per round only - see engine/features/basePlus.js.
  if (state.betMode === "baseplus" && !state.basePlusBoostApplied) {
    maybeApplyBasePlusBoost(board, rng);
    state.basePlusBoostApplied = true;
  }

  assignWildMultipliers(board, gameMode, rng);

  const dropPosition = maybeDropSwitch(state.switch, gameMode, rng);
  if (dropPosition) {
    board[dropPosition.reel][dropPosition.row] = { name: "SW", switch: true };
  }

  out.push(events.revealEvent(board, "basegame", randomPaddingPositions(rng, reelStrip), [0, 0, 0, 0, 0, 0]));

  const changes = sequenceWasActive ? applySwitchReplacement(board, state.switch) : [];
  if (changes.length > 0) out.push(events.switchingSymbolsEvent(changes));
  assignWildMultipliers(board, gameMode, rng); // picks up any switch-created W cells

  evaluateAndRecordWin(state, board, "basegameWinsCenti", out);

  if (dropPosition) {
    const award = resolveSwitchAward(state.switch, gameMode, rng);
    out.push(events.newSwitchEvent(award.spinsAwarded, award.wild, award.symbols));
    out.push(events.newSwitchSpinsEvent(award.totalSpins));
  }

  const wincapEvent = checkWincap(state);
  if (wincapEvent) out.push(wincapEvent);

  // Unlike the free-spin modes (which re-check every single spin, switch sequence or
  // not), the classic Free Spins trigger check for base game only ever runs ONCE the
  // switch sequence has fully concluded (verified directly in gamestate.py: the
  // in-loop check is a no-op for live play, only the post-loop check actually calls
  // run_freespin_from_base()).
  if (state.switch.spins === 0) {
    if (!state.cappedWin) {
      const trigger = checkBaseTrigger(board);
      if (trigger) {
        out.push(events.freeSpinTriggerEvent(10, trigger.positions));
        state.phase = "freespins";
        state.freeSpin = createInitialFreeSpinState(trigger.mode);
      }
    }
    if (state.phase === "base") {
      // Switch sequence ended (or never started), no FS trigger (or capped) - round over.
      state.phase = "done";
    }
  }
}

// Bonus/super's one-step entry: shows a synthetic "triggering" board (forced scatter
// count, but otherwise natural-looking filler - see freeSpins.js's
// buildSyntheticTriggerBoard) before the bought feature actually starts. Its incidental
// line wins are honoured exactly like a natural trigger spin's are - same
// evaluate/wincap ordering as resolveBaseSpinStep - so buying isn't worth strictly less
// than a natural trigger landing the same board would have been. A separate step from
// the feature's first real spin either way - resolveOneSpin never emits more than one
// `reveal` per call, so these can't be merged into one response without breaking that
// invariant (see docs/architecture.md's judgment-call log, "buy-feature triggering
// board").
function resolveBuyTriggerStep(state, rng, out, reelProvider) {
  const reelStrip = reelProvider(BASE_REEL_BY_MODE[state.betMode]);
  const board = buildSyntheticTriggerBoard(state.freeSpin.mode, reelStrip, rng);
  assignWildMultipliers(board, "base", rng);

  out.push(events.revealEvent(board, "basegame", randomPaddingPositions(rng, reelStrip), [0, 0, 0, 0, 0, 0]));

  evaluateAndRecordWin(state, board, "basegameWinsCenti", out);

  const wincapEvent = checkWincap(state);
  if (wincapEvent) out.push(wincapEvent);

  // Mirrors resolveBaseSpinStep: a wincap hit this spin forcibly ends the round right
  // here (checkWincap already nulled state.freeSpin and set phase "done") - the bought
  // feature is forfeited rather than also starting on top of an already-capped round.
  if (!state.cappedWin) {
    out.push(events.freeSpinTriggerEvent(state.freeSpin.totFs, findSymbolPositions(board, SCATTER)));
    state.phase = "freespins";
  }
}

function resolveFreeSpinStep(state, rng, out, reelProvider) {
  const freeSpin = state.freeSpin;
  const gameMode = freeSpin.mode;
  const isFirstSpinOfMode = freeSpin.fs === 0 && state.switch.spins === 0;

  if (isFirstSpinOfMode) {
    out.push(events.selectedModeEvent(freeSpin.mode));
  }

  // See the identical capture in resolveBaseSpinStep for why this must be read before
  // the decrement below mutates it.
  const sequenceWasActive = state.switch.spins > 0;

  // Mutually exclusive per spin: a switch-resolution spin does NOT also advance the
  // free-spin counter (it's a bonus iteration layered on top, not counted against the
  // budget) - verified directly in gamestate.py's if/else structure.
  if (sequenceWasActive) {
    state.switch.spins -= 1;
    out.push(events.updateSwitchSpinsEvent(state.switch.spins));
  } else {
    freeSpin.fs += 1;
    out.push(events.updateFreeSpinEvent(freeSpin.fs, freeSpin.totFs));
  }

  const reelStrip = reelProvider(freeSpin.reelSet);
  const board = drawBoard(reelStrip, rng);
  assignWildMultipliers(board, gameMode, rng);

  const dropPosition = maybeDropSwitch(state.switch, gameMode, rng);
  if (dropPosition) {
    board[dropPosition.reel][dropPosition.row] = { name: "SW", switch: true };
  }

  out.push(events.revealEvent(board, "freegame", randomPaddingPositions(rng, reelStrip), [0, 0, 0, 0, 0, 0]));

  const changes = sequenceWasActive ? applySwitchReplacement(board, state.switch) : [];
  if (changes.length > 0) out.push(events.switchingSymbolsEvent(changes));
  assignWildMultipliers(board, gameMode, rng); // picks up any switch-created W cells

  evaluateAndRecordWin(state, board, "freegameWinsCenti", out);

  if (dropPosition) {
    const award = resolveSwitchAward(state.switch, gameMode, rng);
    out.push(events.newSwitchEvent(award.spinsAwarded, award.wild, award.symbols));
    out.push(events.newSwitchSpinsEvent(award.totalSpins));
  }

  // R-mode forgets its switch-target symbols the instant a sequence ends (gamestate.py
  // run_freespin:227); base game and S-mode deliberately do not (see
  // docs/architecture.md's judgment-call log) - this was documented but never actually
  // implemented until now, caught alongside the replacement-gating bug above.
  if (gameMode === "R" && state.switch.spins === 0) {
    state.switch.symbols = [];
  }

  const wincapEvent = checkWincap(state);
  if (wincapEvent) out.push(wincapEvent);

  // Unlike base game, retrigger/upgrade is checked every single spin regardless of
  // switch state (verified directly in gamestate.py - it's outside any switch_spins
  // guard, only gated by the wincap if/else).
  if (!state.cappedWin) {
    const continuation = checkFreeSpinContinuation(freeSpin, board);
    if (continuation && continuation.type === "upgrade") {
      out.push(events.freeSpinTriggerEvent(10, continuation.positions));
      // Upgrading resets the switch sequence entirely (gamestate.py
      // upgrade_super_freespin resets switch_spins/switch_symbols/switch_wild) - this
      // differs from a same-tier retrigger, which does not reset switch state.
      state.switch = createInitialSwitchState();
      state.freeSpin = createInitialFreeSpinState("S");
    } else if (continuation && continuation.type === "retrigger") {
      freeSpin.totFs += continuation.fsAdded;
      out.push(events.freeSpinRetriggerEvent(continuation.fsAdded, freeSpin.totFs, continuation.positions));
    }
  }

  // The feature can end here two ways: the natural spin budget is exhausted with no
  // active switch sequence, OR checkWincap already forced phase to "done" above (and
  // nulled state.freeSpin) - either way freeSpinEnd must fire exactly once, matching
  // gamestate.py's end_freespin(), which runs unconditionally once its while-loop exits
  // regardless of which condition caused that exit.
  const featureEndedNaturally =
    state.freeSpin && state.freeSpin.fs >= state.freeSpin.totFs && state.switch.spins === 0;
  if (featureEndedNaturally) {
    state.phase = "done";
  }
  if (state.phase === "done") {
    out.push(events.freeSpinEndEvent(state.freegameWinsCenti, getWinLevel(state.freegameWinsCenti)));
  }
}

function evaluateAndRecordWin(state, board, bucketKey, out) {
  const lineResults = evaluateLines(board);
  const winEntries = buildWinEntries(lineResults, board);
  const spinWinCenti = winEntries.reduce((sum, winEntry) => sum + winEntry.win, 0);
  state[bucketKey] += spinWinCenti;

  if (winEntries.length > 0) {
    out.push(events.winInfoEvent(spinWinCenti, winEntries));
    out.push(events.setWinEvent(spinWinCenti, getWinLevel(spinWinCenti)));
  }
  out.push(events.setTotalWinEvent(state.basegameWinsCenti + state.freegameWinsCenti));

  return spinWinCenti;
}

// Cosmetic/animation-continuity field only (see docs/game-design-spec.md "Reels") - no
// frontend in this project's scope consumes it, but it's emitted for event-shape
// fidelity against the established protocol.
function randomPaddingPositions(rng, reelStrip) {
  const numReels = reelStrip[0].length;
  return Array.from({ length: numReels }, () => rng.randInt(reelStrip.length));
}

module.exports = { resolveOneSpin };
