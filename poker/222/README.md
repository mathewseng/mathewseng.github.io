# 222

Static, dependency-free page at `/poker/222/`: a table simulator, a spot solver, a doubling-cube trainer, peer-to-peer online play, and precomputed cube reports for the flipping game 222. Serve the repository over HTTP; the page uses module workers, so it does not run from `file://`.

## Rules

Each player holds six cards and shares a five-card board dealt flop, turn, river. Hole cards are private while a cube action remains; once no action is left (or at a table with no cube) every hand is tabled and the rest is a flip. Once a flop is out, every six-card hand is split automatically into three two-card Omaha hands (exactly two hole cards plus exactly three board cards):

1. **Hand 1** is the two hole cards used by the best Omaha hand available from all six cards.
2. **Hand 2** is the best two of the remaining four.
3. **Hand 3** is the last two.

When several candidate pairs make the same best hand, the higher-ranked cards are used first, then the higher suit (spades > hearts > diamonds > clubs). Hand 1 is worth 3 points, hand 2 is worth 2 and hand 3 is worth 1. A tie splits a hand's points. Winning all three outright scoops for a 4-point bonus (10 points in all). An alternate flat scoring (`SCORINGS.flat` in `engine.mjs`) pays 1 point per hand and 3 for a scoop (6 in all); every page has a scoring selector. With more than two players every pair of players settles separately, so a seat's net is the sum over its opponents.

## Doubling cube (two players)

Backgammon terms, hidden hands. The cube starts centered at 1. **Double** offers to play on for twice the stake. The player doubled may **drop** (losing the drop cost, 6 points by default, per unit of the cube before the double), **take** (the cube doubles), or **beaver**: take and immediately redouble. The doubler may then drop (twice the drop cost), take at four times, or **raccoon** (redouble again), and so on (rebeaver, reraccoon, …) until the cube reaches 64. Dropping the k-th raise of a chain always costs the drop cost times the cube level before that raise. The drop cost is selectable on every page (5 to 16 points with 3-2-1 scoring, 1 to 10 with flat scoring; see `SCORINGS` in `engine.mjs`), and the reports compare them. Showdown pays the net points times the cube.

Seven variants: every non-empty combination of **preflop**, **flop** and **river** as cube streets (the turn never has action). The button has the first cube option. Whoever takes a raise holds the cube and has the option on the next cube street (after a beaver chain, the final taker); whoever passes up the option hands it to the opponent for the next cube street.

## Hidden information and the solver

While a cube action remains, each seat's numbers are against the opponent's **range**: every hand the opponent could hold given the visible cards, weighted by the equilibrium strategy once a cube action has been taken (after a flop take, the button's range is its doubling range and the opponent's range is its taking range). Once no cube action remains the hands are tabled and `engine.mjs` enumerates every runout (or samples when the count is large), so the numbers become perfect-information.

`solver.mjs` solves the hidden-information game. It samples hands for both players (the actual hands are index 0 of their side), samples the unknown board cards (flops, then turn-and-river runouts) and runs counterfactual regret minimization (CFR+, alternating updates, delayed quadratic averaging) over every cube decision that remains: the raise chain on the current street and, for every later cube street, another chain in every reachable cube state (no double, taken at 2×, 4×, … with the matching owner), conditioned on everything before. Cube states beyond the modeled multipliers reuse the deepest modeled state's play scaled to their level (their equilibrium reach is tiny). The solve runs until a first-order exploitability bound (how much either player could gain by changing any one decision, weighted by how often it is reached) drops below the tolerance or the iteration cap, then removes probabilities under 1%. The reported mixes are therefore consistent with the reported equities: options in a mix have equal equity within the tolerance, and options with lower equity get 0%. Each result carries its tolerance and exploitability bound. A later street's solve takes the earlier street's hand sets and reach weights (`reach[stateKey]`) as its ranges, so the flop solve in a preflop variant is conditioned on the preflop action, and the river solve on both.

Large solves (preflop entries, and flop entries with a river stage) are coordinated from the main thread: the entry street's chain runs there while the sampled flops or runout groups are spread across the worker pool (`SubgameHost` in `worker.js`), with one round trip per half-iteration.

Ticking "Table hands" in the simulator or spot solver shows the face-up minimax of a pending decision (`analyzeDecision` / `chainValues`): a flop decision enumerates all 666 runouts with a lone remaining river cube resolved by backward induction; when more than that remains, the face-up view treats later cube streets as cubeless.

## Pages

- **Simulator**: 2–7 players; step forward and back through the streets; click any card and then a deck card to edit a spot. Two-player tables show each seat's numbers against the opponent's range while a cube action remains and the equilibrium for the pending decision (mix and equity of every option at every chain node for both actual hands); choose the variant, button, cube state and, when ambiguous, the street the cube was taken on. Tick "Table hands" for the face-up view.
- **Spot solver**: type hands, board, button, cube state and variant and solve. In a two-player spot the second hand may be blank: the first seat is solved against the full range.
- **Cube trainer**: play any of the seven variants against the equilibrium bot. Its cards stay hidden until no action remains; every decision (double, drop, take, beaver, raccoon, …) is graded against the equilibrium in points; review earlier streets with the street buttons.
- **Play online**: PeerJS rooms through `shared/peer-room.js`; the host runs the deal and hides other players' hands until they are tabled; every client computes its own range numbers and sees its own decisions graded.
- **Reports**: equilibrium cube play per variant from `data/cube-report.json`, plus face-up play for comparison.

## Numbers

EVs are expected net points over the remaining runouts. Against a range they are sampled (exact once at most one card is to come with a weighted range). Once tabled, the worker pool enumerates every completion when the count is below the precision limit (Fast 40,000; Standard 400,000; Exact always) and samples otherwise. The precision setting also picks the solver size (hands sampled per side, flops, runouts, modeled cube multipliers, iteration cap and tolerance). Win and tie are the chances a hand is the outright best or tied for best at showdown. Colors scale with the number: green is good for the seat shown, red is bad.

## Regenerate the reports

```sh
node poker/222/simulation/cube-report.mjs 50000 12 20261003 120 80 6
node --test poker/222/tests/engine.test.mjs poker/222/tests/solver.test.mjs
```

Arguments are face-up deals, threads, seed, boards for the detailed section, boards per drop cost for the sweep, and the default drop cost. The detailed section solves the flop and river variants on random boards at standard precision and each preflop variant as one game; the sweep repeats every variant at fast precision for every scoring system and every drop cost it offers (3-2-1 scoring 5 to 16, flat scoring 1 to 10). Face-up play is reported for the variants without a preflop cube.
