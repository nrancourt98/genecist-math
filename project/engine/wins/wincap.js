// One shared wincap check, called from the step-function after every spin's win is
// tallied (any phase) - the Python source repeats this block 4 times near-verbatim
// across its loop functions; the port does not. See docs/game-design-spec.md "Win cap".

const WINCAP_MULTIPLIER = 10000; // game_config.py:23 (self.wincap = 10000.0)
const WINCAP_CENTI = WINCAP_MULTIPLIER * 100; // 1,000,000

/**
 * If the round's cumulative win (basegame + freegame) has reached or crossed the cap,
 * clip it down to exactly the cap, immediately terminate any active switch sequence
 * and free-spin feature, and return the wincap event to emit. Returns null untouched
 * otherwise.
 *
 * Clips the excess out of whichever bucket is "live" for the current phase
 * (freegameWinsCenti while phase is "freespins", basegameWinsCenti otherwise). This is
 * safe from going negative because this check runs every single spin: if
 * basegameWinsCenti alone could ever reach the cap, the round would already have been
 * capped-and-terminated while still in the base phase, before any free-spin phase could
 * begin - so by the time phase is "freespins", basegameWinsCenti is guaranteed < cap,
 * which guarantees freegameWinsCenti > excess.
 *
 * @param {{phase: string, basegameWinsCenti: number, freegameWinsCenti: number, cappedWin: boolean, switch: {spins: number}, freeSpin: object|null}} roundState
 * @returns {{type: "wincap", amount: number}|null}
 */
function checkWincap(roundState) {
  const total = roundState.basegameWinsCenti + roundState.freegameWinsCenti;
  if (total < WINCAP_CENTI) return null;

  const excess = total - WINCAP_CENTI;
  if (roundState.phase === "freespins") {
    roundState.freegameWinsCenti -= excess;
  } else {
    roundState.basegameWinsCenti -= excess;
  }

  roundState.cappedWin = true;
  roundState.switch.spins = 0;
  roundState.freeSpin = null;
  // The wincap check is the one place that definitively knows the round must end right
  // now, in any phase - set "done" directly here rather than leaving it to the caller's
  // downstream phase-transition logic, which only runs in the absence of a cap hit.
  roundState.phase = "done";

  return { type: "wincap", amount: WINCAP_CENTI };
}

module.exports = { WINCAP_MULTIPLIER, WINCAP_CENTI, checkWincap };
