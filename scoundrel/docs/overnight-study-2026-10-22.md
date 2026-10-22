# Scoundrel overnight study — October 22, 2026

User request: improve solver speed and accuracy, target approximately 100,000
hidden-deck games, and publish by **08:00 America/New_York** (12:00 UTC).

## Completed run

- Completed all **100,000** consecutive seeds, `scoundrel-study-v1-0000` through
  `scoundrel-study-v1-99999`, with no restarts or excluded outcomes.
- Budget: **8,192 simulations per decision**, four times the previous report.
- Twelve persistent workers. Native policy revision:
  `a09ccb03f12ea7614c61a1e8d79537c0285f3167a295bc0a97865784413f6b8b`.
- Started 01:05 Eastern; finished generation and replay verification at
  **06:02:59 Eastern** (10:02:58.791 UTC), before the 07:35 assignment cutoff.
  Total elapsed time was 17,871.687 seconds (4 hours, 57 minutes, 51.687 seconds).
- Runner accepts only public observations; the deck and game seed remain in the
  game environment. Both avoidance directions remain in the search.
- No outcomes are discarded and the policy/budget stays fixed throughout.
- Files: `/Users/mathewseng/.codex/scoundrel-study-20261022/run/`.
  `launch.json` contains the exact command, PID and working directory;
  `progress.json` has counts, rate, ETA and status; `run.log` has output;
  `checkpoint.jsonl` holds every completed game; `source/` is a frozen copy;
  `results/outcomes.json` and its `histories/` hold the completed report.
- `caffeinate -i -w <runner PID>` prevents idle system sleep while computing.
  It ends automatically with the runner. Do not stop unrelated jobs.
- App heartbeat `finish-scoundrel-100-000-game-report` monitored every 20 minutes
  through completion. Stop it after verifying the final report live.

| Statistic | Completed cohort |
| --- | ---: |
| Deals / verified histories | 100,000 |
| Total score | −1,512,779 |
| Mean score | −15.12779 |
| Median score | −1 |
| First quartile | −14 |
| Third quartile | 6 |
| Survived | 48,070 (48.07%) |
| Defeated | 51,930 (51.93%) |
| Lowest / highest score | −188 / 30 |

These are measured outcomes of the fixed hidden-deck policy, not exact
population expectations or proven optimal-play values. Quartiles use R-7
interpolation. The checkpoint independently matches every published score and
contains each index from 0 through 99,999 exactly once.

## Publication

The completed manifest and 100 immutable history shards replace the initial
1,000-game / 4,096-simulation pilot. The manifest is 312,469 bytes; histories
total about 8 MiB and load on demand. Manifest SHA-256:
`6da2ee8c23d114298514620fba6b2bb80cc97ddd29ed56b0d9d974a0607d6383`.

Verification and publication commands, from the repository root:

```sh
node scoundrel/scripts/publish-study.cjs /Users/mathewseng/.codex/scoundrel-study-20261022/run/results/outcomes.json
node --test scoundrel/tests/*.test.cjs shared/tests/css-literals.test.cjs
sh scripts/assemble-site.sh _site
node scoundrel/tests/browser.cjs
```

The publisher checked the policy revision, every shard checksum, and all
100,000 replays before replacing the report. All 28 scoped unit tests passed,
including another complete replay pass and native/browser hidden-information
checks. The assembled game/report browser tests passed, as did the focused
shell sweep at desktop, portrait phone, and landscape phone sizes.

`node scoundrel/tests/large-report.cjs` passed in Chromium and WebKit at widths
1440, 390, and 320. It checks all histogram counts, four reference lines, text
clipping, lazy history fetching, and a 100,001-line CSV export. Its isolated
scale fixture is never published; this completed cohort supplies 100,000 real
scores. Desktop and vertical iPhone screenshots were inspected. Publication
must preserve unrelated edits, fetch and reconcile remote updates, push `main`,
and verify GitHub Pages and the actual live dataset before stopping monitoring.

## Optimization and checks

The solver keeps the same hidden-information policy, with these native speedups:

- Fixed action/path buffers; canonical state bytes with exact equality checks.
- Small-array sorting and precomputed boundary utility arithmetic.
- Cached visible-room transitions, stopping before sampling a new room. A
  safeguard preserves the exact four-card rollout tail.
- Collision-free combinadic indexing for visible-room plans in a shared sparse
  memory-mapped cache. Workers reuse identical plans; writes use atomic words.
  The file occupies about 4 GiB when filled and is tied to the compiled revision.
  A bounded private cache is the fallback. No private deck information is cached.

On the same 160 deals at 2,048 simulations, the first optimization reproduced
all moves and scores (80.793 s baseline, 37.233 s optimized). These timings are
local and affected by concurrent machine load. The shared-cache version then
reproduced all moves in a full 1,000-game / 4,096-simulation comparison, completing
in 191.2 s while a separate 8,192-simulation pilot was also running.

The 4,096-simulation pilot mean was −13.341 versus −15.662 at 2,048 on the same
1,000 seeds. This observed increase is not an optimality claim. A larger search
budget reduces finite-sampling noise but does not eliminate rollout bias or
prove the policy optimal. The 8,192 pilot completed with mean −14.327 and survival 49.7%. Its paired
mean difference versus 4,096 was −0.986 points (paired standard error 0.966),
so these 1,000 games do not establish which budget has the higher population
score. The main run uses 8,192 for greater per-decision sampling, within the
deadline, rather than claiming a proven policy-strength improvement. Both pilots
are retained outside the repo; do not tune to favorable individual deals.

Native/browser fixed-budget parity, hidden-order invariance, independent exact
small-endgame fixtures, private/shared-cache equivalence, and all 1,000 pilot
replays pass. Compact histories preserve card identities and combat/avoid modes.
The report's initial JSON contains scores and checksum-indexed history links;
only the selected history shard is fetched by the UI. This avoids a ~200 MB
initial download for 100,000 full JSON action histories.
