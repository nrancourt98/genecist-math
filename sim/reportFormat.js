'use strict';

const COL_WIDTH = 72;
const BAR_WIDTH = 30;
const DIVIDER   = '═'.repeat(COL_WIDTH);
const THIN      = '─'.repeat(COL_WIDTH);

const { BUCKET_LABELS, NUM_BUCKETS } = require('./statsCollector');

function pct(v, decimals = 2)  { return (v * 100).toFixed(decimals) + '%'; }
function mult(v, decimals = 2) { return v.toFixed(decimals) + '×'; }
function num(v, decimals = 2)  { return v.toFixed(decimals); }
function commas(n)             { return n.toLocaleString(); }

function row(label, value) {
  const gap = Math.max(1, COL_WIDTH - label.length - value.length);
  return label + ' '.repeat(gap) + value;
}

function pad(s, w, right = false) {
  const str    = String(s);
  const spaces = Math.max(0, w - str.length);
  return right ? ' '.repeat(spaces) + str : str + ' '.repeat(spaces);
}

function sectionLine(title) {
  const inner = ` ${title} `;
  const left  = Math.floor((COL_WIDTH - inner.length) / 2);
  const right = COL_WIDTH - left - inner.length;
  return '─'.repeat(left) + inner + '─'.repeat(right);
}

function bar(fraction, width) {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * @param {string} mode       - bet mode simulated
 * @param {number} n          - number of rounds
 * @param {object} s          - summary() output from createStatsCollector
 * @param {number} elapsedMs  - wall-clock time
 * @param {number} numWorkers - parallel workers used
 */
function formatReport(mode, n, s, elapsedMs, numWorkers) {
  const lines = [];
  const roundsPerSec = n / (elapsedMs / 1000);
  const workersLabel = numWorkers > 1 ? ` (${numWorkers} workers)` : '';

  lines.push('');
  lines.push(DIVIDER);
  lines.push(pad(`  GENECIST — Simulation Report  [mode: ${mode.toUpperCase()}]`, COL_WIDTH));
  lines.push(DIVIDER);
  lines.push(row('  Rounds simulated', commas(n)));
  lines.push(row('  Elapsed time',     `${(elapsedMs / 1000).toFixed(1)}s${workersLabel}`));
  lines.push(row('  Throughput',       `${commas(Math.round(roundsPerSec))} rounds/sec`));

  // ── RTP ──────────────────────────────────────────────────────────────────────
  lines.push('');
  lines.push(sectionLine('RTP'));
  lines.push(row('  Overall RTP',           pct(s.rtp, 4)));
  lines.push(row('  Basegame contribution', pct(s.rtp * s.basegameRtpShare, 4)));
  lines.push(row('  Freegame contribution', pct(s.rtp * s.freegameRtpShare, 4)));

  // ── Win Profile ───────────────────────────────────────────────────────────────
  lines.push('');
  lines.push(sectionLine('Win Profile'));
  lines.push(row('  Hit rate',          pct(s.hitRate, 2)));
  lines.push(row('  Avg win / round',   mult(s.avgWinMultiplier, 3)));
  lines.push(row('  Std dev of win',    mult(s.stdDevWinMultiplier, 3)));
  lines.push(row('  Max observed win',  mult(s.maxWinMultiplier, 2)));
  const wincapOneIn = s.wincapRate > 0 ? ` (1 in ${commas(Math.round(1 / s.wincapRate))})` : '';
  lines.push(row('  Wincap hit rate', pct(s.wincapRate, 4) + wincapOneIn));

  // ── Win Distribution ──────────────────────────────────────────────────────────
  lines.push('');
  lines.push(sectionLine('Win Distribution'));
  lines.push('  ' + pad('Range', 14) + pad('Count', 12, true) + '  ' + pad('1-in-N', 12, true) + '  Histogram');
  lines.push('  ' + THIN.slice(0, COL_WIDTH - 2));
  const maxBucket = Math.max(...s.winBuckets);
  for (let i = 0; i < NUM_BUCKETS; i++) {
    const count   = s.winBuckets[i];
    const freq    = count / n;
    const barStr  = bar(maxBucket > 0 ? count / maxBucket : 0, BAR_WIDTH);
    const oneInN  = freq > 0 ? `1 in ${commas(Math.round(1 / freq))}` : '—';
    lines.push(
      '  ' +
      BUCKET_LABELS[i] + '  ' +
      pad(commas(count), 10, true) + '  ' +
      pad(oneInN, 12, true) + '  ' +
      barStr
    );
  }

  // ── Free Spins ────────────────────────────────────────────────────────────────
  lines.push('');
  lines.push(sectionLine('Free Spins'));
  lines.push(row('  Any FS trigger rate', pct(s.fsTriggerRate, 4)));

  if (mode === 'base' || mode === 'baseplus') {
    lines.push(row('  → R-mode trigger rate', pct(s.fsRTriggerRate, 4)));
    lines.push(row('  → S-mode trigger rate', pct(s.fsSTriggerRate, 4)));
    const every1inR = s.fsRTriggerRate > 0 ? Math.round(1 / s.fsRTriggerRate) : '—';
    const every1inS = s.fsSTriggerRate > 0 ? Math.round(1 / s.fsSTriggerRate) : '—';
    lines.push(row('  → 1 in N rounds (R)',   `${every1inR} rounds`));
    lines.push(row('  → 1 in N rounds (S)',   `${every1inS} rounds`));
  }

  lines.push(row('  Retrigger rate (in FS)',  pct(s.fsRetriggerRate, 2)));
  if (s.fsUpgradeRate !== null) {
    lines.push(row('  Upgrade rate (R→S)',     pct(s.fsUpgradeRate, 2)));
  }
  lines.push(row('  Avg FS win / FS round',   mult(s.avgFsWinMult, 2)));

  // ── Switch Spins ──────────────────────────────────────────────────────────────
  lines.push('');
  lines.push(sectionLine('Switch Spins'));
  lines.push(row('  Seq trigger rate',       num(s.switchTriggerRate, 4) + '× per round'));
  lines.push(row('  Avg spins per sequence', num(s.avgSpinsPerSeq, 2)));
  lines.push(row('  Wild-mode share',        pct(s.switchWildShare, 2)));
  lines.push(row('  Avg peak symbols',       num(s.avgPeakSwitchSymbols, 2)));

  lines.push('');
  lines.push(DIVIDER);
  lines.push('');

  return lines.join('\n');
}

module.exports = { formatReport };
