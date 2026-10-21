# Video Poker

Static app at `/poker/video-poker/`. Uses the shared shell, tokens and playing-card renderer. No build step, server, API key, or external runtime dependency. All calculations run locally in a cancellable worker.

## Scope and rules

27 menu choices from 21 single-draw scoring/paytable presets: Jacks or Better (9/6), Tens or Better (6/5), Bonus (8/5), Bonus Deluxe (9/6), Double Bonus (10/7), Double Double Bonus (9/6), Triple Double Bonus (9/7), Triple Bonus Plus (9/5), Super Double Bonus (9/5), White Hot Aces (9/5), All American (40/8/8/8), full-pay Deuces Wild, Not So Ugly Ducks, Bonus Deuces Wild (10/4/4), Joker Poker (kings or better, 7/5), 2–7 Low, Badeucey, and Cribbage with 4, 5, 6 or 7 cards.

The scope is conventional five-card poker and four- through seven-card cribbage, all with one draw. Multi-stage games (Ultimate X, Super Times Pay, etc.), side bets and progressive jackpots are not modeled. Max-coin royal payouts are normalized to one practice credit; there is no variable coin-count penalty. The joker game has 53 cards; all others have 52. No discarded card can return. The Custom variants group appears first in the variant dropdown with twelve entries: 2–7 Low, Badeucey, and Cribbage with 4, 5, 6 or 7 cards, each with and without optional 2× on draw. Each stake mode keeps independent payouts and qualification settings. Existing saved settings migrate to their previous stake mode; the other mode starts with the best suggested table below 100% RTP. Original resets only the selected mode. Best RTP table applies the highest-return suggestion at or below 100% for that mode, including its qualification rules. New custom configurations use that suggestion automatically; saved edits are preserved. Integer category payouts and Badeucey qualification rules persist separately for each menu choice in local storage; session PnL and in-progress hands reset on reload.

2–7 payouts are interpreted as **total returns including the stake**, following ordinary video-poker convention. J-high therefore pushes. Aces are high; pairs, straights and flushes lose. A-2-3-4-5 is ace-high, not a straight. The wheel is 7-5-4-3-2. Awards within a half never stack.

The user's confirmed Badeucey convention is **qualifying push + low points + badugi points**. By default both qualifiers are mandatory: a five-card high-card hand (five different ranks, no straight/flush) AND a four-card badugi. Aces are high in both halves; 5-4-3-2 is the best badugi. The four-card badugi is chosen from any four of the five cards. Both games use one draw.

The Badeucey paytable and editor separate the qualifying return, five-card low points, and four-card badugi points. T-high low and T-high badugi awards start at 0 (disabled), preserving the original return; both accept integer awards. The fixed qualifying return is 1.

Badeucey qualification can instead require 3 or 2 distinct ranks in different suits, or no badugi at all. The five-card requirement can be high card only, any unpaired hand (including straights/flushes), or any hand (including pairs). Optional rank caps apply to all five cards and to a qualifying badugi subset independently; aces remain high. A badugi cap is satisfied if a subset of the required size meets the cap, even if a larger badugi has a higher card. No badugi requirement ignores that cap.

Qualification and point awards are separate: five-card low points always require a genuine 2–7 high-card hand, and badugi points always require four cards. A three-card badugi may therefore qualify for the push and low points, but earns no badugi points. Apply changes before playing or solving. Applying a recommendation restores its original qualification rules as well as its payouts.

## Session PnL

The base bet is always 1. PnL starts at zero and stays unchanged during a hand. Settlement adds the payout minus the full stake: 1 normally or 2 when choosing 2×. Negative PnL never blocks play or triggers a refill. The game selector stays available during a hand or calculation. Switching games cancels the unfinished hand and its solver without settling it, and preserves PnL, hands played and completed history. Applying settings also preserves PnL and hands played; a study hand changes neither. Reloading starts a new session. The meters show PnL and hands played, with no base-bet or Last return display. Hand history lists every completed hand newest first, with its game, 2× marker when used, and net win/loss or push. The summary counts wins, losses and pushes. History persists across game and settings changes for the session and resets on reload, together with PnL.

A zero payout displays **You lose**; returning exactly the stake displays **Push**; a win displays **Won +N**, where N is the payout minus the entire stake (including 2× when used).

## Optional double on draw

The payout lab offers a single-stake or optional double-on-draw variant for each custom game. The player sees the full initial hand, chooses holds, and may pay one additional credit immediately before drawing to double the entire final payout. At least one card must be replaced: standing pat cannot double. Badeucey’s qualifying push returns both credits when doubled, and every awarded point doubles too. The double button is disabled when all cards are held. Practice play has no bankroll limit, so every legal stake remains available in play and analysis.

For five-card games, the solver compares **63 actions**: 32 single-stake holds and 31 doubled holds. If a hold’s one-credit expected gross return is `r`, its single-stake net EV is `r − 1` and its doubled net EV is `2r − 2`. The player maximizes net profit per initial deal, including when comparing a doubled draw with standing pat. A positive-EV double is not necessarily best if another hold pays more. A double improves on the same single-stake draw only when `r > 1`.

For double-on-draw analysis:

- `netEV` is expected net profit per initial deal, after all stakes.
- `doubleFrequency` counts deals where the best doubled draw strictly beats every single-stake action (tolerance `1e-12`).
- `doubleTieFrequency` separately counts deals where doubling and single stake are equally optimal; the chosen policy uses single stake on ties, then holds more cards.
- `averageStake = 1 + doubleFrequency`.
- `expectedReturn = netEV + averageStake`.
- `rtp = expectedReturn / averageStake`, so it uses **all money wagered**, not just the initial stake. Maximizing net EV and maximizing an RTP ratio are different objectives; this solver optimizes net EV.

Per-hand rows retain `ev = netEV + 1` for compatibility and expose `netEV`, `grossEV`, `stake`, and `doubled` explicitly. The double-on-draw UI displays net EV. Ordinary games keep their original gross-return display. Post-draw review identifies both the committed hold and its stake; doubling is never inferred from the final cards.

## Cribbage

The Cribbage dropdown section has sixteen entries: hand sizes 4, 5, 6 and 7, Capped loss or Points − fee settlement, and base stake or optional 2× on draw. Each has an independently saved integer fee and scoring settings. All final cards score; there is no starter, crib or pegging.

The default scoring extends the cribbage row in `ofc/fantasyland-core.js`: each fifteen is 2; each pair is 2; each copy of the longest run of at least three cards scores its full length; a flush of at least four cards scores its length; each jack sharing its suit with another card scores 1. Aces are low and worth 1 toward fifteens; faces count 10. Six- and seven-card runs/flushes receive their full length by default. The editor also provides the literal OFC cap of 5 (its existing run-window algorithm), and an alternative settlement convention.

Default **total return = max(0, cribbage points − fee)**, including the stake. A score equal to the fee loses the bet; fee + 1 pushes; fee + 2 wins +1. At 2×, both the return and stake double. The fee is subtracted once from the total score before applying the stake multiplier. The separate **Points − fee** games use **net PnL = points − fee** and permit negative results beyond the initial unit; the engine represents its total return as `1 + points − fee`, and settlement then subtracts the stake normally.

Fee presets include the selected fee and its adjacent integers. Each mode defaults to the closest non-positive net EV, using the point estimate for sampled results. The one-point fee increments are coarse: preserving the specified scoring does not allow all sixteen games to approach zero EV closely. The lab exposes the adjacent positive-EV option as well as more conservative options. Sampled EVs are explicitly marked as estimates; a sampled default is not a certified negative-EV game.

Capped-loss default fees and net EV per initial hand (six/seven-card figures are estimates):

| Cards | Fee | Net EV | Fee with 2× | Net EV with 2× | Optimal 2× frequency |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4 | 5 | -0.170328 | 5 | -0.053323 | 14.88% |
| 5 | 10 | -0.078150 | 11 | -0.204481 | 15.55% |
| 6 | 18 | ≈ -0.110085 | 19 | ≈ -0.122593 | ≈ 16.86% |
| 7 | 31 | ≈ -0.098731 | 32 | ≈ -0.036815 | ≈ 16.55% |

Points-minus-fee defaults:

| Cards | Fee | Net EV | Fee with 2× | Net EV with 2× | Optimal 2× frequency |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4 | 5 | -0.576731 | 5 | -0.334995 | 19.98% |
| 5 | 9 | -0.817686 | 9 | -0.387098 | 27.20% |
| 6 | 14 | ≈ -0.198664 | 15 | ≈ -0.576039 | ≈ 26.10% |
| 7 | 23 | ≈ -0.621636 | 24 | ≈ -0.610485 | ≈ 27.10% |

### Cribbage analysis

Every individual hold and stake choice has an **exact conditional draw EV**, including the payout floor and discarded-card exclusion. There are 16/32/64/128 holds for 4/5/6/7 cards, or 31/63/127/255 decisions with 2× enabled. The game summary, payout lab, fee options and decision review all show signed net PnL EV per initial hand for cribbage. This includes the fee and the entire stake, including 2× when chosen. Sampled game EVs carry an ≈ marker and sample count; exact hold EVs do not. Other poker variants continue showing game RTP. Stored analysis retains RTP and its ratio-estimator uncertainty for reproducibility; these percentage intervals are not displayed as net-EV intervals.

`cribbage-solver.js` enumerates rank multiplicities, then analytically counts suit assignments. Inclusion–exclusion on isolated-jack events gives the suited-jack distribution. Suit-count generating functions give the flush corrections; with at most seven cards, two four-card flushes cannot coexist. The resulting joint distribution preserves nonlinear interactions with `max(0, points − fee)`. The browser uses this compact solver for all cribbage hand reviews and never allocates a 133-million-hand index. Computation stays in the worker, leaving hold taps responsive; six/seven-card hands wrap on narrow screens.

Whole-game RTP for 4/5 cards is **exhaustive**, using the generalized subset-sum solver over 270,725/2,598,960 initial hands. Whole-game RTP for 6/7 cards is **estimated** from 8,192/4,096 deterministic uniformly shuffled initial deals, respectively. Every sampled deal uses exact EVs for all decisions and selects its optimal net-profit strategy. These are sampled starting hands, not simulated final outcomes or approximate per-hand strategies. Approximate 95% RTP intervals use the ratio-estimator standard error for net profit divided by stake, preserving their covariance. The doubling frequency is an estimate over the same deals; exact ties prefer base stake. Edited 6/7-card rules can be estimated in the browser from 128 deals, with cancel and progress controls.

`cribbage-analysis.json` records fee options, full-game estimates/exact returns, original configurations, sampling seeds and source hashes. Reproduce it with:

```sh
node poker/video-poker/scripts/analyze-cribbage.cjs
```

The offline analysis requires a C++17 compiler for its fast equivalent rank/suit distribution solver; browser play requires no compiler or native runtime. Tests compare it against the JavaScript solver, compare four/five-card scoring to OFC, independently enumerate direct draws, and compare the subset solver against the rank/suit solver. The original five-card poker analysis remains separate:

```sh
node poker/video-poker/scripts/analyze.cjs
```

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

2–7 Low and Badeucey each have three base-stake and three optional 2× tables. The defaults are Wheel at twelve (2–7), Even steps (2–7 with 2×), Three-point steps (Badeucey), and Two- and four-point steps (Badeucey with 2×), chosen for the highest RTP below 100% within each mode. These favor tidy integers, repeated steps and gradual increases over matching a precise 99% target. The largest suggested award is 16 and no adjacent tier increases by more than 5. Every table is exhaustively re-optimized; these returns do not imply equal volatility. Applying an option restores its payouts, qualifiers and stake rule.

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

The same `engine.js` evaluator and `solver.js` are used in play, browser worker and offline analysis. The worker never blocks the UI. Its payout index is reused across hands and study queries with unchanged settings, so only the first solve builds the full index. Explicit cancellation, game changes and payout/rule edits terminate the worker; starting a new hand also stops an active full-game solve. Holds update existing card nodes in place, preserve focus and have no transition delay. Touch/pen holds change on pointer-down; the following click is suppressed, and scrolling, pointer cancellation or a second touch restores the prior hold. Mouse, keyboard and assistive clicks keep native activation. Devices with a touch pointer skip card-deal animations. Edits to payouts, qualifiers or the doubling rule invalidate old results, and editing rules or payouts during a live wager is disabled. The game selector stays enabled and cancels an unfinished hand when switching. A manually entered study hand cannot pay credits: Deal always starts a new random hand.

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

### Points-minus-fee games and payout frequencies

Points − fee games can lose the entire fee, or twice the fee at 2×. Their integer fees are optimized separately, with three adjacent options for each game in `cribbage-net-analysis.json`. Four/five-card results exhaust every starting hand. Six/seven-card results use the same seeded sample sizes as capped-loss games. Legacy saved net-settlement edits migrate into the new entries; all sixteen entries retain independent settings.

Reproduce net fee choices with `node poker/video-poker/scripts/analyze-cribbage-net.cjs`. The native analyzer computes expected rank points, flushes and suited jacks independently and is checked against the exact JS draw solver. Linear settlement makes the fee a constant for a given stake: each deal only needs its best expected score with any hold and with a non-pat hold to optimize every integer fee.

The payout lab shows optimal-play win/push/loss rates, PnL standard deviation, and a bar/table for each net payout with its probability and reciprocal frequency. Charts measure completed-hand net PnL, after the entire stake, and aggregate identical net amounts across stakes and hand categories. Badeucey awards are combined before grouping. These are policy frequencies, not the distribution of random final hands or the player's session history. On EV ties the policy prefers 1×, then more held cards, then the first mask; other optimal tie choices can produce different payout frequencies at the same EV.

`outcomes.js` counts four/five-card distributions exactly: for each initial hand's optimal hold it adds inclusion–exclusion coefficients to final-hand subsets, then weights each final hand once. This avoids enumerating every initial-hand/draw pair. Six/seven-card charts average exact conditional score distributions over reproducibly sampled initial hands; the whole-game chart is estimated, including rare payout frequencies. Counts shown as “1 in” are long-run frequencies, not guarantees or waiting times. Edited settings clear stale charts; Solve full game / Estimate game recalculates them in the worker.

Reproduce the 35 default charts with `node poker/video-poker/scripts/analyze-outcomes.cjs`. `outcome-analysis.json` records configurations, seeds, sample sizes and source hashes. Histogram means are checked against independently computed game EVs. Tests also compare distributions to direct draw enumeration on small decks, validate conditional cribbage score histograms, and compare native linear score EVs to the JS solver for every hold.

### Game browser and layout

The game dropdown is replaced by a searchable game browser with Custom variants, Cribbage, Classic, Bonus and Wild cards filters. It opens as a dialog on desktop and a bottom sheet on narrow screens. Arrow keys browse results, Enter selects, and Escape closes; native dialog behavior contains focus and returns it to the trigger. Selecting the active game preserves the hand. Selecting another game uses the existing cancellation and PnL behavior. The hidden select remains the internal selection state for settings and recommendations; browser tests choose games through the visible picker.

The page keeps the shared color tokens and playing-card component, with lighter panel chrome, segmented workspace navigation, tabular metrics and a system font stack that avoids font-loading delay. Card holds remain immediate on touch devices. Selector motion respects reduced-motion preferences. `tests/game-picker.cjs` covers search, all 35 choices, keyboard/focus behavior, mobile sizing and active-hand preservation.
