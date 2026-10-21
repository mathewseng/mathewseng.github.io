# Video Poker

Static app at `/poker/video-poker/`. Uses the shared shell, tokens and playing-card renderer. No build step, server, API key, or external runtime dependency. All calculations run locally in a cancellable worker.

## Scope and rules

19 menu choices from 17 single-draw paytable presets: Jacks or Better (9/6), Tens or Better (6/5), Bonus (8/5), Bonus Deluxe (9/6), Double Bonus (10/7), Double Double Bonus (9/6), Triple Double Bonus (9/7), Triple Bonus Plus (9/5), Super Double Bonus (9/5), White Hot Aces (9/5), All American (40/8/8/8), full-pay Deuces Wild, Not So Ugly Ducks, Bonus Deuces Wild (10/4/4), Joker Poker (kings or better, 7/5), 2–7 Low, and Badeucey.

The scope is conventional five-card, single-draw games. Multi-stage games (Ultimate X, Super Times Pay, etc.), side bets and progressive jackpots are not modeled. Max-coin royal payouts are normalized to one practice credit; there is no variable coin-count penalty. The joker game has 53 cards; all others have 52. No discarded card can return. The Custom variants group appears first in the variant dropdown with four entries: 2–7 Low, 2–7 Low · 2× on draw, Badeucey, and Badeucey · 2× on draw. Each stake mode keeps independent payouts and qualification settings. Existing saved settings migrate to their previous stake mode; the other mode starts with the best suggested table below 100% RTP. Original resets only the selected mode. Best RTP table applies the highest-return suggestion at or below 100% for that mode, including its qualification rules. New custom configurations use that suggestion automatically; saved edits are preserved. Integer category payouts and Badeucey qualification rules persist separately for each menu choice in local storage; session PnL and in-progress hands reset on reload.

2–7 payouts are interpreted as **total returns including the stake**, following ordinary video-poker convention. J-high therefore pushes. Aces are high; pairs, straights and flushes lose. A-2-3-4-5 is ace-high, not a straight. The wheel is 7-5-4-3-2. Awards within a half never stack.

The user's confirmed Badeucey convention is **qualifying push + low points + badugi points**. By default both qualifiers are mandatory: a five-card high-card hand (five different ranks, no straight/flush) AND a four-card badugi. Aces are high in both halves; 5-4-3-2 is the best badugi. The four-card badugi is chosen from any four of the five cards. Both games use one draw.

The Badeucey paytable and editor separate the qualifying return, five-card low points, and four-card badugi points. T-high low and T-high badugi awards start at 0 (disabled), preserving the original return; both accept integer awards. The fixed qualifying return is 1.

Badeucey qualification can instead require 3 or 2 distinct ranks in different suits, or no badugi at all. The five-card requirement can be high card only, any unpaired hand (including straights/flushes), or any hand (including pairs). Optional rank caps apply to all five cards and to a qualifying badugi subset independently; aces remain high. A badugi cap is satisfied if a subset of the required size meets the cap, even if a larger badugi has a higher card. No badugi requirement ignores that cap.

Qualification and point awards are separate: five-card low points always require a genuine 2–7 high-card hand, and badugi points always require four cards. A three-card badugi may therefore qualify for the push and low points, but earns no badugi points. Apply changes before playing or solving. Applying a recommendation restores its original qualification rules as well as its payouts.

## Session PnL

The base bet is always 1. PnL starts at zero and stays unchanged during a hand. Settlement adds the payout minus the full stake: 1 normally or 2 when choosing 2×. Negative PnL never blocks play or triggers a refill. Changing games or applying settings preserves PnL and hands played; a study hand changes neither. Reloading starts a new session. The meters show PnL and hands played, with no base-bet or Last return display. Hand history lists every completed hand newest first, with its game, 2× marker when used, and net win/loss or push. The summary counts wins, losses and pushes. History persists across game and settings changes for the session and resets on reload, together with PnL.

A zero payout displays **You lose**; returning exactly the stake displays **Push**; a win displays **Won +N**, where N is the payout minus the entire stake (including 2× when used).

## Optional double on draw

The payout lab offers a single-stake or optional double-on-draw variant for each custom game. The player sees five cards, chooses holds, and may pay one additional credit immediately before drawing to double the entire final payout. At least one card must be replaced: standing pat cannot double. Badeucey’s qualifying push returns both credits when doubled, and every awarded point doubles too. The double button is disabled when all cards are held. Practice play has no bankroll limit, so every legal stake remains available in play and analysis.

The solver compares **63 actions**: 32 single-stake holds and 31 doubled holds. If a hold’s one-credit expected gross return is `r`, its single-stake net EV is `r − 1` and its doubled net EV is `2r − 2`. The player maximizes net profit per initial deal, including when comparing a doubled draw with standing pat. A positive-EV double is not necessarily best if another hold pays more. A double improves on the same single-stake draw only when `r > 1`.

For double-on-draw analysis:

- `netEV` is expected net profit per initial deal, after all stakes.
- `doubleFrequency` counts deals where the best doubled draw strictly beats every single-stake action (tolerance `1e-12`).
- `doubleTieFrequency` separately counts deals where doubling and single stake are equally optimal; the chosen policy uses single stake on ties, then holds more cards.
- `averageStake = 1 + doubleFrequency`.
- `expectedReturn = netEV + averageStake`.
- `rtp = expectedReturn / averageStake`, so it uses **all money wagered**, not just the initial stake. Maximizing net EV and maximizing an RTP ratio are different objectives; this solver optimizes net EV.

Per-hand rows retain `ev = netEV + 1` for compatibility and expose `netEV`, `grossEV`, `stake`, and `doubled` explicitly. The double-on-draw UI displays net EV. Ordinary games keep their original gross-return display. Post-draw review identifies both the committed hold and its stake; doubling is never inferred from the final cards.

## Exact results

All numbers below use optimal strategy recalculated for the corresponding paytable, every initial deal and every possible legal replacement. They are exhaustive numerical calculations, not simulations. RTP includes returned stake. Without doubling, net EV per deal is RTP − 1; with optional 2×, it is (RTP − 1) × average stake.

| Game | Original RTP | Original net EV |
| --- | ---: | ---: |
| 2–7 Low | 82.2244659992% | −0.1777553400 |
| Badeucey | 62.8247933400% | −0.3717520666 |

The original Badeucey qualification requirements are restrictive: merely doubling all point awards gives 91.7011823013% RTP. The suggested options below redistribute awards across adjacent tiers with regular integer steps.

If the original 2–7 numbers were interpreted as net winnings plus the returned stake, that alternative would return 121.3907945363%. It is recorded in `analysis.json`; the shipped default uses total returns.

### Qualification sensitivity

With the original point awards (including both T tiers at 0), perfect-play returns change substantially:

| Five-card requirement | Minimum badugi | RTP |
| --- | ---: | ---: |
| High card | 4 | 62.8247933400% |
| High card | 3 | 105.9993923718% |
| Any hand | 4 | 84.3210858433% |
| Any hand | 3 | 146.8655491537% |

These results are recorded in `analysis.json`. Each recommendation applies only to its own qualification and stake rules. Re-solve after any rule or payout change; the editor clears stale results when either changes.

## Payout options

Each custom game has three base-stake and three optional 2× tables. The defaults are Wheel at twelve (2–7), Even steps (2–7 with 2×), Three-point steps (Badeucey), and Two- and four-point steps (Badeucey with 2×), chosen for the highest RTP below 100% within each mode. These favor tidy integers, repeated steps and gradual increases over matching a precise 99% target. The largest suggested award is 16 and no adjacent tier increases by more than 5. Every table is exhaustively re-optimized; these returns do not imply equal volatility. Applying an option restores its payouts, qualifiers and stake rule.

### 2–7 Low options

Payout order: **J / T / 9 / 8 / 7 / wheel**, including the stake.

| Stake rule | Option | Payouts | RTP | Net EV / deal | Optimal 2× frequency |
| --- | --- | --- | ---: | ---: | ---: |
| Base stake | Even steps | 1 / 2 / 4 / 6 / 8 / 10 | 99.322157% | -0.006778 | — |
| Base stake | Wheel at twelve | 1 / 2 / 4 / 6 / 8 / 12 | 99.907850% | -0.000922 | — |
| Base stake | Five-point finish | 1 / 2 / 4 / 5 / 10 / 15 | 98.784965% | -0.012150 | — |
| Optional 2× | Even steps | 1 / 2 / 4 / 4 / 6 / 8 | 99.668466% | -0.003881 | 17.0639% |
| Optional 2× | Consecutive finish | 1 / 2 / 3 / 6 / 7 / 8 | 99.385711% | -0.007197 | 17.1646% |
| Optional 2× | Ten-point ceiling | 1 / 2 / 3 / 5 / 10 / 10 | 98.868975% | -0.013435 | 18.7843% |

### Badeucey options

Every option requires a five-card high-card hand and the listed minimum badugi size, with no rank caps. Qualifying pushes, then adds the best low and badugi awards. Low order: **T / 9 / 8 / 7 / wheel**. Badugi order: **T / 9 / 8 / 7 / 6 / 5**. Three-card badugis can qualify but never earn badugi points.

| Stake rule | Option | Min badugi | Low points | Badugi points | RTP | Net EV / deal | Optimal 2× frequency |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: |
| Base stake | Three-point steps | 4 | 0 / 3 / 6 / 9 / 12 | 0 / 3 / 6 / 9 / 12 / 15 | 99.932627% | -0.000674 | — |
| Base stake | Paying tens | 4 | 1 / 2 / 3 / 4 / 5 | 1 / 3 / 6 / 9 / 12 / 12 | 99.586523% | -0.004135 | — |
| Base stake | One-point steps | 3 | 0 / 1 / 2 / 3 / 4 | 0 / 1 / 2 / 3 / 4 / 5 | 99.639472% | -0.003605 | — |
| Optional 2× | Two- and four-point steps | 4 | 0 / 2 / 4 / 6 / 8 | 0 / 2 / 4 / 8 / 12 / 16 | 99.633450% | -0.004485 | 22.3613% |
| Optional 2× | Paying tens | 4 | 1 / 2 / 4 / 6 / 10 | 1 / 2 / 4 / 6 / 8 / 10 | 98.431399% | -0.019376 | 23.5216% |
| Optional 2× | Three-card qualifier | 3 | 0 / 1 / 1 / 2 / 4 | 0 / 1 / 1 / 2 / 4 / 6 | 99.183532% | -0.009580 | 17.3400% |

The original tables with optional 2× return 89.555692% and 71.274365% for 2–7 and Badeucey respectively. Optimal doubling frequency varies with payouts and qualifiers because each changes which draws are profitable. Each table reports its exact frequency, with equal-EV stake choices counted separately as ties.

## Solver derivation

Let `P(F)` be the total payout of a final five-card hand `F`. For every subset `S` of up to five cards, construct

```
T(S) = sum of P(F) over all five-card F containing S.
```

For an initial hand `D` and held subset `H`, inclusion–exclusion eliminates every initial discard:

```
U(H,D) = sum over X ⊆ (D \ H) of (−1)^|X| T(H ∪ X)
EV(H | D) = U(H,D) / choose(N − 5, 5 − |H|)
RTP = average over all D of max over H ⊆ D of EV(H | D)
```

A five-bit superset Möbius transform computes the 32 numerators in 80 subtractions. Subsets use colex combinatorial indexing (`sum choose(card[i], i+1)`) with separate offsets by size. This handles all 2,598,960 starting hands (2,869,685 with a joker), without suit-isomorphism assumptions. Float64 arrays hold the subset sums; compensated summation accumulates full-game EV. Tie handling favors holding more cards within 1e-12; this has no material effect on reported RTP. Per-hand ranking shows all 32 decisions and EV loss relative to the maximum. After each draw, a decision review automatically shows the chosen hold’s EV, the best hold’s EV and the EV given up, calculated from the original deal rather than the final cards. The top five alternatives are shown with the chosen hold pinned when it falls outside them; all 32 remain available. A pre-draw solution is reused when available, and starting a new hand discards stale review replies while retaining the worker’s hand index.

The same `engine.js` evaluator and `solver.js` are used in play, browser worker and offline analysis. The worker never blocks the UI. Its payout index is reused across hands and study queries with unchanged settings, so only the first solve builds the full index. Explicit cancellation, game changes and payout/rule edits terminate the worker; starting a new hand also stops an active full-game solve. Holds update existing card nodes in place, preserve focus and have no transition delay. Touch/pen holds change on pointer-down; the following click is suppressed, and scrolling, pointer cancellation or a second touch restores the prior hold. Mouse, keyboard and assistive clicks keep native activation. Devices with a touch pointer skip card-deal animations. Edits to payouts, qualifiers or the doubling rule invalidate old results, and changing games, rules or payouts during a live wager is disabled. A manually entered study hand cannot pay credits: Deal always starts a new random hand.

## Reproduce and test

```sh
node poker/video-poker/scripts/analyze.cjs
node --test poker/video-poker/tests/*.test.cjs
sh scripts/assemble-site.sh _site
node poker/video-poker/tests/browser.cjs _site
SHELL_PAGES=/poker/video-poker/,/poker/,/ node scripts/shell-browser.cjs
node scripts/run-tests.mjs
```

`analysis.json` is deterministic and records engine/solver SHA-256 hashes, all preset payouts and returns, candidate tables, and sensitivity experiments. `payout-options.json` defines all twelve suggested integer options; the analysis generator recalculates their exact strategies rather than scaling an old return. The generator takes several minutes depending on hardware. For payout-option edits only, `node poker/video-poker/scripts/analyze.cjs --recommendations-only` recalculates every option while reusing originals and sensitivity experiments only after verifying that the engine and solver hashes are unchanged. Browser full-game calculations usually take a few seconds on a desktop and longer on mobile. Browser smoke screenshots are written under `/tmp/video-poker-*.png`.

Tests cover rank categories, wild cards, kicker boundaries, the lowball wheel, Badeucey qualification combinations, subset rank limits, T-high awards and the additive push, shuffled-deck invariants, direct draw enumeration independent of the subset algorithm, constant-pay normalization, published whole-game return benchmarks, and report reproducibility. Browser checks exercise every variant, exact worker replies, all holds, study/play separation, payout/rule edits, recommendation rule restoration, saved-paytable migration, double settlement and eligibility, net-EV decision review, option application, persistence, cancellation and responsive views.

## References

Paytables and independent return benchmarks: [Wizard of Odds summary](https://wizardofodds.com/games/video-poker/summary/), [All American](https://wizardofodds.com/games/video-poker/tables/all-american/), [full-pay Deuces Wild](https://wizardofodds.com/games/video-poker/tables/deuces-wild/), and [Joker Poker](https://wizardofodds.com/games/video-poker/tables/joker-poker-kings-or-better/). Custom-game results are original calculations in this repository.
