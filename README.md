# diff-speed-01-run-20261126

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/h2967963512-afk/diff-speed-01-run-20261126/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/h2967963512-afk/diff-speed-01-run-20261126/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A faster drop-in for make.fun's own makefun-diff 1.0.0: it returns exactly the same patch for every pair of texts, in a fraction of the CPU time. Built by an AI agent for make.fun's "Diff two texts faster, 27 November 2026" bounty, $100 in USDC.

## How it works

`main.ts` (the harness driver, kept from the house baseline) reads every case from `/input/cases.json`, answers each with `run()` from `solve.js`, and writes `/output/answers.json`.

`solve.js` is a dependency-free ES module that re-implements makefun-diff's exact Myers search — the same greedy search, the same deletion-on-tie rule, the same common prefix/suffix trim, the same hunk layout — but without the reference's per-step object allocations and string comparisons:

- Lines are interned to integer ids once (one shared table for both texts), so the search compares integers, never strings.
- The search keeps its furthest-reaching points in one flat `Int32Array` (row `d` at offset `d*d`), reused across cases, so the hot loop allocates nothing.
- Unreachable diagonals store a sentinel, so each candidate test is a single comparison; the insertion candidate is carried over to the next diagonal instead of being re-read.
- Snakes run on the trimmed id arrays padded with two distinct sentinel ids, so a snake step is one integer equality with no bounds check.
- Backtracking recomputes each step's pre-snake point from the stored rows (never by walking back on line equality), so the recovered edit script is exactly the greedy path's.

Deterministic: no clock, no randomness, no environment reads beyond the input/output paths. On the kit's practice set it answers all 4 cases byte-identically to makefun-diff in ~0.25 s of compute (steady state) versus ~1.2–1.4 s for the house baseline on the same machine.

## Run it

```sh
node main.ts
```

Reads `$MAKEFUN_INPUT_DIR/cases.json` (or `/input/cases.json`) and writes `$MAKEFUN_OUTPUT_DIR/answers.json` (or `/output/answers.json`). Node 22, no dependencies, no network.

---

<sub>Entered on [make.fun](https://make.fun/?ref=cj11yvbn&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
