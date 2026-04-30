# Blackjack Strategy Lab

Static GitHub Pages app at `/blackjack-strategy/`.

## What ships

- `index.html`, `styles.css`, `app.js`: responsive blackjack strategy UI.
- `assets/blackjack_solver.wasm`: compiled Rust solver benchmark artifact.
- `solver/`: Rust source for the chart solver and benchmark CLI.
- `data/solver-report.json`: generated benchmark report.
- `data/fallback-chart.json`: default 6D S17 fallback chart if WASM cannot load.
- `docs/`: notes on the solver model, metrics, and benchmark.

## Build

```sh
cd blackjack-strategy/solver
cargo fmt --check
cargo check
RUSTFLAGS='-C target-cpu=mvp -C target-feature=-call-indirect-overlong,-reference-types,-multivalue,-bulk-memory,-mutable-globals,-sign-ext' cargo build --release --target wasm32-unknown-unknown --lib
cargo run --release --bin blackjack_solver_cli -- benchmark 25000 > ../data/solver-report.json
cargo run --release --bin blackjack_solver_cli -- chart > ../data/fallback-chart.json
cp target/wasm32-unknown-unknown/release/blackjack_solver.wasm ../assets/blackjack_solver.wasm
```

## Tests

```sh
node --test blackjack-strategy/tests/solver-regression.test.mjs
```

The regression suite validates physical-card dead-card removal, normalized EV/probability output, bounded index generation, published Hi-Lo source rows, Custom-vs-source index audit deltas, and a representative matrix of rule/count settings.

## Supported controls

- Decks: slider ticks for 1 through 8 decks plus infinite-deck mode
- Dealer S17/H17
- Double rules
- Dealer peek/no-peek variants
- Late, early-10, and full early surrender
- DAS, HSA, RSA, resplits, charlie bonuses, blackjack payout variants
- Per-hand, per-wager, and two-tier optimization modes
- Separate Hi-Lo running-count and true-count sliders, with decks-left precision to 0.01 decks
- EV/probability view with legal-action EVs, decision gap, and final-total/bust distributions
- Count indexes in Custom mode are generated from Hi-Lo EV crossovers for every chart cell; named groups are separate published overlays
- Compact index audit that compares generated Custom crossover points against the selected or rule-appropriate published source group
- Index slider defaults to -5 through +10, with number boxes that can accept wider manual values, and displayable index precision from 0 to 3 decimals
- Finite-deck EVs remove the visible player hand and dealer upcard before calculating draw probabilities
- Reverse 2-6 dealer-column order: `6 5 4 3 2 7 8 9 T A`

The app runs entirely in the browser. There is no server component.
