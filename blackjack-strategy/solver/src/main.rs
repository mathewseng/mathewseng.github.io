use blackjack_solver::{benchmark_json, solve_chart_json};

fn main() {
    let mut args = std::env::args().skip(1);
    match args.next().as_deref() {
        Some("benchmark") | Some("metrics") | Some("report") => {
            let iterations = args
                .next()
                .and_then(|value| value.parse::<usize>().ok())
                .unwrap_or(25_000);
            println!("{}", benchmark_json(iterations));
        }
        Some("chart") | None => {
            println!(
                "{}",
                solve_chart_json(
                    6, // decks
                    0, // S17
                    0, // double any two
                    1, // DAS
                    0, // no surrender
                    0, // peek
                    0, // no resplits
                    0, // no RSA
                    0, // no HSA
                    0, // no charlie
                    0, // blackjack pays 3:2
                    0, // per-hand optimization
                    0, // true count
                )
            );
        }
        Some(other) => {
            eprintln!("unknown command: {other}");
            eprintln!("usage: cargo run --release -- [chart|benchmark <iterations>]");
            std::process::exit(2);
        }
    }
}
