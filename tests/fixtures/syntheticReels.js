// A tiny, fully-known synthetic reel set for spinStep integration tests. A single-row
// strip forces drawBoard's rng.randInt(stripLen) to deterministically return 0 (the only
// valid value in [0, 1)) for every reel, regardless of which RNG implementation backs
// it - so the resulting board is fully known just from the row passed in, with no need
// to mock the board-draw calls themselves. Every visible row ends up identical to that
// one row (wraparound just re-reads it), which is enough to force scatter-count-driven
// behavior (Free Spins triggers) deterministically.

const NEUTRAL_ROW = ["NEUTRAL", "NEUTRAL", "NEUTRAL", "NEUTRAL", "NEUTRAL", "NEUTRAL"];

/** @param {string[]} row - 6 symbol names, one per reel column */
function singleRowStrip(row = NEUTRAL_ROW) {
  return [row];
}

/**
 * @param {Record<string, string[][]>} reelsByName
 * @returns {(reelName: string) => string[][]}
 */
function buildReelProvider(reelsByName) {
  return (reelName) => {
    const strip = reelsByName[reelName];
    if (!strip) throw new Error(`syntheticReels: no strip registered for "${reelName}"`);
    return strip;
  };
}

module.exports = { NEUTRAL_ROW, singleRowStrip, buildReelProvider };
