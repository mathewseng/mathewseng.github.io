# Research analysis and reports

The live report is `/backgammon/reports/`, linked from the hub and Solver. Its data files are shipped and cached with the application. Loading the page does not initialize the engine. The explicit on-device measurement runs one sample and labels that limitation.

## Analysis modes

Solver defaults to Auto: complete 0-ply Quick, show it, then complete 2-ply Deep. Position changes, editing, navigation and cancellation invalidate outstanding requests. A completed Quick answer remains usable if deeper work is cancelled. Rank changes are shown only between completed results for the same decision.

Play stores `reviewStrength` separately from `strength`. Hints and human-decision feedback default to Deep even against a Quick bot. Computer moves continue using the configured bot strength. Both fields survive Solver/Play context and session recovery.

Expert/Research evaluate every legal result at 2 ply. Expert retains the first two, plus up to eight moves within 0.080 normalized equity of the leader. Research retains the first two, plus up to four within 0.040. The submitted move is always added even outside the screen. All retained moves are rescored at 3/4 ply respectively; lower-depth excluded moves never enter that ranking. Source, depth, shortlist, excluded scores and engine revision are retained. Screening is not proof that discarded moves cannot be best. Cube analysis uses the selected depth directly.

## Native GNUbg rollouts (bg3)

`bg_rollout` wraps GNUbg's `ScoreMoveRollout` and `GeneralCubeDecisionR`. It uses the pinned engine's real game simulation, both sides' 0-ply checker/cube policy, variance reduction, deterministic seeded ISAAC, no fixed-ply truncation, and cubeless bearoff database termination. The configured ordinary cube and match context is preserved. Beavers/raccoons are explicitly unavailable for rollout; their existing tree analysis remains available. These estimates are not exact solutions.

The JS worker orchestrates independent 32-trial batches. Quasi-random rotation and early stopping are disabled. Trials within native batch `b` use ISAAC seeds `seed + b*65536 + (trial<<8)` modulo 2^32: no overlapping trial seeds within the supported 4096 trials. All candidates share each batch seed to reduce comparison noise. The shortlist comes from Deep: at least two moves, up to four within 0.040, plus the submitted move. Cube alternatives use GNUbg's common-dice no-double/double-take simulation with the exact drop payoff.

Each native batch returns means and standard errors of the mean. Pooling reconstructs `M2 = SE²*n*(n-1)` and adds the between-batch term before computing the combined SE. Approximate 95% intervals use 1.96*SE. They measure sampling error only, exclude policy/model bias, and should be interpreted cautiously at small sample counts. Alternatives are correlated; the close-decision check conservatively uses `1.96*(SE1+SE2)`, not an independence assumption. No confidence is claimed about screened-out moves. More samples need not reverse a policy error.

Completed batches are stored in IndexedDB work/solver-rollout. The checkpoint binds engine, full position/rules context, seed, policy, submitted move, candidates, sample moments and elapsed computation. Cancel terminates the worker; pending partial batches are discarded. Resume safely recreates the worker and continues with the next disjoint seed range. Only one bounded current Solver checkpoint is retained. Seeded simulations do not use, change or reveal live-game dice. A suspended mobile browser may stop work; completed checkpoints survive.

## Accuracy and timing reproduction

- `node backgammon/scripts/collect-reference.mjs DIR` reads the three decompressed GNUbg 1.00 benchmark files (`contact.bm`, `race.bm`, `crashed.bm`). The published reference JSON records source URLs, full decompressed-file SHA-256 values, original header, line numbers and raw selected records. It selects 100 evenly spaced move records per class; every listed after-position is checked against complete legal turns.
- Serve the assembled site and run `BG_BASE_URL=http://127.0.0.1:8878 node backgammon/scripts/accuracy.cjs` to score those 300 decisions at Quick/Standard/Deep. This is a historical cubeless money reference with limited candidate coverage. Uncovered winners are reported separately and excluded from loss averages. It is not a held-out guarantee against the engine's neural training data, a modern rollout gold standard, an Elo measurement, or an independent-engine comparison.
- Build GNUbg 1.08.003 separately with `--disable-threads` (nested desktop rollout tasks otherwise block in this reference harness) and run `GNUBG_BIN=... GNUBG_DATA=... node backgammon/scripts/validate-native.mjs`. Use the same weights/bearoff/MET assets to isolate binding and context conversion. On this host the available GLib/readline libraries were x86_64, so the CLI was built x86_64 and run under Rosetta. Native timings are not used to compare speed. Set `CPPFLAGS`/`LDFLAGS` to your readline installation; no system install is required. Distributed GNUbg tarballs include generated parser sources, avoiding a new Bison dependency.
- `BG_BASE_URL=... node backgammon/scripts/research-benchmark.cjs` records three fresh-worker calculations per setting/position (0/1/2/3/4 ply, 64/256-trial rollouts), plus immediate app-cache hits and startup timing. Local HTTP and potential browser HTTP/WASM compilation caches are explicitly labeled. Three samples support an observed range and median, not p95. Run without concurrent heavy work. No physical-phone or WAN performance claim is made.
- `BG_BASE_URL=... node backgammon/tests/research.cjs` exercises real worker rollouts, seed reproducibility, pause/resume, actual cancellation, perspective, match units, arbitrary-move screening, Auto UI, persisted checkpoints, independent review strength and responsive reports.

All results identify the engine/version and observation date. Raw JSON is linked from the report. The historical reference corpus is used for testing; it is not silently presented as original lessons. GNUbg source/license attribution remains in About and the report.

`node backgammon/scripts/auto-benchmark.cjs` adds separately measured Quick → Deep first/final response timing to the speed report. These pipeline measurements include initialization and exclude rendering; they are not an assertion about touch-to-paint latency.

Numeric reproducibility is tested within 0.000001 equity/standard error. Saved batch moments and simulation seeds are reused verbatim, but GNUbg's floating-point evaluation cache can change the final few digits of newly computed batches after a worker restart. The resume test checks candidate identity, sample counts, scores and standard errors within this tolerance; it does not require byte-identical floating-point outputs.

Desktop reference commands disable the 2-ply root move filters: otherwise GNUbg can stop with a clear 0-ply winner even when 2-ply was requested. The harness checks the depth printed by the desktop program before comparing numbers. Match-equity XML from the desktop release is supplied explicitly because the web core embeds its Kazaross-XG2 table.
