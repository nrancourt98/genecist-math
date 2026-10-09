'use strict';
// Plays rounds through the public engine API for the simulation tools: a full round (with the
// per-round stats sim/statsCollector.js aggregates), a naturally-triggered free-spin session on
// its own, or a round's base phase up to its trigger. The last two are what the variance-reduced
// base/baseplus estimate is built from (see baseRtpEstimate.js).

const { resolveOneSpin, createInitialRoundState } = require('../project/engine');
const { createInitialFreeSpinState } = require('../project/engine/features/freeSpins');

const ROUND_STEP_GUARD = 5000;
const PLACEHOLDER_BET  = 100;

/** One complete round; returns the outcome record statsCollector.recordRound() expects. */
function simulateOneRound(betMode, rng, rtpProfile) {
  let roundState      = createInitialRoundState(betMode, PLACEHOLDER_BET, rtpProfile);
  let prevSwitchSpins = roundState.switch.spins;

  let switchSequenceCount = 0;
  let switchSpinsSteps    = 0;
  let switchWildCount     = 0;
  let switchHighestCount  = 0;
  let maxSwitchSymbols    = 0;

  let fsTriggerMode  = null;
  let hadFreeSpins   = betMode === 'bonus' || betMode === 'super'; // always true for buys
  let hadFsRetrigger = false;
  let hadFsUpgrade   = false;
  let hitWincap      = false;

  for (let step = 0; step < ROUND_STEP_GUARD; step++) {
    const wasBuyTriggerStep = roundState.phase === 'buyTrigger';
    const { events, roundState: next, isRoundFinal } = resolveOneSpin(roundState, rng);

    // Switch Spins: 0 → nonzero transition = fresh sequence started
    if (prevSwitchSpins === 0 && next.switch.spins > 0) {
      switchSequenceCount++;
      if (next.switch.wild) switchWildCount++;
      else                   switchHighestCount++;
    }
    if (events.some((e) => e.type === 'updateSwitchSpins')) switchSpinsSteps++;
    if (next.switch.symbols.length > maxSwitchSymbols) maxSwitchSymbols = next.switch.symbols.length;

    // Free Spins: natural first trigger (buy trigger step excluded from this stat)
    if (fsTriggerMode === null && !wasBuyTriggerStep && events.some((e) => e.type === 'freeSpinTrigger')) {
      fsTriggerMode = next.freeSpin ? next.freeSpin.mode : null;
    }

    // Free Spins: detect retrigger (+4 spins, same mode) and upgrade (R → S)
    if (events.some((e) => e.type === 'freeSpinRetrigger')) hadFsRetrigger = true;
    if (roundState.freeSpin?.mode === 'R' && next.freeSpin?.mode === 'S') hadFsUpgrade = true;

    // Track whether any FS phase was visited (base/baseplus only — buys initialised above)
    if (!hadFreeSpins && next.freeSpin !== null) hadFreeSpins = true;

    if (events.some((e) => e.type === 'wincap')) hitWincap = true;

    prevSwitchSpins = next.switch.spins;
    roundState = next;

    if (isRoundFinal) {
      // enteredRMode: bonus always enters R; base/baseplus enter R when fsTriggerMode==="R"
      const enteredRMode = betMode === 'bonus' || fsTriggerMode === 'R';
      return {
        winCenti:          roundState.basegameWinsCenti + roundState.freegameWinsCenti,
        basegameWinCenti:  roundState.basegameWinsCenti,
        freegameWinCenti:  roundState.freegameWinsCenti,
        switchSequenceCount,
        switchSpinsSteps,
        switchWildCount,
        switchHighestCount,
        maxSwitchSymbols,
        fsTriggerMode,
        hadFreeSpins,
        enteredRMode,
        hadFsRetrigger,
        hadFsUpgrade,
        hitWincap,
      };
    }
  }

  throw new Error(`simulateOneRound: round did not finish in ${ROUND_STEP_GUARD} steps (mode=${betMode})`);
}

/**
 * One naturally-triggered free-spin session, from the state a natural trigger hands the feature
 * (fresh free-spin state, clean switch state - see spinStep.js's trigger branch).
 * @returns {{winCenti: number, capped: boolean}}
 */
function simulateFreeSpinSession(mode, rng, rtpProfile) {
  let state = {
    ...createInitialRoundState('base', PLACEHOLDER_BET, rtpProfile),
    phase: 'freespins',
    freeSpin: createInitialFreeSpinState(mode, false),
  };
  for (let step = 0; step < ROUND_STEP_GUARD; step++) {
    const { roundState, isRoundFinal } = resolveOneSpin(state, rng);
    state = roundState;
    if (isRoundFinal) return { winCenti: state.freegameWinsCenti, capped: state.cappedWin };
  }
  throw new Error(`simulateFreeSpinSession: session did not finish in ${ROUND_STEP_GUARD} steps (mode=${mode})`);
}

/**
 * A round's base phase only, stopping as soon as it leaves "base" (natural FS trigger or done).
 * @returns {{winCenti: number, trigger: "R"|"S"|null}}
 */
function simulateBasePhase(betMode, rng, rtpProfile) {
  let state = createInitialRoundState(betMode, PLACEHOLDER_BET, rtpProfile);
  for (let step = 0; step < ROUND_STEP_GUARD; step++) {
    const { roundState } = resolveOneSpin(state, rng);
    state = roundState;
    if (state.phase !== 'base') {
      return { winCenti: state.basegameWinsCenti, trigger: state.phase === 'freespins' ? state.freeSpin.mode : null };
    }
  }
  throw new Error(`simulateBasePhase: base phase did not finish in ${ROUND_STEP_GUARD} steps (mode=${betMode})`);
}

module.exports = { simulateOneRound, simulateFreeSpinSession, simulateBasePhase, PLACEHOLDER_BET };
