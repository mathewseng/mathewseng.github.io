# Why 4–4 after the 4–1 slot disagrees

**Later implementation finding (bg9): every filtered-checker arm below used a faulty final sort that mixed discarded shallow candidates with deeper finalists. The recorded sample and statistics remain valid descriptions of that implementation, but cannot establish performance of correctly filtered GNUbg 2/3-ply policies. Historical raw data and signed plans are unchanged. The fixed selector is tested independently; new full-game trials measure its aggregate effect. Old affected rollout-book estimates are retired from live lookup.**

The [deterministic regression](filtered-rollout-regression.json) reproduces a discarded 0-ply move winning over the 2-ply finalists. Its actual 2-ply equity is 0.022408 worse than the correct winner. Removing the final whole-list sort restores upstream selection. The independent cache-off two-game replay agrees within 0.000006 equity for the 8/4 continuation; the 13/9 replay differs by 0.000425 after an exact-score bearoff tie. These are implementation diagnostics, not new accuracy samples.

The completed 32,768-trial experiment found a persistent disagreement for `41$-44`. GNUbg preferred the double hit plus 8/4(2), with equity 0.60107, over the double hit plus 13/9(2), with equity 0.58499. [David Rockwell's published XG 2.00 rollout](https://www.extremegammon.com/OB/Replies_to_41$.html) instead lists 0.6005 and 0.6118, respectively, after 62,208 games with 3-ply checker and cube decisions. The difference is move-specific: adding a common equity offset cannot fix it. Full-game continuation already rules out the old five-turn cutoff as the sole cause.

The previous GNUbg experiment used Jacoby without beavers. XG's published reference uses Jacoby and its Beaver setting, which includes raccoons. The [XG manual](https://www.extremegammon.com/extremegammon2.pdf) describes accepting a double at 2, beavering to 4 while keeping ownership, and allowing the original doubler to raccoon to 8. XG's source XGID specifies a cube ceiling of 1024. Its [depth comparison](https://www.extremegammon.com/studies.aspx) also notes that GNUbg 2-ply is comparable in lookahead to other bots' 3-ply; their depth labels are not interchangeable strength guarantees.

For historical context, [Nack Ballard's September 2009 reply chart](https://timothychow.net/2ndroll_bill.pdf), credited to Stick's bgonline.org, recommends the double hit and making the 4-point for this exact reply. The row and explanatory footnote were checked visually. The chart provides no engine settings, sample count or equity uncertainty, so it is not an independent quantitative validation of our result or evidence against the later XG rollout.

## Historical experiment with the affected selector

[All 20 workers completed successfully](https://github.com/mathewseng/mathewseng.github.io/actions/runs/39801091859). The full, fixed sample contains 163,840 games in 5,120 validated batches. No interim EVs were inspected, and no samples were dropped or added after seeing the results. [The results](cube-policy-study-v2-comparison.json), [raw batches](cube-policy-study-v2-batches.jsonl.gz), and [worker execution evidence](cube-policy-study-v2-execution.json) are published together.

Both moves double hit with 24/20* 20/16*. Positive gaps below favor XG's 13/9(2). Intervals provide simultaneous 95% coverage across the five policy gaps.

| Policy | 8/4(2) EV | 13/9(2) EV | Move gap | Simultaneous 95% interval |
| --- | ---: | ---: | ---: | --- |
| Published XG | 0.60050 | 0.61180 | +0.01130 | Separate printed candidate margins: ±0.0033 and ±0.0032 |
| Legacy | 0.60448 | 0.58757 | −0.01690 | [−0.03016, −0.00365] |
| Cache fix only | 0.60448 | 0.58757 | −0.01691 | [−0.03016, −0.00365] |
| Matched cube rules | 0.60448 | 0.58757 | −0.01691 | [−0.03015, −0.00366] |
| Wider 2-ply checker | 0.59504 | 0.58147 | −0.01357 | [−0.02668, −0.00046] |
| Deeper 3-ply checker | 0.60403 | 0.59744 | −0.00659 | [−0.01992, +0.00674] |

**Under the affected selector, matching the cube rules did not explain this disagreement.** Matched−Cache changes the move gap by −0.00000043, with paired simultaneous 95% interval [−0.00004315, +0.00004229]. Across all three matched-rule arms, no beaver or raccoon was actually chosen, and the largest cube was 64, below the 1024 ceiling. The rule corrections remain necessary for legal handling, but their effect on this position is tiny under these policies.

**Under the affected selector, the verified cache defect had little measured effect.** Cache−Legacy changes the gap by −0.00000085, with interval [−0.00000275, +0.00000106]. The bg8 production fix remains justified by the deterministic regression; this experiment does not support presenting that fix as the explanation for the old 0.027 gap discrepancy.

**The checker experiments have not established a solution.** Wider−Matched shifts the gap by +0.00333, with interval [−0.00341, +0.01008]; the wider policy still supports 8/4(2). Deeper−Matched shifts it by +0.01032, with interval [−0.00599, +0.02662]. The deeper sample mean is closer to XG, but neither its improvement nor its move ordering is resolved by the predeclared simultaneous intervals. These effect intervals form their own four-comparison family; they are not obtained by subtracting the marginal gap intervals.

Wider checker play lowers both candidate EVs by resolved amounts: −0.00944 for 8/4(2) and −0.00610 for 13/9(2), using the separate eight-comparison candidate-effect family. This demonstrates sensitivity to continuation policy; it does not show improved agreement with XG. The deeper policy's 13/9(2) estimate is still 0.01436 below the published XG mean (GNUbg SE 0.00378), outside the requested 0.005 point-estimate tolerance. Its 8/4(2) estimate is 0.00353 above XG (SE 0.00347). No tested policy brings both EV means within 0.005 or establishes XG's move as the winner.

The supported inference is that the old ranking is reproducible under the original checker policy and survives the tested rule/cache corrections. The residual may reflect checker or cube continuation-policy/evaluator differences from XG; this study does not isolate a specific remaining model defect or prove XG's published mean to be ground truth. Direct XG continuation analysis would help distinguish later policy choices, but is unavailable. The later independent GNUbg audit isolated the selector implementation defect described above; corrected full-game samples are needed to measure its effect before assigning the remaining gap to model error. The wider/deeper policies are not promoted as an accuracy fix, and no reference values or offsets are substituted into these independent results.

## Verified implementation problems

The pinned GNUbg rollout executes `DOUBLE_BEAVER` through its ordinary double/take branch, accepting a cube of 2 instead of 4. Its internal cubeful search backup also compares ordinary take equity without the immediate beaver response. Enabling a boolean flag alone would therefore produce a misleading rule comparison. The old bridge intentionally disabled beavers, so these newly identified issues did not invalidate its declared ordinary-cube experiment.

The research implementation evaluates the legal no-double, double/take, beaver/take and raccoon/take branches together. Each has its own cube value and ownership, but they share GNUbg's checker lookahead under the original cube context; these are separate cubeful estimates, not four independent checker searches. It solves the alternating offer tree with ordinary pass, beaver pass and raccoon pass payoffs of +1, −2 and +4 in the original doubler's cube units. The original responder owns the cube after every accepted immediate redouble. The actual rollout applies the chosen accepted cube and terminal payoff together, then plays subsequent checker turns under the accepted cube context. A cube ceiling also stops further offers, uses dead-cube evaluation at the ceiling and distinguishes cube values in the evaluation cache. Future search-node beaver backups use scale-invariant continuation approximations; this is still GNUbg's approximate evaluator, not XG's proprietary algorithm.

The implementation is in `scripts/rollout-cube-policy.h` and `scripts/patch-rollout-cube-study.py`, built with `build-rollout-native.mjs --cube-study`. Historical binaries and study inputs remain unchanged. Tests compare 56 offer paths with `core/rules.mjs`, plus unavailable offers, the cube ceiling and a Jacoby/beaver decision reversal. Sixteen seeded historical native cases reproduce every output field exactly in legacy mode. See [validation](cube-policy-native-validation.json).

## Frozen replacement experiment

**This first collection was stopped for implementation correctness, before its interim EVs were inspected.** It saved 269 batches (8,608 trials). The [abort record](cube-policy-study-v1-abort.json) and [unchanged partial raw data](cube-policy-study-v1-aborted-batches.jsonl.gz) preserve the audit trail; these outcomes are excluded from inference. The replacement excludes the entire original planned seed set, not just completed batches. The original [signed plan](cube-policy-study-inputs.json) remains unchanged.

A deterministic search-node audit found that cubeful continuation values were cached under the counterfactual cube alone, although their checker decisions were chosen using a different cube context. Later queries could reuse the wrong checker policy's value. Across these two post-move boards, 60 actual cache hits were wrong by more than 0.00001, with maximum errors 0.00228506 and 0.00173450. The fix distinguishes the checker-policy cube context in money-game cache keys and avoids incompatible counterfactual cache reuse in match play. All reproduced wrong hits disappear, and replayed queries match fresh evaluation. This proves an implementation defect; it does not establish that the defect explains the entire 0.027 discrepancy. See [deterministic regression evidence](cube-cache-context-validation.json) and `scripts/validate-cube-cache-context.py`.

The signed replacement design retains 16,384 games per move per arm and adds a cache-only control. Cache−Legacy measures the caching fix, Matched−Cache measures the corrected cube rules, Wide−Matched measures broader checker selection, and Deep−Matched measures deeper checker selection. The Linux ARM64 execution platform passed all 26 excluded validation cases (maximum historical difference 0.00000608) and the deterministic cache regression. All workers use the exact same executable and original neural/bearoff/MET assets; their hashes are in the [runtime manifest](cube-policy-v2-runtime.json). Both evaluator caches are cleared before each paired block in every arm, eliminating cross-block history and scheduling as a source of dependence.

Legacy retains the old policy and cache defect within each block. It is not a replay of the earlier workers' cache history across blocks. Consequently, the controlled effects refer to this new experiment; the earlier 32,768-game estimates are historical context and are not pooled with it.

[The signed replacement input plan](cube-policy-study-v2-inputs.json) fixes 16,384 games per move per policy before collection: 163,840 full games, 512 paired blocks of 32 for each of ten move/policy combinations. Every seed is new relative to all preceding studies and timing/validation samples. The two moves and all five policies share dice within blocks.

| Policy | Cube rules/decisions | Checker policy throughout |
| --- | --- | --- |
| Legacy | Previous ordinary-cube implementation and cache, 2-ply | 2-ply, normal filter |
| Cache | Only the checker-policy cache fix; previous ordinary cube, 2-ply | 2-ply, normal filter |
| Matched | Jacoby, beavers and raccoons, 2-ply | 2-ply, normal filter |
| Wide | Same matched rules and cube policy | 2-ply, huge filter |
| Deep | Same matched rules and cube policy | 3-ply, large filter |

The normal 2-ply filter retains up to 8 moves within 0.160 equity after 0-ply screening. Huge retains up to 20 within 0.440. Large 3-ply retains up to 16 within 0.320, then up to 4 within 0.080 after 2-ply scoring. These are explicit changes to candidate selection and continuation decisions, not relabeling the opening reference book.

The neural weight text file in both the research runtime and browser source matches the [official GNUbg 1.08.003 release](https://ftp.gnu.org/gnu/gnubg/gnubg-release-1.08.003-sources.tar.gz) byte for byte. Every runtime binary parameter in all six networks also matches the float32 conversion of the official text, including network dimensions and activation scales. [The source and weight hashes](gnubg-weight-provenance.json) record this check. It rules out a substituted or stale weight file, not model error; all five arms deliberately retain the same neural model.

All arms run full games with no fixed-turn cutoff or weakened late policy. Exact two-sided bearoff termination remains eligible. Variance reduction uses the same 1-ply control depth in every arm (the control values reflect that arm's rules and cache behavior); increasing checker depth does not silently change the control variate. Cube search stays at 2-ply. No sample pooling, outcome-based stopping or reference-value substitution is permitted.

Four primary paired changes in the XG-choice-minus-alternative gap isolate: Cache−Legacy, Matched−Cache, Wide−Matched and Deep−Matched. They form one simultaneous 95% Student-t family. Five policy move gaps form a separate family; eight per-candidate policy effects form a third. Published XG marginal bounds are retained, and the 0.005 absolute-equity target is reported separately from move ordering. A negative result will remain visible. This one selected position cannot establish general opening/reply accuracy.

Status: the complete fixed experiment passed input, sample, seed, runtime and worker validation. Timing and validation outputs are excluded from inference. See the completed diagnosis above.

The same defect was also reproduced in the production bg7 source with ordinary cube rules: 20 incorrect hits across these two post-move boards. The standalone `checker-context-bg8.patch` repairs every captured query; see [production-source regression evidence](live-cache-context-validation.json). Browser rollout support for immediate redoubles remains separate from the research implementation.

## Reproduction

`backgammon-policy-prepare.yml` builds and validates the research runtime. Its source archive and every build/patch input are pinned by the signed plan. The small executable bundle includes the GPL license; the weights and databases are extracted from the separately pinned original source archive.

`backgammon-policy-study.yml` runs 20 fixed shards with four workers each. Every shard rechecks the runtime assets and the excluded deterministic fixture before collecting any samples. Shard `k` receives paired blocks whose index modulo 20 equals `k`; all ten move/policy combinations remain in the same shard. Status logs contain counts and health only. A failed job retains its completed batches, and an exact retry uses the same fixed seeds, without choosing results by outcome.

After all shards finish, `merge-cube-policy-shards.py ARTIFACT_DIRECTORY --run-id RUN_ID` requires all 5,120 unique planned records. It checks each worker's executable, architecture, validation fixture and script, numerical tolerance, and completed shard count. The execution record retains every worker's validation and original raw checksum, plus a sorted-record checksum that can be verified against the public combined raw data. `summarize-cube-policy-study-v2.py` then validates every sample, setting and seed before calculating the predeclared paired contrasts. No partial collection is accepted as the full experiment. The regression tests recompute all published estimates and paired effects from the compressed raw batches, check their execution evidence, and require the page's data to match the archived result exactly.

The frozen plan's phrase “identical 1-ply control-variate evaluations” refers to identical control **depth**, not identical numerical values across rule/cache arms. “Separately evaluated” cube branches have distinct cube contexts and estimates within one shared checker search, as described above. The result metadata and report retain these clarifications without changing the signed plan. Deep−Matched tests a checker-policy bundle (depth and filter); Matched−Cache tests corrected offer handling and the cube ceiling together with XG's immediate-redouble rules.
