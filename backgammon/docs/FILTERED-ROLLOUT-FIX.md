# Filtered checker selection regression

The bg9 patch fixes a real checker-policy error found by tracing full games
against unmodified GNUbg 1.08.003. After a filtered search, the fork sorted
every candidate together again. That list included both deep finalists and
screened-out shallow evaluations. A shallow score could therefore displace
the winner of the requested search. Removing this final whole-list sort
preserves the ordering of the deep finalists, matching upstream GNUbg.

The numerical evaluator itself did not change. This matters for attribution:
the defect affects filtered native checker selection, including full-game
rollouts, but the direct root `bg_score` API scores each candidate separately
through `ScoreMove`. Same-depth direct score comparisons are not invalidated
by this particular bug. Existing frozen rollout studies describe the old
policy and must not be relabeled or pooled with corrected-policy results.

## Deterministic witness

The witness occurs in the 8/4 continuation of the disputed 4–4 reply to the
4–1 slot: excluded validation seed 31811004, game index 1, turn index 40,
roll 6–3. Its exact position is:

```text
XGID=-cBFB--b-----a---b-bbc----:1:-1:-1:63:0:0:1:0:10
```

| Move | Old filtered score | Actual 2-ply equity | Selection |
| --- | ---: | ---: | --- |
| 24/15 | −1.52729738 at 0 ply | −1.55881238 | Incorrectly selected before fix |
| 24/18 12/9 | −1.53640473 at 2 ply | −1.53640473 | Selected after fix and by official GNUbg |

The wrong choice loses 0.02240765 equity under the same two-ply evaluator.
The old shallow score retained the two-ply search's root cube-efficiency
context; its standalone zero-ply equity is −1.52227914. Those two numbers
should not be confused.

The native regression re-links the same frozen engine objects twice, changing
only `eval.c` by the published patch. It retains normal move filters and
disables the ordinary evaluation cache in both versions. It records all
23 legal result boards, their original filtered depths/scores, and their
independent zero- and two-ply scores. The independent scores remain unchanged
within 0.000001. All 46 comparisons against the unmodified official CLI agree
within 0.00000178. Official root filters are disabled for these comparisons
so every candidate receives the advertised depth.

See the [input](filtered-rollout-regression-input.json),
[complete numerical evidence](filtered-rollout-regression.json), and
[source patch](../engine/source/filtered-rollout-bg9.patch).

## Full-game replay and limits

The two excluded validation games were replayed for each original continuation,
with ordinary Jacoby cube rules, checker/cube depth 2, normal filters, ISAAC,
one-ply variance reduction, no fixed cutoff or late weakening, and exact
bearoff enabled. Both ordinary evaluation caches were disabled to remove a
separate upstream/fork cache-key difference. The pruning cache remained on.

| Continuation | Before fix | After fix | Official GNUbg | After minus official |
| --- | ---: | ---: | ---: | ---: |
| 8/4 | 0.75325572 | 0.79043913 | 0.790445 | −0.00000587 |
| 13/9 | 0.20143813 | 0.20143813 | 0.201013 | +0.00042513 |

These are deterministic replay outputs, **not accurate equity estimates**.
The first substantive 8/4 checker divergence disappears with the isolated
patch. The remaining 13/9 trace difference begins at game 0, turn 50,
roll 3–2, where the chosen alternatives both evaluate to exactly −1.0 at
two ply. The fork uses deterministic tie ordering that differs from upstream.
This permits different later paths and variance-reduction corrections even
when a move has exactly the same expected value. The residual difference is
retained rather than treated as numerical parity.

The [compressed trace evidence](filtered-rollout-traces.json.gz) preserves
official SGFs, before/after native traces, the cloned instrumentation patches,
both divergence positions, and the exact-score tie evaluations. The broader
[default-cache diagnostic](upstream-rollout-validation.json) and
[cache-disabled diagnostic](upstream-rollout-cache-off-validation.json)
record settings, binary/data hashes and CLI limitations. Standalone CLI
rollout skips its initial cube decision; separate fresh official two-ply
hints confirm no double for both continuations. Official output is rounded
to six decimals, and the independent builds use different CPU architectures.

This establishes a causal policy bug and its correction. It does not establish
that the bug explains the aggregate 4–4/XG disagreement or that the 0.005 XG
tolerance has been reached. That requires a new independently planned study
using the corrected runtime; the frozen v2 executable, inputs and results
remain unchanged.

## Reproduction

The native validator needs the frozen v2 runtime with its source, object files,
build record and data. Supplying the official binary/data also checks all
46 independently generated GNUbg candidate scores. The replay consumes the
recorded official cache-disabled diagnostic, which can be regenerated first.

```sh
GNUBG_BIN=/path/to/gnubg GNUBG_DATA=/path/to/data BG_AUDIT_CACHE_OFF=1 \
  node backgammon/scripts/audit-upstream-rollout.mjs \
  backgammon/docs/upstream-rollout-cache-off-validation.json
BG_ROLLOUT_NATIVE=/tmp/bg-cube-study-v2 \
GNUBG_BIN=/path/to/gnubg GNUBG_DATA=/path/to/data \
  python3 backgammon/scripts/validate-filtered-rollout.py
node --test backgammon/tests/filtered-rollout.test.mjs backgammon/tests/bg9-release.test.mjs
```

The ordinary test validates report provenance, legal boards, candidate
comparisons, the before/after selection and the excluded replay. The native
validator executes the actual faulty and corrected checker searches. The
release test verifies that the shipped source incorporates exactly this
`eval.c` patch.
