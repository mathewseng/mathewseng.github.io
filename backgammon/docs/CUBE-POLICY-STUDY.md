# Why 4–4 after the 4–1 slot disagrees

The completed 32,768-trial experiment found a persistent disagreement for `41$-44`. GNUbg preferred the double hit plus 8/4(2), with equity 0.60107, over the double hit plus 13/9(2), with equity 0.58499. [David Rockwell's published XG 2.00 rollout](https://www.extremegammon.com/OB/Replies_to_41$.html) instead lists 0.6005 and 0.6118, respectively, after 62,208 games with 3-ply checker and cube decisions. The difference is move-specific: adding a common equity offset cannot fix it. Full-game continuation already rules out the old five-turn cutoff as the sole cause.

The previous GNUbg experiment used Jacoby without beavers. XG's published reference uses Jacoby and its Beaver setting, which includes raccoons. The [XG manual](https://www.extremegammon.com/extremegammon2.pdf) describes accepting a double at 2, beavering to 4 while keeping ownership, and allowing the original doubler to raccoon to 8. XG's source XGID specifies a cube ceiling of 1024. Its [depth comparison](https://www.extremegammon.com/studies.aspx) also notes that GNUbg 2-ply is comparable in lookahead to other bots' 3-ply; their depth labels are not interchangeable strength guarantees.

## Verified implementation problems

The pinned GNUbg rollout executes `DOUBLE_BEAVER` through its ordinary double/take branch, accepting a cube of 2 instead of 4. Its internal cubeful search backup also compares ordinary take equity without the immediate beaver response. Enabling a boolean flag alone would therefore produce a misleading rule comparison. The old bridge intentionally disabled beavers, so these newly identified issues did not invalidate its declared ordinary-cube experiment.

The research implementation evaluates the legal no-double, double/take, beaver/take and raccoon/take branches together. It solves the alternating offer tree with ordinary pass, beaver pass and raccoon pass payoffs of +1, −2 and +4 in the original doubler's cube units. The original responder owns the cube after every accepted immediate redouble. The actual rollout applies the chosen accepted cube and terminal payoff together. A cube ceiling also stops further offers, uses dead-cube evaluation at the ceiling and distinguishes cube values in the evaluation cache. Future search-node beaver backups use scale-invariant continuation approximations; this is still GNUbg's approximate evaluator, not XG's proprietary algorithm.

The implementation is in `scripts/rollout-cube-policy.h` and `scripts/patch-rollout-cube-study.py`, built with `build-rollout-native.mjs --cube-study`. Historical binaries and study inputs remain unchanged. Tests compare 56 offer paths with `core/rules.mjs`, plus unavailable offers, the cube ceiling and a Jacoby/beaver decision reversal. Sixteen seeded historical native cases reproduce every output field exactly in legacy mode. See [validation](cube-policy-native-validation.json).

## Frozen replacement experiment

**This first collection was stopped for implementation correctness, before its interim EVs were inspected.** It saved 269 batches (8,608 trials). The [abort record](cube-policy-study-v1-abort.json) and [unchanged partial raw data](cube-policy-study-v1-aborted-batches.jsonl.gz) preserve the audit trail; these outcomes are excluded from inference. The replacement excludes the entire original planned seed set, not just completed batches. The original [signed plan](cube-policy-study-inputs.json) remains unchanged.

A deterministic search-node audit found that cubeful continuation values were cached under the counterfactual cube alone, although their checker decisions were chosen using a different cube context. Later queries could reuse the wrong checker policy's value. Across these two post-move boards, 60 actual cache hits were wrong by more than 0.00001, with maximum errors 0.00228506 and 0.00173450. The fix distinguishes the checker-policy cube context in money-game cache keys and avoids incompatible counterfactual cache reuse in match play. All reproduced wrong hits disappear, and replayed queries match fresh evaluation. This proves an implementation defect; it does not establish that the defect explains the entire 0.027 discrepancy. See [deterministic regression evidence](cube-cache-context-validation.json) and `scripts/validate-cube-cache-context.py`.

The signed replacement design retains 16,384 games per move per arm and adds a cache-only control. Cache−Legacy measures the caching fix, Matched−Cache measures the corrected cube rules, Wide−Matched measures broader checker selection, and Deep−Matched measures deeper checker selection. The Linux ARM64 execution platform passed all 26 excluded validation cases (maximum historical difference 0.00000608) and the deterministic cache regression. All workers use the exact same executable and original neural/bearoff/MET assets; their hashes are in the [runtime manifest](cube-policy-v2-runtime.json). Both evaluator caches are cleared before each paired block in every arm, eliminating cross-block history and scheduling as a source of dependence.

[The signed replacement input plan](cube-policy-study-v2-inputs.json) fixes 16,384 games per move per policy before collection: 163,840 full games, 512 paired blocks of 32 for each of ten move/policy combinations. Every seed is new relative to all preceding studies and timing/validation samples. The two moves and all five policies share dice within blocks.

| Policy | Cube rules/decisions | Checker policy throughout |
| --- | --- | --- |
| Legacy | Previous ordinary-cube implementation and cache, 2-ply | 2-ply, normal filter |
| Cache | Only the checker-policy cache fix; previous ordinary cube, 2-ply | 2-ply, normal filter |
| Matched | Jacoby, beavers and raccoons, 2-ply | 2-ply, normal filter |
| Wide | Same matched rules and cube policy | 2-ply, huge filter |
| Deep | Same matched rules and cube policy | 3-ply, large filter |

The normal 2-ply filter retains up to 8 moves within 0.160 equity after 0-ply screening. Huge retains up to 20 within 0.440. Large 3-ply retains up to 16 within 0.320, then up to 4 within 0.080 after 2-ply scoring. These are explicit changes to candidate selection and continuation decisions, not relabeling the opening reference book.

All arms run full games with no fixed-turn cutoff or weakened late policy. Exact two-sided bearoff termination remains eligible. Variance reduction uses the same 1-ply control depth in every arm (the control values reflect that arm's rules and cache behavior); increasing checker depth does not silently change the control variate. Cube search stays at 2-ply. No sample pooling, outcome-based stopping or reference-value substitution is permitted.

Four primary paired changes in the XG-choice-minus-alternative gap isolate: Cache−Legacy, Matched−Cache, Wide−Matched and Deep−Matched. They form one simultaneous 95% Student-t family. Five policy move gaps form a separate family; eight per-candidate policy effects form a third. Published XG marginal bounds are retained, and the 0.005 absolute-equity target is reported separately from move ordering. A negative result will remain visible. This one selected position cannot establish general opening/reply accuracy.

Status: replacement plan signed and worker validation complete; [full-sample collection is running](https://github.com/mathewseng/mathewseng.github.io/actions/runs/39801091859). Timing and validation outputs are excluded from inference.

The same defect was also reproduced in the production bg7 source with ordinary cube rules: 20 incorrect hits across these two post-move boards. The standalone `checker-context-bg8.patch` repairs every captured query; see [production-source regression evidence](live-cache-context-validation.json). Browser rollout support for immediate redoubles remains separate from the research implementation.

## Reproduction

`backgammon-policy-prepare.yml` builds and validates the research runtime. Its source archive and every build/patch input are pinned by the signed plan. The small executable bundle includes the GPL license; the weights and databases are extracted from the separately pinned original source archive.

`backgammon-policy-study.yml` runs 20 fixed shards with four workers each. Every shard rechecks the runtime assets and the excluded deterministic fixture before collecting any samples. Shard `k` receives paired blocks whose index modulo 20 equals `k`; all ten move/policy combinations remain in the same shard. Status logs contain counts and health only. A failed job retains its completed batches, and an exact retry uses the same fixed seeds, without choosing results by outcome.

After all shards finish, `merge-cube-policy-shards.py ARTIFACT_DIRECTORY --run-id RUN_ID` requires all 5,120 unique planned records. `summarize-cube-policy-study-v2.py` then validates every sample, setting and seed before calculating the predeclared paired contrasts. No partial collection is accepted as the full experiment.
