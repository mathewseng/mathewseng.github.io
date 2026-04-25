# blackjack_solver

Rust source for the `/blackjack-strategy/` browser solver.

## Commands

```sh
cargo fmt --check
cargo check
RUSTFLAGS='-C target-cpu=mvp -C target-feature=-call-indirect-overlong,-reference-types,-multivalue,-bulk-memory,-mutable-globals,-sign-ext' cargo build --release --target wasm32-unknown-unknown --lib
cargo run --release --bin blackjack_solver_cli -- chart
cargo run --release --bin blackjack_solver_cli -- benchmark 25000
```

The browser calls the exported WASM functions:

- `solve_chart(...) -> *mut u8`
- `last_result_len() -> usize`
- `free_result(ptr, len)`

The returned payload is JSON. The JavaScript app decodes it, renders the chart, then frees the Rust allocation.
