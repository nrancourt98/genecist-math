// Symbol roster and special-symbol roles.
// See docs/game-design-spec.md "Symbols".

const PAYING_SYMBOLS = ["H1", "H2", "H3", "H4", "H5", "L1", "L2", "L3", "L4", "L5"];

const WILD = "W";
const SCATTER = "S";
const SWITCH = "SW";

// Switch-spins substitution target when a drop resolves to "not wild" (gamestate.py hardcodes "H5").
const HIGHEST_SYMBOL = "H5";

// Eligible pool for NEW switch-spins target symbols. H5 excluded (it's the substitution
// target, never a source); W/S/SW excluded (never eligible — game_config.py / gamestate.py).
const SWITCH_SOURCE_POOL = ["L1", "L2", "L3", "L4", "L5", "H1", "H2", "H3", "H4"];

module.exports = {
  PAYING_SYMBOLS,
  WILD,
  SCATTER,
  SWITCH,
  HIGHEST_SYMBOL,
  SWITCH_SOURCE_POOL,
};
