# Simulation tools

Offline math tools for Genecist. They import the engine directly (no HTTP) and use
`simPrng.js` (xoshiro128**, period 2^128) rather than the engine's `createLocalPrng`, whose
2^32-draw cycle holds only ~17M bonus rounds; see "Why a separate PRNG" below.

| Command | What it does |
|---|---|
| `npm run certify` | Certification run: every bet mode under every RTP profile, resumable, writes a summary. See below. |
| `npm run sim -- --mode bonus --n 5000000 --rtp 94` | Direct simulation of one mode (`--all` for every mode). Full report: RTP, hit rate, win distribution, feature rates. |
| `npm run estimate-base -- --rtp 94` | Variance-reduced base/baseplus RTP (exact trigger probabilities x simulated session values). |
| `npm run paired -- --sample rounds:super --rtp 94 --variants v.json` | Paired comparison of tuning variants (bag changes, 94% swap counts, boost chance). Measures *differences* precisely. |

All of them take `--workers N` (default: every logical core but one) and `--seed N`. A given seed
reproduces the same numbers on any machine and worker count.

## Certification run

One command runs everything for both RTP profiles (96 and 94):

- a direct simulation of each bet mode: base and baseplus 500M rounds; feature_spins, bonus and super 200M
- the base/baseplus estimate: 100M R sessions, 30M S sessions, 1B base phases and 1B baseplus base phases

That gives about ±0.05pp (95% CI) on every RTP checked against its target window (96.00-96.20% /
93.90-94.10%). For base and baseplus the window check uses the estimate, because their direct
RTP stays about ±0.3pp wide even at 500M rounds (rare free-spin sessions drive the variance).
The direct runs still supply their hit rate, win distribution and max-win figures.

### Running it on another PC

1. Install Node.js 20 or newer (`node --version`). The tools have no npm dependencies.
2. Clone the repo and check out `main`:
   ```
   git clone <repo-url> BGAMING
   cd BGAMING
   ```
3. Sanity check (tests take seconds, the smoke run a minute or two):
   ```
   npm test
   npm run certify -- --smoke
   ```
   The smoke run exercises the whole pipeline at 1/5000 scale and writes
   `sim/results/certification-smoke/summary.md`. Its RTPs are meaningless at that size; it's only
   checking that everything runs.
4. Stop the PC from sleeping for the duration (Windows 11: Settings > System > Power & battery >
   Screen, sleep & hibernate timeouts > set sleep to "Never" while plugged in).
5. Start the full run:
   ```
   npm run certify
   ```
   It prints its plan and a rough ETA, then one line per checkpoint. On the 20-thread machine it
   was sized on, it takes about 17 hours; time scales roughly with 1 / (core count x per-core
   speed). Use `--workers N` to leave cores free if you want to use the PC meanwhile.
6. If it stops for any reason (reboot, Ctrl+C, power cut), run the same command again. It resumes
   from its last checkpoint (at most a minute or two lost), and the final numbers are identical
   to an uninterrupted run.
7. When it prints `Done`, the results are in `sim/results/certification/summary.md`: one table
   with every profile x mode (RTP, 95% CI, target window, status), followed by the full report
   for each direct simulation. `state.json` beside it holds the raw totals.

Notes:

- Don't change engine or sim code mid-run. The run fingerprints `project/engine/` and `sim/` and
  refuses to resume if they changed, since results from two code versions can't be combined. Use
  `--fresh` to discard and restart, or `--out <dir>` for a separate run.
- `--profiles 94` runs one profile only. `--scale 0.5` halves every job (and widens the CIs by
  about 1.4x).
- `sim/results/` is git-ignored. To share a finished run, copy `summary.md` somewhere tracked
  (for example `docs/certification/`).

### Reading the status column

| Status | Meaning |
|---|---|
| in window | The point estimate and its whole 95% CI are inside the target window. |
| in window (CI crosses edge) | The point estimate is inside, but the CI reaches past an edge. |
| outside, within noise | The point estimate is outside, but the CI still overlaps the window. |
| OUTSIDE | The whole CI is outside the window: the mode needs retuning. |

A mode that comes back outside can be re-centred cheaply. `npm run paired` measures the effect of
a candidate change (each tuned bag/swap count has a known slope; see the judgment-call log in
`docs/architecture.md`), then only that profile/mode needs re-certifying (`--profiles`, plus a
fresh `--out`).

## Why a separate PRNG

`project/engine/rng/localPrng.js` (mulberry32) has a 32-bit state, so its whole cycle is about
4.3 billion draws. Per round the engine uses about 15 draws in base, 130 in feature_spins and
about 250 in bonus/super. So the entire cycle holds only ~17M bonus rounds, ~18M super and ~33M
feature_spins. A longer run on it just replays that cycle, converging on one fixed sample rather
than on the true RTP, and different seeds are only different starting points on the same cycle.
`createLocalPrng` stays as it is because `generateReels.js` builds the reel strips from its
exact sequence (changing it would change every strip). Neither generator is used live:
production draws come from BGaming's RNG service.

## Files

| File | Role |
|---|---|
| `certify.js` | Certification runner (plan, checkpoints, summary). |
| `simulate.js` | Direct simulation CLI; `runSimulation()` is reused. |
| `estimateBaseRtp.js` | Base/baseplus decomposition CLI; `combineBaseEstimate()` is reused. |
| `paired.js` | Paired-variant comparison CLI. |
| `roundSimulator.js` | Plays a full round, a natural free-spin session, or a base phase. |
| `triggerProbabilities.js` | Exact natural trigger probabilities from the base strip. |
| `simTasks.js`, `simWorker.js`, `workerPool.js` | Seeded task blocks run on a pool of worker threads. |
| `simPrng.js` | xoshiro128** PRNG for simulation. |
| `statsCollector.js`, `reportFormat.js` | Per-round statistics and the text report. |
