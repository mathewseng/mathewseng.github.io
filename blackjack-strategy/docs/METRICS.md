# Metrics Notes

## House Edge

The app reports `houseEdgePct` as the negative of modeled player EV. A favorable rule set can show a negative house edge, which means the modeled player EV is positive.

The estimate starts with a deck-count baseline and applies rule deltas for:

- H17
- Double restrictions
- DAS / NDAS
- Peek / no-peek handling
- Surrender mode
- Resplits, RSA, HSA
- Charlie rules
- Blackjack payout
- Optimization mode

These figures are for quick comparison and UI feedback. They should not be treated as a replacement for a full composition-dependent EV calculator.

## Standard Deviation

`stdevPerHand` is a modeled per-hand standard deviation. `stdevPerWager` divides that value by a typical wager-normalization factor.

## Margin Score

Each chart cell includes a compact `m` score. It is not a dollar EV. It is a display-grade confidence/margin signal used by the inspector so close decisions and count-sensitive cells can be identified quickly.

## Hi-Lo Count

The count tracker uses standard Hi-Lo tags:

- `2` through `6`: +1
- `7` through `9`: 0
- `10` through `A`: -1

The chart applies the active true count directly. When the tracker is used, true count is `running count / decks remaining`. When the manual slider is used, that value is applied directly.

## EV View

The browser EV view computes legal action choices for each chart cell:

- Stand
- Hit with optimal continuation
- Double when legal
- Split when the row is a pair
- Surrender when legal

Each cell stores the best EV, the EV gap to the second-best legal choice, all legal action EVs, and the distribution of final player totals or busts when perfect strategy is followed from that cell.

## Count Indexes

Displayed indexes are calculated from EV crossover points. For each close decision, the engine compares the base action at true count 0 against alternate legal actions at count-adjusted card weights, then binary-refines the threshold where the alternate action becomes better. Index values are shown to two decimal places.
