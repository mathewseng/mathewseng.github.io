# Checker and cube policies in rollouts

The bg7 engine changes the simulated players, not only the depth of the initial evaluation. Basic uses GNUbg 0-ply checker / 0-ply cube decisions, Balanced uses 1/1, and Strong uses 2/2. Both players use the selected depths throughout the game. The normal move filter can accept a clear shallow winner and screens alternatives; these are search policies, not exhaustive trees. Short/deep uses 2/2 for the first two simulated turns, then checker 1 / cube 2, and evaluates the endpoint at 2 ply after five simulated turns. This follows the broad short-rollout approach described by XG, with GNUbg's own evaluator and ply convention. Balanced is the default. The neural weights, bearoff databases and match-equity tables are unchanged.

Every batch resets its policy, normal move filters, random generator and stopping settings. Simulations use variance reduction, seeded ISAAC, the selected truncation policy and the existing bearoff termination. The old `bg_rollout` ABI remains 0/0. `bg_rollout_policy` accepts separate checker/cube depths, validates their bounds and returns them with the statistics. The JS adapter verifies those labels. Checkpoints bind the policy and engine version; samples from different policies cannot be pooled or resumed together. The Solver exposes all four choices.

## XG comparison

The experiment retains all 15 opening rolls, the 39 replies where the five-ply book disagrees with XG, and 12 evenly spaced agreeing replies as controls. It includes 201 candidate moves. Opening contenders include the top two five-ply moves, every move within .040 at any of three/four/five plies, and XG's preferred move. Replies include every retained five-ply finalist. This is a targeted diagnostic cohort, not a random backgammon sample or an independent tuning holdout.

The fixed comparison uses Basic and Short/deep, with 512 trials per candidate per policy in sixteen independent 32-trial batches. Candidates and policies share the same batch seeds. All candidates receive the complete sample count; there is no significance-driven stopping or winner-only resampling. The comparison includes the existing five-ply estimates on this exact cohort. Root candidates are held constant while the simulated checker and cube policies change.

Candidate estimates pool the native sample means and variance moments. Candidate-gap intervals use paired differences between independent batch means, retaining common-dice covariance, with Student-t critical values. They are exploratory, unadjusted 95% intervals, not simultaneous guarantees after selecting a winner. They exclude policy bias, candidate-screening omissions and error in the XG reference. A small sample cannot settle every close move.

The reference is the [published XG opening book](https://www.extremegammon.com/Openingbook.aspx), retrieved with source hashes and per-move provenance in `deep-book-xg-reference.json`. It mixes finite rollouts and XGRoller++ estimates; it is not an exact solution. Its money context enables Jacoby and beavers, whereas these simulations use Jacoby without beavers. Earlier three-ply checks found a negligible beaver effect on the covered opening positions; that does not establish rollout equivalence.

## Completed comparison and published book

All 201 candidates completed 512 trials under each published policy (205,824 simulated candidate games; 6,432 independent batch records). Mean EV gap below is the mean absolute difference on XG's preferred move, in current-cube equity units.

| Cohort | Five-ply mean EV gap / matching moves | Basic mean EV gap / matching moves | Short/deep mean EV gap / matching moves |
| --- | --- | --- | --- |
| All 15 openings | 0.007508 / 13 of 15 | 0.014758 / 11 of 15 | 0.005740 / 14 of 15 |
| 39 disputed replies | 0.010997 / 0 of 39 | 0.016081 / 18 of 39 | 0.006309 / 16 of 39 |
| 12 agreeing reply controls | 0.010643 / 12 of 12 | 0.011233 / 11 of 12 | 0.004847 / 12 of 12 |
| All 66 decisions | 0.010140 / 25 of 66 | 0.014899 / 40 of 66 | 0.005914 / 42 of 66 |

Short/deep improves mean EV agreement in all three cohorts and overall choice agreement against both baselines. Basic happens to match two more of the disputed replies at this sample count; stronger policies do not win every individual comparison. Its largest candidate sampling interval is about ±0.076 versus ±0.0065 for Short/deep. Short/deep has 36 of 66 leaders separated from all retained alternatives by the exploratory paired intervals, versus 12 for Basic. This is evidence of improved estimates on this cohort, not an Elo test or proof of XG-level strength.

All three complete cohorts meet the publication gate: no fewer XG best-move matches and a smaller mean EV gap than the five-ply baseline. The resulting `jacoby-short-deep-v1` book stores 66 decisions/201 candidates with their original policy, samples, standard errors and source hashes. The guide and default client use it; missing entries retain the historical five-ply/three-ply fallback. An unlisted submitted move receives a complete fallback comparison. The client never subtracts a tree value from a rollout value to grade a move.

The actual published lookup path was checked against all 666 matched reference decisions: **14/15 openings and 628/651 replies** agree with XG, versus 13/15 and 612/651 previously. It uses 66 sampled entries and 600 five-ply fallbacks. Mean EV gap over all 651 replies changes from 0.012133 to 0.011746; the improvement is concentrated in the 51 recomputed replies. Every stored decision was also checked with reversed player orientation, actual-move grading and an omitted alternative. Browser tests check source labels, intervals, responsive guide/Solver/report views, missing-download fallback and cached offline use.

Opening 21 still prefers splitting over slotting by just 0.000775, with a paired 95% half-width of 0.004711; this rollout does not resolve that ordering. There are still 23 reply disagreements. The follow-up [independent confirmation](ROLLOUT-DIAGNOSTIC.md) gives each conflicting move 4,096 fresh trials to distinguish sampling uncertainty from persistent pipeline differences. It leaves the published full-candidate book unchanged.

## What can be reused from XG

XG's [official description](https://www.extremegammon.com/support.aspx) explains short variance-reduced rollouts with stronger early decisions, later checker/cube policies and a deeper truncated endpoint. These techniques can be implemented independently. This release compares full-game GNUbg policies with an independently implemented short-rollout recipe. The full-game 1/1 Balanced and 2/2 Strong options are available in Solver and have implementation tests; they are not part of the fixed accuracy cohort. GNUbg and XG use different ply numbering, evaluators, move filters and cube models, so matching a depth label does not reproduce XG.

No public embeddable XG engine or source license was found in its published product/support materials. This implementation does not contain XG's neural weights or executable engine. The published book is used as an attributed external reference. Copying a rollout recipe would not reproduce the trained evaluator behind it.

## Deterministic tie ordering

The pinned native `CompareMoves` returned −1 in both directions when primary and secondary scores were equal. That violates the C sorting contract. Native macOS and WebAssembly sorting could therefore select different equal-score continuations. A seeded match rollout reproduced a large difference in the reported backgammon probability even though match equity agreed, because backgammons had no extra value at that score.

`rollout-order-bg7.patch` orders by primary score, secondary score, then the full seven-word position key, returning zero for identical keys. The failing match position agrees after the fix. All 24 money/match/checker/cube policy cases subsequently agree exactly across native ARM64 and scalar/SIMD WASM with matching caches. A larger native cache changes one tested Strong cube rollout’s probabilities by at most 0.00001807 and equity by less than 0.000001; this cache-dependent floating-point effect is separate from the fixed comparator defect. The native benchmark validates the comparator contract at startup. Earlier experiment checkpoints from the uncorrected binary are kept separately and excluded from the corrected experiment.

## Reproduction

Use Node 22. From the repository root:

```sh
node backgammon/scripts/build-rollout-native.mjs /tmp/bg-strong-rollout-native-v3
node backgammon/scripts/validate-rollout-policies.mjs
BG_ROLLOUT_WORKERS=6 node backgammon/scripts/rollout-disagreements.mjs
node backgammon/scripts/summarize-rollout-disagreements.mjs
node backgammon/scripts/publish-rollout-comparison.mjs
node backgammon/scripts/publish-rollout-book.mjs
node backgammon/scripts/validate-rollout-book.mjs
```

`BG_ROLLOUT_NATIVE`, `BG_ROLLOUT_OUT`, `BG_ROLLOUT_TRIALS` and `BG_ROLLOUT_ONLY` select explicit alternative runs. A checkpoint signature binds the native build, reference hashes, candidate plan, depths and sample count. Changing these requires a separate output directory. SIGTERM finishes active batches and preserves completed records. The runner never changes the opening book automatically.

The initial experiment planned Basic, Balanced and Short/deep at 512 trials. Before any Balanced batches in the corrected run were available, the publication scope was narrowed to Basic versus Short/deep because the full-game intermediate policy was substantially slower to sample. Every planned candidate, seed and trial was retained for both published policies. The [original plan](rollout-policy-original-inputs.json) and an explicit [amendment](rollout-policy-plan-amendment.json) are preserved alongside the published inputs; no positions were dropped based on results.

The native build uses the pinned corresponding source, the current bridge and tie-order patch, ARM64 NEON with preserved accumulation order, and larger caches for offline work. Native source/compiler/binary hashes are recorded. The parity harness gives the native process the default cache sizes used by WASM. Native, scalar WASM and SIMD WASM are checked on checker/cube positions in money and match play, including a mirrored checker position. Browser tests exercise real policies, cancellation, checkpoint isolation and the mobile selector. Implementation parity is separate from playing-strength evidence.

## Release checks

The final book integration passes all 324 Backgammon unit tests, including deployment/offline/manifest checks. The actual 66-entry book, source labels, intervals, omitted-move fallback and comparison report pass in Chromium 145, Firefox 146 and WebKit 26. Chromium also verifies cached lookup offline. Five-ply fallback, five responsive guide layouts and the phone tool layout pass in Chromium and WebKit. Screenshots were inspected for the guide, Solver and report. These browser layouts are emulation, not physical-device tests. The 24 native/scalar/SIMD policy cases and the centered-money-cube scaling check are recorded separately in `rollout-policy-validation.json`.
