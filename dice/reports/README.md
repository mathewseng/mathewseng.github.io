# Fair Dice Payout Explorer

Published at `/dice/reports/`; `/dice/reports` resolves to the same directory on GitHub Pages. Assets and the module worker use relative paths. No runtime packages, backend, or build step.

- `outcomes.mjs`: the three game definitions, hand classification, and exact ordered-roll counts.
- `engine.mjs`: exact BigInt EV/checker math, bounded integer enumeration, filters, style metrics, ranking, and displayed-row sorting.
- `game.mjs`: unbiased dice sampling, grouped roll scoring, exact session PnL, and settle-once roll lifecycle.
- `dice-geometry.mjs`: a closed rounded-cube mesh, standard opposing faces, tabletop orientation, and camera transforms.
- `dice-view.js`: lit Canvas projections of the 3D mesh, contact shadows, roll paths, and cancelable simultaneous or sequential reveals.
- `play.js`: animated play view, chosen-face selection, payout effects, paytable, and session controls.
- `worker.js`: isolated search; replacing a search terminates its worker so stale results cannot overwrite current filters.
- `app.js`, `index.html`, `styles.css`: mode and dice selection, report, reference examples, inspector, sortable shortlist, play view, and custom checker.
- `tests/engine.test.mjs` and `tests/game.test.mjs`: exact identities, all ordered rolls versus multinomial counts, category classification, large integers, independent brute-force searches, budgets, sorting, unbiased random sampling, exact roll scoring, and session state.
- `tests/browser.cjs`: assembled-site checks for the route, actual worker, all modes/dice counts, bidirectional headers, keyboard/mobile behavior, and checker repair.

## Hand modes

- **Chosen face:** choose a number before the roll; categories are 0 through N matches, with weights C(N,k)5^(N−k).
- **Single sets:** no chosen number. Score the largest matching group: singles, pair, trips, quads, quints, sexts. For example, two pairs score as Pair, and a full house scores as Trips.
- **Full sets:** score the complete multiplicity pattern. Remaining dice are distinct singles. With four dice the order is Singles, Pair, Trips, 2 pair, Quads (trips have 120 ordered outcomes and two pair have 90). With five dice the order is Singles, Pair, 2 pair, Trips, Boat, Quads, Quints.
- **Six-dice Full sets:** Singles, Pair, 2 pair, **Trips / boat**, **3 pair / quads**, Quads + pair, 2 trips, Quints, Sexts. The grouped hands share one payout. Trips and boat each have 7,200 ordered outcomes, so their combined weight is 14,400. Three pair and ordinary quads each have 1,800, so their combined weight is 3,600. Final weights in payout order are `[720, 10800, 16200, 14400, 3600, 450, 300, 180, 6]`. A boat is 3+2+1; ordinary quads are 4+1+1. Singles stay the base rank regardless of rarity.

Raw pattern classification stays separate from payout grouping. Each outcome exposes its constituent `members`; the play scorer and probability counts use the same mapping.

Only categories possible for the selected N appear. The engine visits the face-frequency vectors summing to N and adds N! / ∏ count[face]! ordered rolls to the corresponding category. This partitions all 6^N rolls without double-counting. Tests independently enumerate every ordered roll up to six dice and verify the published counts.

## Search and precision

Generated starting losses are restricted, in preference order, to **−1, −2, −3, −5, −4, −10, −6, −8, −12, −15, −20, −25, −30, −40, −50, −60, −75, −100**. The initial range narrows that list; bounds containing no allowed loss produce an empty complete search. Other payout columns still permit any integer within bounds, including zero. Custom fairness math remains unrestricted; the checker identifies an unlisted starting loss as outside the search filters.

Every payout is bounded between `minP0` and `maxPayout`, with the initial payout additionally limited by `maxP0`. The initial category is zero matches for Chosen face and Singles for set modes. Strict order requires an increase at every successive rank. Zero payouts are allowed by default; negative intermediate payouts are allowed. Turning off strict order permits decreases and ties.

Scaled copies of whole schedules are always excluded before counting and ranking: the GCD of all absolute payouts must not exceed 1. Thus `[-4,2,8,14,20]` is excluded as twice `[-2,1,4,7,10]`, even if the smaller schedule is outside the initial-payout bounds. Zeros do not affect the divisor; the all-zero schedule is exactly fair but excluded by the starting-loss list. Individual rewards may be multiples of other rewards. The checker reports a scaled copy as outside the filters without changing its exact EV.

For L categories, enumerate the first L−1 payouts and solve p[L−1] = −Σ w[k]p[k] / w[L−1]. The final weight is 1 for Chosen face and 6 for set modes. All set-mode weights are divisible by 6, so reducing by their GCD gives a unit final weight. Weighted lower/upper bounds prune impossible branches. With two categories the final payout is solved immediately.

Search values are safe integers: N ≤ 6, initial bounds within ±10,000, maximum payout ≤ 1,000,000, and every raw partial weighted sum is at most 46,656,000,000 in magnitude. The checker accepts integer strings up to 100 digits and uses BigInt for EV, repair, scale detection, and decimal display.

## Ranking, coverage, and sorting

Every worker stops at 600,000 candidate nodes or approximately 2.5 seconds. Initial losses are interleaved and each integer interval uses coprime traversal for coverage. This is deterministic exploration, not a uniform sample.

**Complete search** means exhaustive within the configured bounds and allowed starting-loss list. **Partial search** means the node/time cap was reached, so ranking covers only explored candidates. Always trust the run's status; more categories, wider bounds, and slower devices can trigger the cap. Even a complete search displays only the requested maximum results, capped at 200.

An unbounded search is not possible in general. Removing scaled copies still leaves infinitely many primitive schedules when there are enough categories. For example, unrestricted two-dice Chosen face schedules `[-1,-m,25+10m]` are distinct primitive fair schedules for every integer m ≥ 1. The actual search is finite because it also bounds every payout and restricts the starting loss. The two-category set game is an exception: with a negative initial payout its only primitive nonzero fair schedule is `[-1,5]`.

Recommended uses the on-page transparent style score: 50% simplicity, 30% starting-loss preference, 10% smoothness, 5% moderate maximum payout, 2.5% progressive jumps, 2.5% increasing payouts. Starting-loss preference is `300/(r+3)` for zero-based position r in the allowed list: −1 scores 100 and contributes 30 points, −2 scores 75 and contributes 22.5, −3 scores 60 and contributes 18. An unlisted initial payout scores zero and is excluded from generated results. It groups curves by initial payout, floor(log2(maximum)), and intermediate payouts normalized into eighths; each group keeps its best score. Other ranking methods do not group. This approximate shape grouping is distinct from exact scaled-copy removal. Featured schedules are unranked references for Chosen face only, with no score bonus.

Keep the best 800 representatives whenever the candidate pool exceeds 1,600. Since at most 200 results are shown, discarded rows cannot affect that ranking among explored candidates.

**Rank by** chooses the shortlist across the explored candidates. Every table header toggles ascending/descending order of that displayed shortlist only; it neither reruns the search nor changes its membership. Rank preserves the original shortlist position. Returning to Rank ascending restores the original order.

**Payout standard deviation** is population σ = √Σ (w[j]/6^N)(p[j]−EV)², measured in net units per roll. Variance is σ² in units². At exactly zero EV this reduces to √(Σ w[j]p[j]² / 6^N). It uses actual outcome probabilities, including combined groups; it is not an unweighted standard deviation of the payout list or of its jumps. Floating-point volatility is for comparison/display only and never determines fairness. The table and inspector show σ, the inspector also shows variance, and Rank by can select the lowest/highest volatility across explored candidates.

**Simplicity** ignores payout signs. Zero scores 100. The preferred absolute amounts `[1,2,3,5,4,10,6,8,12,15,20,25,30,40,50,60,75,100]` score 98 down to 64 in steps of 2, preserving the requested ordering. Other amounts remain eligible in later columns and score `70/(1 + total factor cost)`. Prime-factor costs: 2 = 0.05, 3 = 0.075, 5 = 0.09, prime q > 5 = 0.09 + log₂(q/5). Repeated factors count again; add 0.025 per factor after the first. Thus zero remains best, listed amounts are favored, and nonlisted composites still reflect their prime factors and size.

Base schedule simplicity is 75% mean amount score (each payout category counts equally) plus 25% shared-factor score. For each prime, count nonzero payouts divisible by it; the shared score is 100 × largest count / number of nonzero payouts, requiring at least two matches. Ties use the smallest prime. Zero earns the best amount score but does not count as sharing every factor; ±1 stays in the denominator and shares none. Testing primes is sufficient because every common composite divisor contains a common prime.

Every payout whose absolute value q is itself a prime greater than 5 then multiplies base simplicity by 7/(4q). Thus ±7 multiplies the score by 0.25; ±11 by about 0.159; repeated or multiple prime payouts compound. Composites such as 14 and 49 incur factor costs but no extra prime-payout multiplier. This final simplicity score contributes up to 50 points of Recommended. The inspector exposes amount, common-factor, and prime-payout components. Shared subsets are rewarded while the existing whole-schedule scaled-copy exclusion remains unchanged.

Smoothness/steepness measure progression across category ranks, not probabilities. For L categories there are L−1 adjacent jumps; the two-category case has smoothness 100 and steepness 100 for a positive jump. Win probability counts positive net payouts. Stake-based edge uses the initial loss magnitude and is undefined for nonnegative initial payouts.

## Play and layout

Select a generated/reference schedule and choose **Play this schedule**, or play an exactly fair primitive custom schedule from the checker. The play view offers the current shortlist in a schedule selector. Its dice count, scoring mode, and paytable stay attached to that schedule when exploring other settings. Only Chosen face asks for a number before rolling.

Each actual die uses `crypto.getRandomValues` with rejection sampling for the four uint32 values above the largest multiple of six. Animation presents the locked outcome using permanent cube faces; it never swaps pips or samples another result. Each result is physically on top (+Y in the tabletop coordinates). The 58° overhead camera makes that face largest and brightest; side pips have lower contrast. Rounded edges and corners form a closed solid, with directional lighting and recessed pip shading. Numbers below the dice repeat only settled top-face values. The same mesh is projected onto device-pixel-scaled canvases (capped at 2×), without a runtime graphics dependency or GPU requirement. The roll locks its rules before animation starts; schedule, face, speed, and reset controls are disabled in flight. Settlement happens once, including when a tab becomes hidden. Payouts accumulate as BigInt PnL with no starting balance. PnL persists across schedule changes in the current page session; Reset PnL clears it and the recent-roll list. Reloading starts a new session. Custom playable payouts must be safe integers; the analytical checker still supports 100-digit integers.

**Roll speed** defaults to Normal: all dice tumble together for 460ms with 12ms stagger (about half a second total). Instant reveals and settles synchronously without animation. Suspense rolls and reveals one die at a time for 200ms each (about 1.2 seconds for six dice); PnL updates only after the last reveal. Speed stays selected across schedules for this page session. Reduced motion reveals immediately in every mode.

Loss, push, win, big win (at least five times the initial loss), and top payout receive distinct labeled/color treatments. Top payouts and big wins add one short particle burst. Reduced-motion preference removes tumbling and celebrations; scoring remains identical. No sound or automatic repeated betting.

Explore and Play share a viewport-sized app shell. Desktop shows the table and inspector side by side; mobile switches between Explore, Analysis, and Play. Filters, probabilities, ranking explanation, and the custom checker open as dialogs. Long tables, paytables, and analysis scroll internally. Very short landscape windows below 500px tall allow page scrolling to keep controls usable.

## Checks

```sh
node --test dice/reports/tests/*.test.mjs
node scripts/run-tests.mjs
sh scripts/assemble-site.sh _site
node dice/reports/tests/browser.cjs
```

Browser tooling uses `launchQuietBrowser` and writes screenshots to the system temporary directory. CI runs the browser check against the same assembled artifact used for deployment.
