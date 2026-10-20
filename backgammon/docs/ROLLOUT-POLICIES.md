# Checker and cube policies in rollouts

The bg7 engine changes the simulated players, not only the depth of the initial evaluation. Basic uses GNUbg 0-ply checker / 0-ply cube decisions, Balanced uses 1/1, and Strong uses 2/2. Both players use the selected depths throughout the game. The normal move filter can accept a clear shallow winner and screens alternatives; these are search policies, not exhaustive trees. Short/deep uses 2/2 for the first two simulated turns, then checker 1 / cube 2, and evaluates the endpoint at 2 ply after five simulated turns. This follows the broad short-rollout approach described by XG, with GNUbg's own evaluator and ply convention. Balanced is the default. The neural weights, bearoff databases and match-equity tables are unchanged.

Every batch resets its policy, normal move filters, random generator and stopping settings. Simulations use variance reduction, seeded ISAAC, the selected truncation policy and the existing bearoff termination. The old `bg_rollout` ABI remains 0/0. `bg_rollout_policy` accepts separate checker/cube depths, validates their bounds and returns them with the statistics. The JS adapter verifies those labels. Checkpoints bind the policy and engine version; samples from different policies cannot be pooled or resumed together. The Solver exposes all three choices.

## XG comparison

The experiment retains all 15 opening rolls, the 39 replies where the five-ply book disagrees with XG, and 12 evenly spaced agreeing replies as controls. It includes 201 candidate moves. Opening contenders include the top two five-ply moves, every move within .040 at any of three/four/five plies, and XG's preferred move. Replies include every retained five-ply finalist. This is a targeted diagnostic cohort, not a random backgammon sample or an independent tuning holdout.

The fixed comparison uses Basic, Balanced and Short/deep, with 512 trials per candidate per policy in sixteen independent 32-trial batches. Candidates and policies share the same batch seeds. All candidates receive the complete sample count; there is no significance-driven stopping or winner-only resampling. The comparison includes the existing five-ply estimates on this exact cohort. Root candidates are held constant while the simulated checker and cube policies change.

Candidate estimates pool the native sample means and variance moments. Candidate-gap intervals use paired differences between independent batch means, retaining common-dice covariance, with Student-t critical values. They are exploratory, unadjusted 95% intervals, not simultaneous guarantees after selecting a winner. They exclude policy bias, candidate-screening omissions and error in the XG reference. A small sample cannot settle every close move.

The reference is the [published XG opening book](https://www.extremegammon.com/Openingbook.aspx), retrieved with source hashes and per-move provenance in `deep-book-xg-reference.json`. It mixes finite rollouts and XGRoller++ estimates; it is not an exact solution. Its money context enables Jacoby and beavers, whereas these simulations use Jacoby without beavers. Earlier three-ply checks found a negligible beaver effect on the covered opening positions; that does not establish rollout equivalence.

## What can be reused from XG

XG's [official description](https://www.extremegammon.com/support.aspx) explains short variance-reduced rollouts with stronger early decisions, later checker/cube policies and a deeper truncated endpoint. These techniques can be implemented independently. This release compares full-game GNUbg policies with an independently implemented short-rollout recipe. The full-game 2/2 Strong option is available in Solver and has implementation tests; it is not part of the fixed accuracy cohort. GNUbg and XG use different ply numbering, evaluators, move filters and cube models, so matching a depth label does not reproduce XG.

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
```

`BG_ROLLOUT_NATIVE`, `BG_ROLLOUT_OUT`, `BG_ROLLOUT_TRIALS` and `BG_ROLLOUT_ONLY` select explicit alternative runs. A checkpoint signature binds the native build, reference hashes, candidate plan, depths and sample count. Changing these requires a separate output directory. SIGTERM finishes active batches and preserves completed records. The runner never changes the opening book automatically.

The native build uses the pinned corresponding source, the current bridge and tie-order patch, ARM64 NEON with preserved accumulation order, and larger caches for offline work. Native source/compiler/binary hashes are recorded. The parity harness gives the native process the default cache sizes used by WASM. Native, scalar WASM and SIMD WASM are checked on checker/cube positions in money and match play, including a mirrored checker position. Browser tests exercise real policies, cancellation, checkpoint isolation and the mobile selector. Implementation parity is separate from playing-strength evidence.
