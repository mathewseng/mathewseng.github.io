# Blackjack Strategy Lab

Static GitHub Pages app at `/blackjack-strategy/`.

## What ships

- `index.html`, `styles.css`, `app.js`: responsive blackjack strategy UI.
- `assets/blackjack_solver.wasm`: compiled Rust solver used by the browser.
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

## Supported controls

- Decks: 1, 2, 4, 5, 6, 8
- Dealer S17/H17
- Double rules
- Dealer peek/no-peek variants
- Late, early-10, and full early surrender
- DAS, HSA, RSA, resplits, charlie bonuses, blackjack payout variants
- Per-hand, per-wager, and two-tier optimization modes
- Hi-Lo true count with common index deviations
- EV/probability view with legal-action EVs, decision gap, and final-total/bust distributions
- Count indexes calculated from EV crossover points and filterable by visible index range
- Reverse 2-6 dealer-column order: `6 5 4 3 2 7 8 9 10 A`

The app runs entirely in the browser. There is no server component.
