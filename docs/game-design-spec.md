# Genecist — Game Design Spec

Authoritative rules for the JS port. Source of truth: `./info/wildly-monsters (python)/gamestate.py` and `game_config.py`, corrected per direct confirmation with the game's designer where the literal Python source contained temporary/test-only code (see "Corrections vs. literal Python source" below). The example records in `./info/books/*.jsonl.zst` are a secondary reference for event vocabulary/shape only — they predate the corrected mechanics and must not be used to infer trigger probabilities.

## Grid & paylines

- 6 reels × 5 rows (30 cells).
- 35 fixed paylines. Each payline is an array of 6 row-indices (0-4), one per reel. Ported verbatim from `game_config.py:86-122`:

```
1:  [0,0,0,0,0,0]   8:  [1,2,1,2,1,2]   15: [1,2,3,3,2,1]   22: [1,2,2,2,2,1]   29: [1,1,0,0,1,1]
2:  [1,1,1,1,1,1]   9:  [2,1,2,1,2,1]   16: [2,1,0,0,1,2]   23: [2,1,1,1,1,2]   30: [1,1,2,2,1,1]
3:  [2,2,2,2,2,2]   10: [2,3,2,3,2,3]   17: [2,3,4,4,3,2]   24: [2,3,3,3,3,2]   31: [2,2,1,1,2,2]
4:  [3,3,3,3,3,3]   11: [3,2,3,2,3,2]   18: [3,2,1,1,2,3]   25: [3,2,2,2,2,3]   32: [2,2,3,3,2,2]
5:  [4,4,4,4,4,4]   12: [3,4,3,4,3,4]   19: [4,3,2,2,3,4]   26: [3,4,4,4,4,3]   33: [3,3,2,2,3,3]
6:  [0,1,0,1,0,1]   13: [4,3,4,3,4,3]   20: [0,1,1,1,1,0]   27: [4,3,3,3,3,4]   34: [3,3,4,4,3,3]
7:  [1,0,1,0,1,0]   14: [0,1,2,2,1,0]   21: [1,0,0,0,0,1]   28: [0,0,1,1,0,0]   35: [4,4,3,3,4,4]
```

## Symbols (13)

| Symbol | Role |
|---|---|
| H1-H5 | High-paying symbols (H5 highest) |
| L1-L5 | Low-paying symbols |
| W | Wild — substitutes in line evaluation; carries a `multiplier` attribute (always 1 in base game, weighted-random in free-spin modes) |
| S | Scatter — count-based tiers: exactly 3 on a board triggers classic Free Spins (R mode), 4 or more triggers Super Free Spins (S mode) directly. **Corrected from an earlier two-symbol design (S + S2)** to this single-symbol, count-tiered one — see docs/architecture.md's judgment-call log, "S2 merged into S". |
| SW | Switch symbol — triggers a Switch Spins sequence; never pays, never substitutes |

## Paytable

Multiplier-of-bet, verified verbatim from `game_config.py:32-84`:

| Kind | H5 | H4 | H3 | H2 | H1 | L5 | L4 | L3 | L2 | L1 | W |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 5 | 2 | 1.5 | 1 | 1 | 0.3 | 0.2 | 0.2 | 0.1 | 0.1 | — |
| 4 | 10 | 5 | 4 | 2.5 | 2.5 | 1 | 0.6 | 0.6 | 0.3 | 0.3 | — |
| 5 | 20 | 12.5 | 10 | 7.5 | 7.5 | 3 | 2 | 2 | 1 | 1 | — |
| 6 | 40 | 25 | 20 | 15 | 15 | 7.5 | 5 | 5 | 2.5 | 2.5 | 50 |

S, SW never appear in the paytable — they never contribute a line win directly.

## Line evaluation algorithm

**Corrected** — an earlier version of this doc (and the matching first implementation) described this as "try every paying symbol independently, take the single best-paying candidate." That is wrong and was caught by the offline simulator producing an impossible ~330x average win for base mode; replaying all 100,000 real recorded `books_base` records through the line evaluator confirmed the actual rule below gets a 100% exact match against real `payoutMultiplier` values, while the old "best candidate" rule does not. See `docs/architecture.md`'s judgment-call log.

For each of the 35 paylines, scanning from reel 0:
1. Find the **anchor**: the first cell whose symbol is not W. If every cell on the line is W, there is no anchor — the line is a pure-wild line instead (skip to step 3 with `anchorSymbol = W`).
2. The anchor symbol is fixed by that first non-wild cell — it is never re-decided by comparing against what some other symbol would have paid. A wild prefix before the anchor substitutes for it; it is not independently evaluated as a candidate for any other symbol.
3. Run length = how many cells, starting from reel 0, are the anchor symbol or W, stopping at the first cell that's neither. If `paytable[length][anchorSymbol]` exists (length ≥3 for real symbols, or exactly 6 for W — there is no 3/4/5-kind W entry), that's the payline's win; otherwise the line doesn't pay.

This yields the same shape as the real `winInfo` events: one win entry per winning line, each with `symbol`, `kind`, `win`, `positions[]`, `meta`.

## Wild multiplier

- Base game: every W has `multiplier: 1` — no effect.
- Both free-spin modes (R and S): every W drawn independently rolls a multiplier from this weighted bag (verified `game_config.py:256`, applied via `game_override.py:19-26`):

  | Multiplier | 2 | 3 | 4 | 5 | 10 | 20 | 50 |
  |---|---|---|---|---|---|---|---|
  | Weight | 100 | 50 | 50 | 50 | 30 | 20 | 5 |

  (total weight 305 → 2x≈32.8%, 3/4/5x≈16.4% each, 10x≈9.8%, 20x≈6.6%, 50x≈1.6%)

- **Line multiplier** (best-available reading of `readme.txt`, a generic template doc — validate once the engine is testable, not 100% certain): for a winning line, sum the `multiplier` values of every W that participates in that line's winning run, **counting only wilds whose multiplier is >1** (a multiplier of exactly 1 contributes nothing to the sum). If no qualifying wild is on the line, `lineMultiplier` defaults to 1.
- Final line win = `winWithoutMult * lineMultiplier * globalMultiplier`. `globalMultiplier` is always 1 in this game (a generic engine field with no active mechanic here) — carried through for event-shape fidelity only.

## Switch Spins feature

**This section reflects corrections confirmed with the designer — see "Corrections vs. literal Python source" below before reading the raw Python.**

- Every spin — base game, R-mode free spins, and S-mode free spins alike — has a flat, uniform, context-independent chance of an SW symbol landing at one random (reel, row), overwriting whatever the natural reel draw produced there. No spin is special-cased (not even a round's or a feature's first spin) and nothing is ever force-guaranteed.
  - **Corrected after initial balancing** (see `docs/architecture.md`'s judgment-call log, "switch-spins balancing"): a single shared chance for every spin, including spins *during* an already-active sequence, let rare sequences chain long enough to exhaust the 9-symbol cap and produce wins that dominated the simulated average (a handful of wincap hits out of thousands of rounds accounted for the overwhelming majority of total win). The chance is now split into two rates per mode:
    - **INITIAL** (no sequence currently active) — base: 1/200, R-mode: 1/120, S-mode: 1/150.
    - **RESTACK** (a sequence is already active — i.e. stacking a fresh drop on top of a running one) — base: 1/4000, R-mode: 1/2500, S-mode: 1/3000.
  - Stacking itself is **not removed** — the designer confirmed the mechanic should stay as literally structured; RESTACK is simply rare enough that the compounding tail stops dominating the average while remaining possible in principle.
- **On a drop**, in this order:
  1. If no switch sequence is currently active (`switch_spins == 0`), roll `switch_wild` 50/50 (`true`=substitute with Wild, `false`=substitute with H5). This persists for the entire sequence — it is only re-rolled once `switch_spins` returns to 0 and a fresh SW drop starts a new sequence.
  2. Roll a spins-to-award count from a weighted bag and **add** it to the running `switch_spins` counter (stacking):
     - Base & R-mode (31 entries, verbatim from `gamestate.py`): `[1,1,1,1,1,2,2,2,2,2,2,3,3,3,3,3,4,4,4,4,5,5,5,6,6,7,7,8,8,9,10]`
     - S-mode (29 entries, slightly lower-skewed): `[1,1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,3,3,3,3,3,4,4,5,6,7,8,9,10]`
  3. Roll a count of *new* switch-target symbols from a weighted bag (25 entries, heavily skewed to 1): `[1×19, 2×3, 3×2, 4×1]` (76%/12%/8%/4%).
  4. Sample that many symbols, without replacement, from the pool `{L1,L2,L3,L4,L5,H1,H2,H3,H4}` **minus** whatever's already in the running `switch_symbols` list. (H5 is never eligible — it's the substitution *target*, not a source. W/S/SW are never eligible either.) **Append** them to the cumulative `switch_symbols` list.
  5. In base game and S-mode: once `switch_symbols` reaches 9 unique entries (the entire eligible pool), block further SW drops until the sequence fully ends. **R-mode has no such cap** — it keeps allowing SW drops indefinitely even with all 9 symbols already accumulated; it simply adds zero new symbols once the pool is exhausted (verified directly in `gamestate.py`: base derives the block implicitly from clamping `num_to_add` to the exhausted pool size and setting `prevent_switch`; S-mode checks `len(switch_symbols) >= 9` explicitly; `run_freespin` has no equivalent check at all). See `docs/architecture.md`'s judgment-call log.
- **Every spin where `switch_symbols` is non-empty** (including the very spin that just triggered, where the list is still empty *before* step 4 runs that spin — so the triggering spin itself never gets replaced, only subsequent spins do): after the board is revealed, replace **every** cell whose symbol name is in `switch_symbols` with `W` (if `switch_wild`) or `H5` (otherwise) — all matching occurrences, not a sample. This happens after `reveal` but before line evaluation (wins are computed on the post-switch board).
- At the top of each spin once a sequence is active (before that spin's board is drawn), decrement `switch_spins` by 1. The sequence continues as long as `switch_spins > 0` after that spin's bookkeeping — further SW drops mid-sequence extend it indefinitely (no cap on total spins beyond the wincap).
- **Known asymmetry, ported as-is (not unified)**: R-mode resets `switch_symbols = []` once a sequence fully ends (`gamestate.py` `run_freespin` line 227); base game and S-mode do **not** reset it between sequences within the same round/feature — a second sequence later in the same feature keeps accumulating onto the old list (subject to the 9-cap in S-mode). This is very likely an oversight in the original Python, but it's faithfully ported rather than silently "fixed." See `docs/architecture.md`'s judgment-call log.

## Classic Free Spins feature (independent of Switch Spins)

**Corrected from an earlier two-symbol design** (separate "S"/"S2" pools, S2 always taking priority) **to a single scatter symbol "S", tiered purely by how many land on one board** — see docs/architecture.md's judgment-call log, "S2 merged into S".

- Triggers purely from natural reel-strip landings — never forced, never coupled to Switch Spins.
- Exactly 3 "S" anywhere on a board → 10 Free Spins, mode **R**, reel `FR0`.
- 4 or more "S" anywhere on that *same* triggering board → instead go straight to Super Free Spins, mode **S**, reel `FR1`, 10 spins (upgrades past R entirely).
- The award is always exactly 10 (or +4 on retrigger) no matter how far past whichever threshold was crossed — only which of the two thresholds (3, or 4+) is crossed matters (verified: `game_executables.py` hardcodes `tot_fs = 10`/`+= 4` unconditionally once a threshold is met).
- **During R-mode**: Switch Spins runs in parallel (see the INITIAL/RESTACK rates above). Additionally: exactly 3 "S" on a free-spin board → retrigger +4 spins (added to remaining budget). 4 or more "S" → upgrade immediately to S-mode (fresh 10-spin budget, reel switches to `FR1`, switch-sequence state is reset per the asymmetry above).
- **During S-mode**: Switch Spins runs in parallel (S-mode rates). 3 or more "S" → retrigger +4. No further upgrade tier exists — S-mode is already the top tier.
- Loop continuation rule (both modes): keep spinning while `(remaining free spins > 0) OR (switch_spins > 0)` — an in-progress Switch Spins sequence keeps the free-spin feature alive past its nominal spin budget until the sequence itself ends.

## Win cap

- `wincap = 10,000×` bet (`game_config.py:23`).
- After **every** spin's win evaluation, in any phase (base, switch sequence, R-mode, S-mode): if cumulative round win (base + free-game wins) ≥ the cap, clip the round's total win to exactly the cap, immediately terminate the switch sequence AND the free-spin feature (whichever is active), and emit a `wincap` event. One shared check, not duplicated per phase.

## Bet modes (4)

| Mode | Cost (× bet) | Entry point | Reel set(s) |
|---|---|---|---|
| `base` | 1× | Normal play; base loop can naturally lead into Free Spins via scatter | `BR0` → `FR0`/`FR1` |
| `baseplus` | 1.25× (placeholder, tunable) | Normal play with boosted Free-Spin odds (ante-bet mode; **not present in the Python source at all** — confirmed by the designer as an intentional gap to design fresh) | `BR0` (+boost) → `FR0`/`FR1` |
| `bonus` | 100× | Buy-feature: shows a synthetic triggering board (exactly 3 "S"), then skips into R-mode Free Spins, 10 spins | `FR0` |
| `super` | 300× | Buy-feature: shows a synthetic triggering board (4 "S"), then skips into S-mode Super Free Spins, 10 spins | `FR1` |

A bought feature's first step shows a board with the qualifying scatter count, added so a purchase visually "earns" the feature the same way a natural trigger does, rather than cutting straight to the first free spin. Its filler is otherwise natural and its incidental line wins are honoured exactly like a natural trigger spin's — only the scatter placement is forced — see `docs/architecture.md`'s judgment-call log, "Buy-feature triggering board".

`baseplus` proposal (no precedent exists anywhere — see `docs/architecture.md` for the full rationale): cost 1.25× bet; once per round, a 1-in-14 independent chance to force-add one extra "S" onto the naturally-drawn board, on top of whatever landed naturally, before the Free-Spin trigger check. Both numbers are placeholders meant to be re-tuned further as simulation volume increases.

## Reels

**Built fresh for this port, not ported from the Python prototype.** The designer confirmed `gamestate.py`'s own reel strips were never balanced — that happens in a separate step, after simulation, which hadn't been done for this game yet — so they don't represent a meaningful target RTP and were not carried over. Engine reel strips are generated by `engine/data/generateReels.js` from per-symbol weight tables in `engine/data/reelWeights.js`, each strip 1,000 rows × 6 columns, written to `engine/data/reels/*.csv` then converted to the committed `*.json` the engine actually loads. Regenerate via `npm run gen-reels` after editing a weight table.

| Strip | Used by |
|---|---|
| `BR0` | Base game draws (`base`/`baseplus` modes; `bonus`/`super` never reach it - see below) |
| `FR0` | R-mode (regular) Free Spins draws - both naturally-triggered and `bonus`-mode buy-in |
| `FR1` | S-mode (Super) Free Spins draws - both naturally-triggered/upgraded and `super`-mode buy-in |

The original prototype's `BR1` (a nominal "super mode base reel") and `FRWCAP` are both gone entirely - `BR1` was never actually reachable in this engine (`bonus`/`super` seed `phase:"freespins"` directly, skipping the base phase entirely) and no call site for `FRWCAP` exists. SW never appears on any natural reel strip - it's always injected programmatically at a random position when a switch-spins drop occurs (see "Switch Spins feature" above).

Board draw: per reel, pick one random row-index into that reel's strip, read the 5-row visible window starting there with wraparound at the strip's end (standard reel-strip drawing).

Weight tables are tuned empirically against `sim/simulate.js`, balancing two interacting constraints: `FR0`/`FR1` need to be fairly priced for their own buy-mode cost (100×/300×) since `bonus`/`super` rely on them exclusively, while `BR0`'s scatter weight controls how often that same feature is handed out *for free* from base mode - giving away a fairly-priced feature even at a low natural trigger rate adds a large amount on top of base mode's own baseline, because the trigger-probability-to-reward relationship is highly non-linear (roughly cubic, since it's a "3-or-more-out-of-30-cells" condition) while the reward itself is fixed by the buy-mode tuning. First-pass simulated RTP (100k-150k rounds/mode): base ~101%, baseplus ~92%, bonus ~96%, super ~88% - all close to the 96% target and a long way from where this started; see `docs/architecture.md`'s judgment-call log for the full tuning narrative and the explicit "re-run at much higher volume before sign-off" caveat.

## Internal unit convention

Every win amount inside the engine is an integer **centi-multiplier** = `round(multiplierOfBet × 100)`. This was cross-verified independently from two real book records: `payoutMultiplier: 1160` matched `baseGameWins: 11.6` (×100), and a `wincap` event amount of `1,000,000` matches `10,000× × 100`. The paytable is stored pre-multiplied by 100 so no runtime float multiplication ever happens (e.g. `0.3×bet` becomes integer `30` centi-multiplier). Currency-cents conversion happens exactly once, at the HTTP response boundary: `win_cents = round(centiMultiplier * bet_cents / 100)`.

## Corrections vs. literal Python source

The literal `gamestate.py` `run_spin()` contains two behaviors that were confirmed by the designer to be **temporary test-only code** (used to generate demonstrable examples for `books_switch_spins.jsonl`), not the real design — neither is ported:

1. It force-places a guaranteed SW symbol on a round's very first spin (`switch_symbols == []` branch), instead of using the same flat per-spin chance every other spin uses (see "Switch Spins feature" above for the current INITIAL/RESTACK rate values).
2. It force-places exactly 3 "S"/"S2" symbols onto the board the instant a switch sequence ends, which would otherwise guarantee a Free Spins trigger at the end of literally every base round.

The corrected model (flat probabilistic SW drop everywhere, Free Spins triggered only by natural scatter landings, fully independent of Switch Spins) is what's documented above and is what the JS engine implements.
