// RTP profiles. BGaming selects one per session through `config.rtp` (it suggests a ~96% and
// a ~94% version - see docs/bgaming-compliance.md "RTP guidance"). A round records its profile
// in roundState.rtpProfile when it starts, so the profile can't change mid-round.
//
// "96" is the primary profile: its values live in switchTables.js, basePlus.js and the
// unsuffixed reel strips. Other profiles are overrides on top of it.
//
// The 94% reelsets are derived from the 96% strips by swapping a number of high-pay cells for
// low-pay ones (see data/reelWeights.js DERIVED_REELS, which also explains why FR0 is shared).
// Scatters never move, so every feature trigger, retrigger and upgrade rate matches the 96%
// profile; only the payouts drop.

const SWITCH_TABLES_96 = require("./switchTables");
const { bagFromCounts } = SWITCH_TABLES_96;
const { BASEPLUS_BOOST_CHANCE } = require("../features/basePlus");

const DEFAULT_RTP_PROFILE = "96";

const RTP_PROFILES = {
  96: {
    reels: {},
    switchTables: SWITCH_TABLES_96,
    basePlusBoostChance: BASEPLUS_BOOST_CHANCE,
  },
  94: {
    reels: { BR0: "BR0_94", FR1: "FR1_94", FR0_BUY: "FR0_BUY_94", FR1_BUY: "FR1_BUY_94" },
    switchTables: {
      ...SWITCH_TABLES_96,
      // BR0_94's swaps remove switch targets, which costs feature_spins (~8 switch spins per
      // round) ~2.6pp vs ~1pp for base; +18 on the 96% bag (some 8s -> 9, 9s -> 10) gives
      // back the difference. ~0.075pp per +1.
      SPINS_AWARD_BAG_FEATURE_SPINS: bagFromCounts({ 5: 16, 6: 32, 7: 16, 8: 23, 9: 19, 10: 38, 13: 16 }), // mean 8.29
      // Certification re-centre (2026-10): one step below the 96% natural S bag (sum 396 vs 397)
      // puts base at 94.00%; the 96% bag would land 94.06%.
      SPINS_AWARD_BAG_S: bagFromCounts({ 1: 36, 2: 32, 3: 28, 4: 8, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4 }), // mean 3.09
      // Keeps the pre-re-centre 80-entry bag (sum 282, same as 564/160): with the shared S_BUY step
      // that puts bonus at 94.03%; the 96% half-step down would land 93.96%.
      SPINS_AWARD_BAG_R_BUY: bagFromCounts({ 1: 18, 2: 14, 3: 8, 4: 16, 5: 8, 6: 8, 7: 4, 8: 4 }), // mean 3.53
    },
    // Same 6.02% as the 96% profile: puts baseplus at 94.00% with the 94% strips and bags above.
    basePlusBoostChance: BASEPLUS_BOOST_CHANCE,
  },
};

/**
 * Maps BGaming's `config.rtp` ("94", "94.0", 94, ...) to a profile name by exact numeric match.
 * Anything else - including null, which local tooling sends - falls back to the 96% profile.
 * @param {string|number|null|undefined} configRtp
 * @returns {string}
 */
function resolveRtpProfile(configRtp) {
  const value = Number.parseFloat(configRtp);
  const match = Object.keys(RTP_PROFILES).find((name) => Number(name) === value);
  return match ?? DEFAULT_RTP_PROFILE;
}

/**
 * @param {string} [name] - a roundState.rtpProfile; rounds started before profiles existed have
 *   none, and get the 96% profile they were played under
 */
function getRtpProfile(name = DEFAULT_RTP_PROFILE) {
  const profile = RTP_PROFILES[name];
  if (!profile) throw new Error(`Unknown RTP profile: ${name}`);
  return profile;
}

/** Physical reel-strip name for a logical one ("BR0", "FR0_BUY", ...) under a profile. */
function profileReelName(profile, logicalName) {
  return profile.reels[logicalName] ?? logicalName;
}

module.exports = { DEFAULT_RTP_PROFILE, RTP_PROFILES, resolveRtpProfile, getRtpProfile, profileReelName };
