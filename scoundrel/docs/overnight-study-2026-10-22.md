# Scoundrel overnight study — October 22, 2026

User request: improve solver speed and accuracy, target approximately 100,000
hidden-deck games, and publish by **08:00 America/New_York** (12:00 UTC).

## Active run

- Target: 100,000 consecutive seeds, `scoundrel-study-v1-0000` onward.
- Budget: **8,192 simulations per decision**, four times the previous report.
- Twelve persistent workers. Native policy revision:
  `a09ccb03f12ea7614c61a1e8d79537c0285f3167a295bc0a97865784413f6b8b`.
- Started 01:05 Eastern. Stop assigning games at **07:35 Eastern** (11:35 UTC),
  finish active games, replay-check, and publish the completed contiguous cohort.
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
- App heartbeat `finish-scoundrel-100-000-game-report` checks every 20 minutes
  through 08:00 Eastern. Stop it after verifying the final report live.

Inspect the process and progress **before resuming**. Never start a duplicate.
If a worker fails, the runner aborts its pool and preserves completed records.
Resume with the command in `launch.json` from its frozen `source` directory;
update `launch.json` with the new PID and keep that process awake. The generator
rejects mismatched revisions/budgets, repairs a torn last JSONL record, and
replays saved histories. If the deadline is past, do not start new experiments.

## Publication

Once progress says `complete`, from the repository root:

```sh
node scoundrel/scripts/publish-study.cjs /Users/mathewseng/.codex/scoundrel-study-20261022/run/results/outcomes.json
node --test scoundrel/tests/*.test.cjs shared/tests/css-literals.test.cjs
sh scripts/assemble-site.sh _site
node scoundrel/tests/browser.cjs
```

The publisher checks the policy revision, every shard checksum, and every replay
before replacing the report. Run `node scoundrel/tests/large-report.cjs` as well (isolated synthetic scale
fixture; never published). Check desktop and vertical iPhone rendering, including the four
reference lines and a history fetched on demand. Preserve unrelated changes,
fetch, reconcile remote updates, commit task files and push `main`, then verify
GitHub Pages and the actual live dataset. The app, tests and manifest support a
smaller completed prefix if the deadline is reached before 100,000.

The initial shipping dataset is the newly verified **1,000-game / 4,096-simulation**
pilot (mean −13.341, median 0, survival 48.1%). Replace it with the main run's
actual scores; never relabel pilot data as the larger cohort or stronger budget.

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
