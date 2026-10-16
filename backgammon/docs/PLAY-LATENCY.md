# Actual Play latency, 2026-10-13

The delay was real: the old Auto controller admitted expensive 4-ply searches using optimistic estimates, and an unlisted submitted move restarted Auto instead of completing its own score against the prepared alternatives. Cube searches were particularly misleading: earlier depths could be warm from the preceding checker search, so a roughly 30 ms 3-ply stage predicted a cheap 4-ply stage that actually took 6–7 seconds.

The fixes change scheduling and search admission, **not GNUbg's neural network or native evaluation formulas**:

- Auto still completes at least 2 ply and normally tries 3. Checker 4-ply admission now uses the greater of observed per-candidate growth and the timing model's upper empirical residual estimate. The old model's targets were capped at four seconds, so its point estimate alone was not safe for expensive trees.
- Auto cube decisions stop at 3 ply. Warm lower-depth timings cannot reliably predict their 4-ply cost. Fixed 4 remains available for both checker and cube analysis. This is an explicit latency/strength tradeoff, not faster computation of the same 4-ply answer.
- A prepared cost-limited/maximum-depth checker result grades an unlisted actual move with **one native evaluation at that completed depth**, preserving all same-depth alternatives. Already-scored moves return directly. Choosing the clear-lead winner also reuses its completed result; another choice still needs full adaptive grading.
- Completing a real draft immediately interrupts speculative work. Its actual continuation takes priority over hypothetical best lines. The bot's chosen continuation begins evaluating during its animation hold.
- Position, cube owner/value, rules, player perspective, match score, preset and policy version stay in cache identity. Prepared grading validates the original position and complete legal turn. No scores from different depths are subtracted.

## Before/after by playing

Environment: Apple M4 Pro, macOS/Darwin 25.5.0 arm64, Playwright Chromium 145.0.7632.6. Local HTTP serving the assembled `_site`, real bundled SIMD WASM, one worker, no CPU throttling. Engine: `gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg6`. Baseline: commit `62064d9`, policy `minimum-two-v2`; after: `minimum-two-v3`.

The script resumes a valid 4–1 opening position in an isolated new browser context. Both players use Auto; default Jacoby, beavers/raccoons, feedback, costly-move warnings, analysis ahead and real animations are enabled. It waits two seconds at each player decision and 250 ms between checker steps, picks the first legal step using Play's accessible move selector, and confirms through the real button. Test-only fixed dice make replay identical. No engine answers are mocked. These are intentionally quick, sometimes poor human choices, including moves outside the prepared shortlist.

| Observed action | Before | After |
| --- | ---: | ---: |
| First confirmation / warning ready | 15,993 ms | 92 ms |
| First roll, including cube evaluation | 5,568 ms | 39 ms |
| Second roll, including cube evaluation | 5,977 ms | 42 ms |
| Second confirmation / warning ready | 7,749 ms | 118 ms |
| First confirmation through bot reply, including animation | 24,555 ms | 1,637 ms |
| Second confirmation through bot's double offer | 14,668 ms | 495 ms |

All corresponding committed states are identical between these two traces. Final replay reproduces the saved state exactly. The after trace completes every measured analysis at 3 ply. Its two prepared cube requests return in about **0.2 ms** inside the engine client; the larger roll times include UI and storage. Human submitted-move requests wait about **58–61 ms** after Confirm because actual-draft grading is already underway. Unprepared bot checker searches still take **460 ms and 1,679 ms** in this trace. The first prepared root takes about a second while the player is deciding.

This is **one recorded paired early-game trace**, not a population average, p95, full-game accuracy study or physical-phone benchmark. It includes two manually chosen turns, an automatic pass, two roll/cube choices and a bot cube offer. Browser compilation/HTTP caches may be warm; no engine result cache is preseeded. Confirmation timing ends when the action commits or the costly-move warning becomes actionable; accepting the warning and waiting for the bot are included only in the bot-reply column. Source records include all timed calls, depths, worker cancellations, committed states and environment:

- [Before](play-latency-baseline.json)
- [After](play-latency-after.json)

## Original preparation policy (October 13)

Idle analysis considers up to three near-best branches within 0.020 equity, all 21 possible random rolls, and legal cube responses. It favors the actual complete draft when known. Work remains bounded to 24 speculative evaluations, a 20-second scheduling budget, two checker turns and 64 cached results. A synchronous job may overrun its scheduling budget; current requests can cancel it. Settings can disable analysis ahead; hidden tabs and human-only games do not speculate.

Future rolls remain unbiased cryptographic random draws at the committed roll. They are never reserved, changed to match cached answers or exposed to multiplayer opponents. Consequently an unprepared roll or unexpected move still needs computation. The whole game tree cannot be cached within this budget, and mobile browser suspension stops useful background preparation.

## Verification and reproduction of the October 13 trace

`prepared-grading.cjs` checks unlisted actual moves with the real engine in money play with beavers, opposite-player match play, and explicit Fixed 4 bearoff analysis. It compares equity, cubeless equity, match-winning probability and all probabilities against an independent fresh worker (tolerance 0.00001), checks alternatives stay unchanged and verifies the completed grade is cached. `prethink-future.cjs` also plays the prepared best move, rolls a fixed-in-advance 2–1 for the bot, and requires the bot's actual checker search to use an identical completed future result from cache. These checks passed in Chromium 145, Firefox 146 and WebKit 26; [recorded validation](play-latency-validation.json) includes the numerical comparisons and actual future-cache hit in each browser. The repository suite passed 411 tests; the subsequently added affordable-4-ply regression and final deployment checks also passed. Desktop Play and 390×844 feedback screenshots were inspected. Unit tests cover mismatched contexts, illegal paths, failures/retry, equivalent paths, queue promotion, draft priority, stale completion, bounded speculation and conservative next-depth estimates.

```sh
node backgammon/scripts/offline-manifest.mjs
sh scripts/assemble-site.sh _site
npm run test:backgammon:latency
BG_MODULES=prepared-grading,prethink-ui,prethink-future,adaptive-play,engine-reuse node backgammon/tests/browser.cjs
node scripts/run-tests.mjs
```

The latency runner writes `backgammon/test-results/chromium-play-latency-report.json` plus an actual Play screenshot. `BG_THINK_MS` changes the thinking pause; report it when comparing results. Use the baseline commit in a separate checkout with the same test runner to reproduce the old controller. Never run other engine tests concurrently with a timing benchmark.

## Seeded preparation, October 15

Computer tables now preserve a private 256-bit seed and indexed HMAC-SHA-256 roll cursor. Preparation follows actual upcoming rolls along up to three near-best alternatives, for the current turn and the next two. The 24-evaluation/20-second budget, normal GNUbg search, foreground priority, cache bounds and visibility/battery controls remain in place. Peeking never consumes a roll, and GNUbg never receives the seed or future dice as decision information. Online dice are unchanged.

The current `play-latency.cjs` uses a fixed **seed**, rather than overriding individual random bytes. Its dice differ from the historical paired trace above, so those two runs are not a like-for-like before/after comparison. `prethink-future.cjs` also verifies that the bot rolls the predicted 2–1, reuses the exact prepared answer at 2+ ply, and saves the cursor advanced by exactly one. Pure tests independently reproduce HMAC vectors, rejection sampling, takeback replay and refresh serialization.

An isolated run on the same Apple M4 Pro and Chromium 145, without other engine tests running, recorded four human turns. It used a two-second thinking pause, 250 ms between checker steps, actual animations and the first legal choice from the accessible move selector. All measured evaluations completed at 3 ply.

| Human turn | Confirm / warning ready | Through bot reply, including animation |
| --- | ---: | ---: |
| 1 | 95 ms | 2,065 ms |
| 2 | 45 ms | 2,377 ms |
| 3 | 82 ms | 1,576 ms |
| 4 | 316 ms | 777 ms (cube offer) |

The three roll/cube actions took 39, 66 and 90 ms. Prepared cube requests returned in 0–0.1 ms inside the client. Unprepared bot checker searches took 439–1,115 ms: these deliberately quick first-legal choices often leave the near-best branches. A separate real-engine cache test retrieved the bot's prepared 3-ply answer in 0.7 ms after 1,302 ms of earlier calculation. Preparation reduces waiting when the played branch is ready; it cannot make every unexpected move instantaneous. Four observations are not a population average or p95, and no physical phone was benchmarked. [Complete seeded Play trace](play-latency-seeded.json).
