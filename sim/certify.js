#!/usr/bin/env node
// Certification run: every bet mode under every RTP profile, in one resumable command.
//
//   npm run certify                 # full run (~17h on a 20-thread desktop; see sim/README.md)
//   npm run certify -- --smoke      # ~2 minute end-to-end check of the whole pipeline
//
// Options: --out <dir> (default sim/results/certification), --workers <n>, --scale <x> (multiplies
// every job's size), --profiles 96,94, --seed <n>, --fresh (discard a previous run's progress).
//
// For each profile it runs:
//   - a direct simulation of each bet mode (RTP plus the full win/feature statistics), and
//   - the variance-reduced base/baseplus estimate (estimateBaseRtp.js): natural R/S free-spin
//     sessions and base phases. Direct base/baseplus RTP stays wide (sigma ~37x bet per round)
//     even at 500M rounds, so the estimate is the figure checked against the target window.
//
// Work is split into fixed-size seeded blocks (seed, profile, job, block), so results are
// identical on any machine and worker count. Progress is checkpointed to <out>/state.json after
// every chunk of blocks; rerunning the same command resumes. The run refuses to resume if the
// engine or sim code changed since it started (mixing versions would corrupt the result), and
// rewrites <out>/summary.md after every chunk.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { BET_MODE_COST_MULTIPLIER, RTP_PROFILES } = require('../project/engine');
const { createStatsCollector } = require('./statsCollector');
const { formatReport } = require('./reportFormat');
const { mergeTotals } = require('./simTasks');
const { createWorkerPool, defaultWorkerCount, runBlocks } = require('./workerPool');
const { BLOCK_SIZE_BY_MODE } = require('./simulate');
const { combineBaseEstimate, BLOCK_SIZE: ESTIMATE_BLOCK_SIZE } = require('./estimateBaseRtp');
const { naturalTriggerProbabilities } = require('./triggerProbabilities');

const REPO = path.join(__dirname, '..');
const DEFAULT_SEED = 20261009;

// Designer's target windows per profile (see docs/architecture.md judgment-call log).
const TARGET_WINDOWS = { 96: [96.0, 96.2], 94: [93.9, 94.1] };

// Job sizes at --scale 1, chosen for roughly +/-0.05pp (95% CI) on every RTP checked against a
// window. `rate` is rounds/sec per worker on the machine the plan was sized on - ETA only.
const PLAN = [
  { id: 'sessions-R',     kind: 'sessions', arg: 'R',             n: 100e6, rate: 1_900 },
  { id: 'sessions-S',     kind: 'sessions', arg: 'S',             n: 30e6,  rate: 1_400 },
  { id: 'phase-base',     kind: 'phase',    arg: 'base',          n: 1e9,   rate: 27_000 },
  { id: 'phase-baseplus', kind: 'phase',    arg: 'baseplus',      n: 1e9,   rate: 26_000 },
  { id: 'super',          kind: 'rounds',   arg: 'super',         n: 200e6, rate: 1_380 },
  { id: 'bonus',          kind: 'rounds',   arg: 'bonus',         n: 200e6, rate: 1_520 },
  { id: 'feature_spins',  kind: 'rounds',   arg: 'feature_spins', n: 200e6, rate: 2_050 },
  { id: 'base',           kind: 'rounds',   arg: 'base',          n: 500e6, rate: 24_700 },
  { id: 'baseplus',       kind: 'rounds',   arg: 'baseplus',      n: 500e6, rate: 13_800 },
];

function blockSizeFor(job) {
  return job.kind === 'rounds' ? BLOCK_SIZE_BY_MODE[job.arg] : ESTIMATE_BLOCK_SIZE[job.kind];
}

function parseArgs(argv) {
  const args = { out: null, workers: defaultWorkerCount(), scale: 1, profiles: Object.keys(RTP_PROFILES).sort().reverse().join(','), seed: DEFAULT_SEED, fresh: false, smoke: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (key === 'fresh' || key === 'smoke') { args[key] = true; continue; }
    if (!(key in args)) throw new Error(`unknown option --${key}`);
    args[key] = ['workers', 'scale', 'seed'].includes(key) ? Number(argv[++i]) : argv[++i];
  }
  if (args.smoke) args.scale = 0.0002;
  args.out = path.resolve(args.out || path.join(REPO, 'sim', 'results', args.smoke ? 'certification-smoke' : 'certification'));
  args.profiles = args.profiles.split(',');
  for (const p of args.profiles) if (!RTP_PROFILES[p]) throw new Error(`Unknown profile "${p}". Valid: ${Object.keys(RTP_PROFILES).join(', ')}`);
  return args;
}

/** sha256 over every engine and sim source/data file, so a resumed run can't mix code versions. */
function codeFingerprint() {
  const hash = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'results' && entry.name !== 'node_modules') walk(full); }
      else if (/\.(js|json)$/.test(entry.name)) hash.update(path.relative(REPO, full).replace(/\\/g, '/')).update(fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n'));
    }
  };
  walk(path.join(REPO, 'project', 'engine'));
  walk(path.join(REPO, 'sim'));
  return hash.digest('hex').slice(0, 16);
}

function gitCommit() {
  try { return execSync('git rev-parse --short HEAD', { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return 'unknown'; }
}

function buildJobs(args) {
  const jobs = [];
  for (const [jobIndex, spec] of PLAN.entries()) {
    for (const profile of args.profiles) {
      const n = Math.max(1, Math.round(spec.n * args.scale));
      const blockSize = Math.min(blockSizeFor(spec), n);
      jobs.push({ ...spec, key: `${profile}/${spec.id}`, profile, jobIndex, n, blockSize, blocks: Math.ceil(n / blockSize) });
    }
  }
  return jobs;
}

function loadState(args, fingerprint, jobs) {
  const file = path.join(args.out, 'state.json');
  const config = { seed: args.seed, scale: args.scale, profiles: args.profiles, fingerprint };
  if (fs.existsSync(file) && !args.fresh) {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    const prev = { seed: state.seed, scale: state.scale, profiles: state.profiles, fingerprint: state.fingerprint };
    if (JSON.stringify(prev) !== JSON.stringify(config)) {
      throw new Error(`${file} belongs to a different run (${JSON.stringify(prev)} vs now ${JSON.stringify(config)}).\n` +
        'If the engine/sim code changed, results can\'t be combined. Rerun with --fresh to start over, or --out <dir> for a separate run.');
    }
    console.log(`Resuming ${file}`);
    return state;
  }
  const state = { ...config, commit: gitCommit(), startedAt: new Date().toISOString(), finishedAt: null, jobs: {} };
  for (const job of jobs) state.jobs[job.key] = { blocksDone: 0, totals: null, elapsedMs: 0 };
  return state;
}

function saveState(args, state) {
  const file = path.join(args.out, 'state.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(state));
  fs.renameSync(file + '.tmp', file);
}

// --- summary ---

const pct = (x, d = 3) => `${(x * 100).toFixed(d)}%`;
const dur = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m` : `${m}m`; };

function directResult(job, entry) {
  if (!entry.totals) return null;
  const collector = createStatsCollector(BET_MODE_COST_MULTIPLIER[job.arg] * 100);
  collector.mergeRawTotals(entry.totals);
  const s = collector.summary();
  return { s, se: s.stdDevWinMultiplier / BET_MODE_COST_MULTIPLIER[job.arg] / Math.sqrt(s.rounds) };
}

const count = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(0)}M` : n.toLocaleString());

function windowStatus(profile, rtp, se) {
  const [lo, hi] = TARGET_WINDOWS[profile] || [-Infinity, Infinity];
  const r = rtp * 100, ci = 1.96 * se * 100;
  if (r >= lo && r <= hi) return r - ci >= lo && r + ci <= hi ? 'in window' : 'in window (CI crosses edge)';
  return r + ci < lo || r - ci > hi ? 'OUTSIDE' : 'outside, within noise';
}

function writeSummary(args, state, jobs) {
  const byKey = Object.fromEntries(jobs.map((j) => [j.key, j]));
  const lines = [];
  const done = jobs.filter((j) => state.jobs[j.key].blocksDone === j.blocks).length;
  lines.push('# Genecist RTP certification run', '');
  lines.push(`- Status: ${state.finishedAt ? `finished ${state.finishedAt}` : `in progress (${done}/${jobs.length} jobs done)`}`);
  lines.push(`- Started: ${state.startedAt} · commit \`${state.commit}\` · code fingerprint \`${state.fingerprint}\``);
  lines.push(`- Seed ${state.seed} · scale ${state.scale} · PRNG xoshiro128** (sim/simPrng.js), one seeded stream per block`);
  lines.push(`- Compute time so far: ${dur(Object.values(state.jobs).reduce((a, e) => a + e.elapsedMs, 0))}`, '');

  lines.push('## RTP by profile and mode', '');
  lines.push('| Profile | Mode | RTP | ±95% CI | Target | Status | Source | Rounds |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const profile of args.profiles) {
    const window = TARGET_WINDOWS[profile] ? `${TARGET_WINDOWS[profile][0].toFixed(2)}-${TARGET_WINDOWS[profile][1].toFixed(2)}%` : '-';
    for (const mode of ['base', 'baseplus', 'feature_spins', 'bonus', 'super']) {
      const direct = byKey[`${profile}/${mode}`];
      const d = direct && directResult(direct, state.jobs[direct.key]);
      const partial = (job) => state.jobs[job.key].blocksDone < job.blocks ? ' (partial)' : '';
      if (mode === 'base' || mode === 'baseplus') {
        const parts = [`${profile}/sessions-R`, `${profile}/sessions-S`, `${profile}/phase-${mode}`].map((k) => byKey[k]);
        if (parts.every((j) => state.jobs[j.key].totals)) {
          const est = combineBaseEstimate({
            sessR: state.jobs[parts[0].key].totals, sessS: state.jobs[parts[1].key].totals, phase: state.jobs[parts[2].key].totals,
            probs: naturalTriggerProbabilities(profile, mode), cost: BET_MODE_COST_MULTIPLIER[mode],
          });
          lines.push(`| ${profile} | ${mode} | ${pct(est.rtp)} | ±${(1.96 * est.se * 100).toFixed(3)}pp | ${window} | ${windowStatus(profile, est.rtp, est.se)} | estimate${parts.map(partial).find(Boolean) || ''} | sessions ${count(state.jobs[parts[0].key].totals.n)} R / ${count(state.jobs[parts[1].key].totals.n)} S, phase ${count(state.jobs[parts[2].key].totals.n)} |`);
        }
        if (d) lines.push(`| ${profile} | ${mode} | ${pct(d.s.rtp)} | ±${(1.96 * d.se * 100).toFixed(3)}pp | ${window} | (direct; wide by nature) | direct${partial(direct)} | ${count(d.s.rounds)} |`);
      } else if (d) {
        lines.push(`| ${profile} | ${mode} | ${pct(d.s.rtp)} | ±${(1.96 * d.se * 100).toFixed(3)}pp | ${window} | ${windowStatus(profile, d.s.rtp, d.se)} | direct${partial(direct)} | ${count(d.s.rounds)} |`);
      }
    }
  }

  lines.push('', '## Full reports (direct simulations)', '', '```');
  for (const job of jobs.filter((j) => j.kind === 'rounds')) {
    const d = directResult(job, state.jobs[job.key]);
    if (d) lines.push(formatReport(job.arg, d.s.rounds, d.s, state.jobs[job.key].elapsedMs, args.workers, job.profile));
  }
  lines.push('```', '');
  fs.writeFileSync(path.join(args.out, 'summary.md'), lines.join('\n'));
}

// --- run ---

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.out, { recursive: true });
  const fingerprint = codeFingerprint();
  const jobs = buildJobs(args);
  const state = loadState(args, fingerprint, jobs);

  const remainingSec = (job) => (job.blocks - state.jobs[job.key].blocksDone) / job.blocks * job.n / (job.rate * args.workers);
  console.log(`Certification run -> ${args.out}`);
  console.log(`${jobs.length} jobs, ${args.workers} workers, seed ${args.seed}, scale ${args.scale}. ` +
    `Rough remaining time: ${dur(jobs.reduce((a, j) => a + remainingSec(j), 0) * 1000)} (from reference per-core speeds; refines as jobs run).`);

  const pool = createWorkerPool(args.workers);
  const chunkBlocks = Math.max(64, args.workers * 8);
  try {
    for (const [i, job] of jobs.entries()) {
      const entry = state.jobs[job.key];
      while (entry.blocksDone < job.blocks) {
        const count = Math.min(chunkBlocks, job.blocks - entry.blocksDone);
        const t0 = Date.now();
        const chunk = await runBlocks(pool, {
          firstBlock: entry.blocksDone,
          count,
          makeTask: (block) => {
            const n = Math.min(job.blockSize, job.n - block * job.blockSize);
            const seed = [args.seed, Object.keys(RTP_PROFILES).indexOf(job.profile), job.jobIndex, block];
            if (job.kind === 'rounds') return { kind: 'rounds', betMode: job.arg, rtpProfile: job.profile, n, seed };
            if (job.kind === 'sessions') return { kind: 'sessions', mode: job.arg, rtpProfile: job.profile, n, seed };
            return { kind: 'phase', betMode: job.arg, rtpProfile: job.profile, n, seed };
          },
          merge: mergeTotals,
        });
        entry.totals = mergeTotals(entry.totals, chunk);
        entry.blocksDone += count;
        entry.elapsedMs += Date.now() - t0;
        // Re-rate this job from what it actually achieved, for a better ETA.
        job.rate = (entry.blocksDone / job.blocks * job.n) / (entry.elapsedMs / 1000) / args.workers;
        saveState(args, state);
        writeSummary(args, state, jobs);

        const progress = `${(entry.blocksDone / job.blocks * 100).toFixed(0)}%`;
        const total = jobs.slice(i).reduce((a, j) => a + remainingSec(j), 0) * 1000;
        console.log(`[${i + 1}/${jobs.length}] ${job.key.padEnd(18)} ${progress.padStart(4)} · ` +
          `job ${dur(remainingSec(job) * 1000)} left · run ${dur(total)} left`);
      }
    }
    state.finishedAt = new Date().toISOString();
    saveState(args, state);
    writeSummary(args, state, jobs);
    console.log(`Done. Summary: ${path.join(args.out, 'summary.md')}`);
  } finally {
    await pool.close();
  }
}

main().catch((err) => { console.error(err.stack || err.message); process.exitCode = 1; });
