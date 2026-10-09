// Loads the converted reel-strip JSON files (run `npm run gen-reels` to regenerate them
// from engine/data/reelWeights.js after tuning a weight table, or `npm run convert-reels`
// after hand-editing a reels/*.csv directly).

// Unsuffixed strips are the 96% profile's; *_94 are the 94% profile's (see config/rtpProfiles.js).
const REEL_NAMES = [
  "BR0", "FR0", "FR1", "FR0_BUY", "FR1_BUY",
  "BR0_94", "FR1_94", "FR0_BUY_94", "FR1_BUY_94",
];

const REELS = Object.fromEntries(REEL_NAMES.map((name) => [name, require(`../data/reels/${name}.json`)]));

/**
 * @param {string} name - one of REEL_NAMES
 * @returns {string[][]}
 */
function getReel(name) {
  const reel = REELS[name];
  if (!reel) throw new Error(`Unknown reel set: ${name}`);
  return reel;
}

module.exports = { REELS, REEL_NAMES, getReel };
