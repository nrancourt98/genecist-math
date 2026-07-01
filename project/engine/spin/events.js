// Event builder functions matching the canonical shapes in
// library/configs/event_config_base.json. See docs/game-design-spec.md.

function revealEvent(board, gameType, paddingPositions, anticipation) {
  return { type: "reveal", board, paddingPositions, gameType, anticipation };
}

function winInfoEvent(totalWin, wins) {
  return { type: "winInfo", totalWin, wins };
}

function setWinEvent(amount, winLevel) {
  return { type: "setWin", amount, winLevel };
}

function setTotalWinEvent(amount) {
  return { type: "setTotalWin", amount };
}

function newSwitchEvent(spins, wild, switchSymbols) {
  return { type: "newSwitch", info: { spins, wild, switch_symbols: switchSymbols } };
}

function newSwitchSpinsEvent(spins) {
  return { type: "newSwitchSpins", spins };
}

function updateSwitchSpinsEvent(spins) {
  return { type: "updateSwitchSpins", spins };
}

function switchingSymbolsEvent(switchedSymbols) {
  return { type: "switchingSymbols", switchedSymbols };
}

// Initial trigger AND a mid-feature upgrade both use this shape (the Python source's
// fs_trigger_event emits this same shape for both - it only switches to the
// freeSpinRetrigger shape when an fs_added value is involved).
function freeSpinTriggerEvent(totalFs, positions) {
  return { type: "freeSpinTrigger", totalFs, positions };
}

function freeSpinRetriggerEvent(fsAdded, totalFs, positions) {
  return { type: "freeSpinRetrigger", fs_added: fsAdded, totalFs, positions };
}

function selectedModeEvent(mode) {
  return { type: "selectedMode", mode };
}

function updateFreeSpinEvent(amount, total) {
  return { type: "updateFreeSpin", amount, total };
}

function freeSpinEndEvent(amount, winLevel) {
  return { type: "freeSpinEnd", amount, winLevel };
}

function finalWinEvent(amount) {
  return { type: "finalWin", amount };
}

module.exports = {
  revealEvent,
  winInfoEvent,
  setWinEvent,
  setTotalWinEvent,
  newSwitchEvent,
  newSwitchSpinsEvent,
  updateSwitchSpinsEvent,
  switchingSymbolsEvent,
  freeSpinTriggerEvent,
  freeSpinRetriggerEvent,
  selectedModeEvent,
  updateFreeSpinEvent,
  freeSpinEndEvent,
  finalWinEvent,
};
