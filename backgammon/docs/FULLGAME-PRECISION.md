# Full-game precision follow-up

The original controlled full-game experiment completed 138,240 trials across 15 selected disagreements, plus a separate 32,768-trial opening-21 confirmation. Removing the five-turn cutoff shifted the average fixed-pair gap toward XG by −0.00952, with a secondary simultaneous 95% interval of [−0.01750, −0.00154]. The additional checker and cube effects were unresolved. Every individual full-game policy gap was unresolved after the planned correction.

Those estimates did not qualify for publication in the opening book. Full/strong's sampled mean absolute fixed-pair gap difference from XG was 0.01487 versus 0.01267 for the fresh Short baseline, and none of the individual effects cleared the original 45-comparison threshold. The separate 4,096-trial opening experiment was also inconclusive: Full/strong split minus slot was +0.00109, with simultaneous interval [−0.01686, +0.01904]. Wider intervals are not evidence that a disagreement has been fixed.

The original plans, samples, conclusions and failed acceptance criteria remain intact. This follow-up uses new fixed samples; it does not extend a run until it becomes significant, pool earlier results, or reinterpret the earlier acceptance rule.

## Two new fixed experiments

| Experiment | Positions | Trials per move/policy | Batch records | Total trials |
| --- | --- | --- | --- | --- |
| Precision cohort | Original opening 21 and 14 persistent replies | 4,096 | 13,440 | 430,080 |
| Opening precision | Opening 21 | 32,768 | 8,192 | 262,144 |

Both experiments use the same three policies:

- **Short:** checker 2-ply for two turns, then 1-ply; cube 2-ply; a 2-ply equity endpoint after five simulated turns.
- **Full/matched:** identical checker and cube decisions, with no turn cutoff.
- **Full/strong:** checker and cube 2-ply throughout, with no turn cutoff.

Short and Full/matched each compare the two previously fixed disputed moves. Full/strong evaluates every retained alternative: 45 moves across the cohort and four moves in the independent opening experiment. All moves within a published comparison use the same policy. The original Cube3 arm is retained in the earlier report; the follow-up does not spend more trials on it because that study did not establish a benefit.

The engine build, normal move filters, Jacoby-on/beavers-off rules, variance reduction, lack of dice rotation and eligible bearoff database endpoints are unchanged. Full games continue to a pass, game completion or eligible database endpoint. They still depend on neural estimates when choosing checker and cube actions. Removing truncation does not isolate neural weights from cube valuation or continuation-policy errors.

## Seeds, uncertainty and selection

Each batch contains 32 trials. Candidates and policies within a position share seeds; positions have disjoint seeds. The new cohort excludes all preceding experiments and timing/parity samples. The new opening experiment also excludes every planned seed of the new cohort, whether or not that seed has run yet. The complete signed plans were committed before collection. There is no optional stopping and no pooling across studies.

The cohort uses 128 independent blocks. Its 30 per-position cutoff/checker effects form one simultaneous 95% Student-t family; its 45 policy-position gaps form another. The two equally weighted cohort-average effects form a third family, computed from the 128 aggregate block means. Degrees of freedom are 127.

The opening experiment uses 1,024 independent blocks (1,023 degrees of freedom). Its two cutoff/checker effects, three policy gaps, and three Full/strong XG-versus-other-retained-move contrasts each form a separate simultaneous 95% family. The retained-move contrasts preserve shared-dice covariance. These distinct families do not jointly provide a single 95% guarantee.

These positions were selected because of earlier discrepancies. Findings apply to this cohort and these policies; they do not establish general playing strength or make XG exact truth. The reference is the published historical XG book, with its own uncertainty and different beaver rule, not a freshly executed XG solver.

## Publication rules

`fullgame-precision-promotion-plan.json` was recorded before any new samples. The complete precision cohort qualifies only if Full/strong lowers the sampled mean absolute fixed-pair gap difference from XG versus its fresh Short baseline, has at least as many mean pair preferences for XG, and replicates at least one average cutoff/checker effect toward XG under the new two-comparison simultaneous interval. This independently tests the average cutoff effect identified by the earlier study; it does not change that study's failed criteria.

If the cohort qualifies, all 15 positions and their retained alternatives are promoted together. Every reply uses 4,096-trial Full/strong estimates. Opening 21 uses the complete independent 32,768-trial four-move comparison, regardless of the winning move. Individual replies are not cherry-picked.

If the cohort fails, opening 21 can qualify separately only if all three Full/strong retained-move contrasts favor XG with positive simultaneous lower bounds, its fixed-pair gap is closer to XG than its fresh Short baseline, and a cutoff or checker effect shifts toward XG under the opening effect family. This rule then replaces all four opening alternatives together and preserves reply entries. If neither rule qualifies, the publisher refuses an unsupported accuracy change.

The rules are targeted engineering acceptance tests. A cohort-level update does not imply that each individual move preference is resolved. All sampling errors and screening limitations remain visible.

## Completed opening result

The independent opening study completed all 8,192 planned records: 32,768 trials per move/policy, 262,144 trials in total. Raw-record hashes, seed exclusions, candidate coverage and the paired statistics pass their validation checks.

| Policy | Split minus slot | Simultaneous 95% interval |
| --- | --- | --- |
| Short | +0.00389 | [+0.00316, +0.00462] |
| Full/matched | −0.00266 | [−0.00920, +0.00387] |
| Full/strong | −0.01196 | [−0.01868, −0.00524] |

Full/strong prefers **13/11 6/5 (slot)** over **13/11 24/23 (split)**, matching XG's published direction. XG's split-minus-slot gap is −0.00790. The absolute gap difference from that reference falls from 0.01179 under Short to 0.00406 under Full/strong. All three paired Full/strong contrasts favor the XG move over the other retained alternatives with positive simultaneous lower bounds.

Both controlled opening effects shift toward slot under their separate two-comparison family: removing the cutoff changes the gap by −0.00656 [−0.01266, −0.00045], and maintaining 2-ply checker play changes it by a further −0.00929 [−0.01746, −0.00113]. Thus both the truncated endpoint and late checker policy contributed to the opening disagreement under these settings. This does not isolate neural weights or prove that every full-game equity equals XG's value.

The opening independently satisfies its recorded publication rule. The cohort is still collecting its fixed sample; its results determine whether all 15 positions qualify together or only the opening qualifies. No partial cohort equities have been inspected, and its sample size and acceptance rule remain unchanged.

## Reproduction

Use the same pinned native build as the original ablation. Both hosts' executable parity and runtime weight/database hashes are recorded in the original validation artifacts. From the repository root with Node 22 and Python 3:

```sh
node backgammon/scripts/run-fullgame-ablation.mjs --precision
node backgammon/scripts/run-fullgame-ablation.mjs --opening-precision
python3 backgammon/scripts/summarize-fullgame-ablation.py --precision --publish
python3 backgammon/scripts/summarize-fullgame-ablation.py --opening-precision --publish
```

The default checkpoints are `test-results/fullgame-precision-v1` and `test-results/opening-fullgame-precision-v1`. `BG_ROLLOUT_WORKERS` and optional `BG_ROLLOUT_REMOTE_WORKERS` affect scheduling only. Opening precision initially receives ten local and eight remote workers; the cohort receives two local and two remote workers. Once opening precision finishes, the cohort can drain and resume with the freed workers. Checkpoints preserve all completed batches across restarts and storage interruptions.

Both completed datasets must pass provenance and statistical checks before `publish-fullgame-precision-book.mjs` can update the book. The reader must be explicitly versioned for a qualifying publication. The publisher validates the full retained candidate sets, legal board perspectives and reply coverage, and refuses failed criteria. Regenerate the book validation and offline manifest, then run unit and real-browser checks before deployment.

The Student-t critical values were independently checked using 45-digit direct integration of the Student-t density and root finding with mpmath 1.3.0. All 18 combinations of 31/127/1,023 degrees of freedom and 1/2/3/30/45/60 comparisons matched the dependency-free implementation within 1e-8. Regression fixtures retain the three 1,023-degree-of-freedom critical values; mpmath is not a production or CI dependency.
