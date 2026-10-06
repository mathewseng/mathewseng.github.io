# Engine distribution

Source: <https://github.com/ascottix/gnubg-core/tree/955555c69adebb1d7de23abc1018074158621168>. GPL-3.0-or-later. Upstream authors include Gary Wong, GNUbg contributors, and Alessandro Scotti; their file notices are retained. New `bridge.c` is GPL-3.0-or-later.

## Rebuild

Install and activate Emscripten **4.0.15** (emsdk resolves it to `b412b6307e541b93dd93f01b61181e15c17302ec`). Then from the repository root:

```sh
sh backgammon/scripts/build-engine.sh
node backgammon/scripts/offline-manifest.mjs
sh scripts/assemble-site.sh _site
node backgammon/tests/browser.cjs
```

`build-engine.sh` downloads the exact revision, copies `engine/source/bridge.c`, runs `patch-engine.py`, compiles, and creates the corresponding-source archive. The distributed archive also builds directly with `make -f Makefile.emcc`; it includes the patched Makefile, all C source, original web glue, weights, MET and bearoff assets. The single-thread build uses `-O2`, 64 MiB initial WASM memory with growth, and a 1 MiB stack. The source archive is available from the application's About view. Rebuilds can differ in embedded paths/tool output; compare behavior and asset provenance as well as hashes.

## Binding changes

Current binding **bg3** extends the depth bound to four and exports `bg_rollout(original, after, trials, seed)`. Checker batches use `ScoreMoveRollout`; cube batches use `GeneralCubeDecisionR`. The same source archive includes the full modified engine and patched build. The reproducible `patch-engine.py` removes diagnostic rollout spam, implements the RNG setter for valid seeded calls and uses a no-op event hook; the JS worker yields between completed batches. The RNG and simulation policy are initialized explicitly on every batch. No pthreads or deployment headers are required.


- Export `bg_score(originalXgid, afterXgid, plies, beavers)`, `bg_cube(xgid, plies, beavers)` and `bg_value(xgid, plies, beavers)` as allocated JSON. The JS adapter always frees returned buffers. Keep original `hint` exported for independent binding regression comparisons.
- Web binding **bg2** passes the actual beaver flag to GNUbg; Jacoby comes from XGID’s rule bit. The original `hint` binding keeps beavers off for comparison with standard fixtures. All deployed optional rules are also represented in the full application cache key.
- Use `PositionKey` on the after-position, then **ScoreMove** with the original cube/match context. GNUbg performs opponent evaluation, probability inversion, and conversion back to the original player's equity. The adapter does not manually negate an incompatible post-roll evaluation.
- Return eight-decimal cubeful/cubeless values, the five GNUbg probabilities, and `eq2mwc` conversion for matches. Win-gammon/loss-gammon include backgammons.
- `turn` stays the original roller throughout the cube chain. `pending.by` identifies the offerer, so `decisionPlayer` alternates correctly for beavers and raccoons. Response losses compare from that actor’s perspective without reversing the board.
- With immediate redoubles enabled, enumerate every permitted take/pass/beaver/raccoon branch through the same pure game transitions used by Play. `bg_value` calls **GeneralEvaluationE** on the actual accepted-cube position. Multiply by the accepted cube divided by the original decision cube; compare max for the original roller and min for the opponent. Pass values come from the real scoring transition. The current response chain is explicit; future cube ownership/equity uses GNUbg’s beaver-aware approximation. This is not a rollout or exact solution.
- No-cube positions use cubeless evaluation and report `settings.cubeful: false`.

The upstream public hint list caps at 40. Our application enumerates complete legal turns, deduplicates resulting boards, and evaluates all of them at one depth. A browser regression checks a 75-result doubles position and grades an actual move strictly below the worst returned upstream hint. It also compares five opening evaluations against the original C hint API, within 0.00011 (the original API rounds to four decimals). Other regression checks cover public cube fixtures, mirror/player perspective, and different match scores.

## Worker and capabilities

The engine runs in one dedicated module Worker; the WASM itself is single-threaded. Asset transfer, compilation, initialization and computation are timed separately. Fetch failures, initialization failure, worker crash and timeouts reject pending promises. Cancel terminates the worker, frees its WASM address space, and invalidates its generation. A later request creates a fresh worker. Posting a cancel message alone would not interrupt synchronous WASM and is deliberately not used.

Capabilities are explicit in `engine/metadata.mjs`: checker analysis, legal arbitrary-move grading, cube and match contexts, Jacoby, automatic opening stakes, beavers and raccoons, and 0–4 ply. Binding **bg3** adds real GNUbg rollouts for ordinary cube/match rules, independent 32-trial batches, resumable sample moments, and sampling intervals. See `RESEARCH.md` for policy, seeding, uncertainty, candidate screening and limits. Beavers/raccoons remain tree-only. The worker serializes the core’s global rollout context and yields between batches; cancellation terminates it.

## Verification and timing

`tests/browser.cjs` loads the deployed JS/WASM/data from the assembled site without cross-origin-isolation headers. `scripts/benchmark.cjs` separates fresh-worker cold computation from repeated evaluations with warm GNUbg internal caches. Warm and cold timings must not be conflated. `docs/benchmarks.json` contains every sample; cold n=5 and startup n=10 report ranges, not a p95. Warm n=30 has p95. This is local HTTP on an Apple M4 Pro, not mobile hardware or an Internet transfer benchmark.

`tests/options-ui.cjs` checks a legally constructible race (15 Ivory on its 6 point, 15 Teal on its 4 point), deliberately doubled by the trailing roller. Quick/bg2 take equity is −1.80594110 current-cube points (tolerance 0.00002); the optimal first response is Beaver, and the original doubler should pass the beaver. Tests repeat the entire permitted chain with mirrored players, verify accepted-stake pass units and error grading, check Jacoby changes checker evaluation, and exercise money/match no-cube evaluation.
