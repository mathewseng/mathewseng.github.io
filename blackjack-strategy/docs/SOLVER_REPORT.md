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
- Average full-chart solve: 20.166 us
- Charts per second: 49,587.6
- Cells per second: 13,884,516.7
- Average JSON payload: 16,550 bytes
- Supported rule combinations in the solver input surface: 884,736

Because the full chart is solved in microseconds locally, the Rust engine remains in the repo as a reproducible benchmark and portable WASM artifact. The browser UI now uses a realtime EV/probability solver so every rule, count, EV view, and probability panel recomputes from the same active configuration without waiting on a pre-solved database.

## Strategy Model

The chart engine emits a rules-aware strategy chart with:

- Hard totals, soft totals, and pair rows
- Rule modifiers for S17/H17, double restrictions, DAS, surrender, no-peek variants, HSA, charlies, and count-adjusted card weights
- Hi-Lo count deviations calculated from EV crossover points rather than a hard-coded index list
- Current true-count application, with each indexed cell retaining the base play, active deviation play, EVs, margin, and final-total distribution

The house edge and variance figures are modeled estimates intended for comparison between rule sets. The chart decisions are deterministic and realtime, but they are not a licensed casino audit or a full composition-dependent finite-deck EV proof.

## Reference Feature Set

The UI feature scope was patterned after the public Beating Bonuses blackjack calculator and blackjack rule tables, especially the controls for decks, soft 17, double rules, peek rules, surrender, resplits, charlies, blackjack pay, and per-hand/per-wager optimization.

Source: https://www.beatingbonuses.com/bjstrategy.php
