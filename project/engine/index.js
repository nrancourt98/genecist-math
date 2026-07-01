// Public engine API surface - the only module the backend and the simulation CLI should
// need to reach into. Everything else under engine/ is an internal implementation detail
// reachable by relative path (mainly for tests), but not part of the supported surface.

const { resolveOneSpin } = require("./spin/spinStep");
const {
  createInitialRoundState,
  isFreshRound,
  BET_MODE_COST_MULTIPLIER,
  VALID_BET_MODES,
} = require("./spin/roundState");
const { centiMultiplierToCents } = require("./units");
const { createRngFromUint32Source } = require("./rng/deriveRng");
const { createLocalPrng } = require("./rng/localPrng");

module.exports = {
  resolveOneSpin,
  createInitialRoundState,
  isFreshRound,
  BET_MODE_COST_MULTIPLIER,
  VALID_BET_MODES,
  centiMultiplierToCents,
  createRngFromUint32Source,
  createLocalPrng,
};
