#!/usr/bin/env node
// Renders a round's event log as a human-readable terminal view: the 6x5 board as a
// colored grid (winning positions marked), then a plain-language summary of every
// non-reveal event in order. Pure debug/QA tooling - not part of the game or its
// delivery (see docs/architecture.md's judgment-call log, "Dev-only event
// visualizers"). Used two ways:
//   - As a library: mockRunner.js's --visual flag calls renderStep() directly per step.
//   - As a CLI: `node devtools/eventVisualizer.js <dump.json>` replays a saved round
//     (the same shape mockRunner.js's --dump flag writes - see its usage comment) step
//     by step, for inspecting a round after the fact (e.g. one of the forced scenarios
//     from tests/integration/playHandler.test.js, captured and dumped for a visual look).

const fs = require("node:fs");

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const COLORS = {
  H1: "\x1b[33m", H2: "\x1b[33m", H3: "\x1b[33m", H4: "\x1b[33m", H5: "\x1b[33m", // gold
  L1: "\x1b[36m", L2: "\x1b[36m", L3: "\x1b[36m", L4: "\x1b[36m", L5: "\x1b[36m", // cyan
  W: "\x1b[35m", // magenta
  S: "\x1b[32m", // green
  SW: "\x1b[31m", // red
};
const CELL_WIDTH = 5;

function colorize(text, code) {
  return `${code}${text}${RESET}`;
}

function cellLabel(cell) {
  if (cell.name === "W" && cell.multiplier > 1) return `W${cell.multiplier}x`;
  return cell.name;
}

function isWinningPosition(positions, reel, row) {
  return positions.some((p) => p.reel === reel && p.row === row);
}

/**
 * @param {{name: string, multiplier?: number}[][]} board - board[reel][row]
 * @param {{reel: number, row: number}[]} winningPositions - cells to mark, from
 *   winInfo.wins[].positions across every win this step
 * @returns {string}
 */
function renderBoard(board, winningPositions = []) {
  const numReels = board.length;
  const numRows = board[0].length;
  const lines = [];

  for (let row = 0; row < numRows; row++) {
    const cells = [];
    for (let reel = 0; reel < numReels; reel++) {
      const cell = board[reel][row];
      const label = cellLabel(cell).padEnd(CELL_WIDTH);
      const color = COLORS[cell.name] || "";
      const winning = isWinningPosition(winningPositions, reel, row);
      const styled = colorize(label, winning ? BOLD + color : color);
      cells.push(winning ? `[${styled.trimEnd()}]`.padEnd(CELL_WIDTH + 2) : ` ${styled} `);
    }
    lines.push(cells.join(""));
  }
  return lines.join("\n");
}

function describeEvent(event) {
  switch (event.type) {
    case "reveal":
      return null; // rendered separately as the board grid, not as a text line
    case "winInfo":
      return `winInfo: ${event.wins.length} winning line(s), totalWin=${event.totalWin}`;
    case "setWin":
      return `setWin: amount=${event.amount} winLevel=${event.winLevel}`;
    case "setTotalWin":
      return `setTotalWin: amount=${event.amount}`;
    case "newSwitch":
      return `newSwitch: +${event.info.spins} spin(s), wild=${event.info.wild}, symbols=[${event.info.switch_symbols.join(", ")}]`;
    case "newSwitchSpins":
      return `newSwitchSpins: total spins now ${event.spins}`;
    case "updateSwitchSpins":
      return `updateSwitchSpins: spins remaining=${event.spins}`;
    case "switchingSymbols":
      return `switchingSymbols: ${event.switchedSymbols.length} cell(s) replaced with ${event.switchedSymbols[0]?.symbol ?? "?"}`;
    case "freeSpinTrigger":
      return `freeSpinTrigger: totalFs=${event.totalFs}`;
    case "freeSpinRetrigger":
      return `freeSpinRetrigger: +${event.fs_added} spins, totalFs=${event.totalFs}`;
    case "selectedMode":
      return `selectedMode: ${event.mode}`;
    case "updateFreeSpin":
      return `updateFreeSpin: ${event.amount}/${event.total}`;
    case "freeSpinEnd":
      return `freeSpinEnd: amount=${event.amount} winLevel=${event.winLevel}`;
    case "finalWin":
      return `finalWin: amount=${event.amount}`;
    case "wincap":
      return `wincap: amount=${event.amount} (round forcibly ends)`;
    default:
      return `${event.type}: ${JSON.stringify(event)}`;
  }
}

/**
 * @param {object[]} events - one step's resp.events array
 * @param {number} [stepIndex]
 * @returns {string}
 */
function renderStep(events, stepIndex) {
  const lines = [];
  const header = stepIndex === undefined ? "--- step ---" : `--- step ${stepIndex} ---`;
  lines.push(colorize(header, BOLD));

  const reveal = events.find((e) => e.type === "reveal");
  const winInfo = events.find((e) => e.type === "winInfo");
  const switching = events.filter((e) => e.type === "switchingSymbols");
  const winningPositions = [
    ...(winInfo ? winInfo.wins.flatMap((w) => w.positions) : []),
    ...switching.flatMap((e) => e.switchedSymbols),
  ];

  if (reveal) {
    lines.push(renderBoard(reveal.board, winningPositions));
  }

  for (const event of events) {
    const description = describeEvent(event);
    if (description) lines.push(`  ${description}`);
  }

  return lines.join("\n");
}

/** @param {{resp: {events: object[]}}[]} steps - the play-result objects mockRunner's --dump writes */
function renderRound(steps) {
  return steps.map((step, i) => renderStep(step.resp.events, i)).join("\n\n");
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node devtools/eventVisualizer.js <dump.json>");
    process.exit(1);
  }
  const dump = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(renderRound(dump.steps));
}

module.exports = { renderBoard, renderStep, renderRound, describeEvent };
