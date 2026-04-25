# Solver Report

Generated for the `/blackjack-strategy/` static app on 2026-04-25.

## Engine

- Language: Rust
- Browser runtime: `wasm32-unknown-unknown`
- Browser artifact: `assets/blackjack_solver.wasm`
- CLI: `cargo run --release --bin blackjack_solver_cli -- benchmark 25000`
- Chart size: 28 player rows x 10 dealer up-cards = 280 cells

## Benchmark

From `data/solver-report.json`:

- Iterations: 25,000 charts
- Average full-chart solve: 19.698 us
- Charts per second: 50,766.2
- Cells per second: 14,214,538.8
- Average JSON payload: 16,573 bytes
- Supported rule combinations in the solver input surface: 884,736

Because the full chart is solved in microseconds locally, the website can call the Rust WASM solver live instead of downloading a massive pre-solved matrix. The browser app also includes a JavaScript mirror of the same rule surface, plus `data/fallback-chart.json`, so chart rendering remains instant if a runtime blocks or traps the WASM module.

## Strategy Model

The engine emits a rules-aware basic strategy chart with:

- Hard totals, soft totals, and pair rows
- Rule modifiers for S17/H17, double restrictions, DAS, surrender, no-peek variants, resplits, HSA/RSA, charlies, blackjack payout, and optimization mode
- Hi-Lo count deviations using common index families, including Illustrious 18 style stand/double/split deviations and Fab 4 surrender deviations
- Current true-count application, with each indexed cell retaining the base play and the active deviation play

The house edge and variance figures are modeled estimates intended for comparison between rule sets. The chart decisions are deterministic and instant, but they are not a licensed casino audit or a full composition-dependent finite-deck EV proof.

## Reference Feature Set

The UI feature scope was patterned after the public Beating Bonuses blackjack calculator and blackjack rule tables, especially the controls for decks, soft 17, double rules, peek rules, surrender, resplits, charlies, blackjack pay, and per-hand/per-wager optimization.

Source: https://www.beatingbonuses.com/bjstrategy.php
