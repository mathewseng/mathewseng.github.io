use std::fmt::Write as _;
use std::path::PathBuf;
use std::thread;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

const CARD_COUNT: usize = 52;
const RANK_COUNT: usize = 13;
const SUIT_COUNT: usize = 4;
const HAND_RANK_COUNT: usize = 10;
const ROYAL_MASK: u16 = (1 << 8) | (1 << 9) | (1 << 10) | (1 << 11) | (1 << 12);
const DEFAULT_EXACT_THROUGH: usize = 10;
const DEFAULT_MONTE_CARLO_SAMPLES: u64 = 5_000_000;
const DEFAULT_SEED: u64 = 0xa51c_2026_0706_d00d;

const HAND_RANKS: [(&str, &str); HAND_RANK_COUNT] = [
    ("high_card", "High card"),
    ("pair", "Pair"),
    ("two_pair", "Two pair"),
    ("trips", "Trips"),
    ("straight", "Straight"),
    ("flush", "Flush"),
    ("boat", "Boat"),
    ("quads", "Quads"),
    ("straight_flush", "Straight flush"),
    ("royal_flush", "Royal flush"),
];

#[derive(Clone, Copy)]
enum HandRank {
    HighCard = 0,
    Pair = 1,
    TwoPair = 2,
    Trips = 3,
    Straight = 4,
    Flush = 5,
    Boat = 6,
    Quads = 7,
    StraightFlush = 8,
    RoyalFlush = 9,
}

#[derive(Clone)]
struct HandState {
    rank_counts: [u8; RANK_COUNT],
    suit_counts: [u8; SUIT_COUNT],
    suit_masks: [u16; SUIT_COUNT],
    rank_mask: u16,
    pairs: u8,
    trips: u8,
    quads: u8,
    cards: u8,
}

impl HandState {
    fn new() -> Self {
        Self {
            rank_counts: [0; RANK_COUNT],
            suit_counts: [0; SUIT_COUNT],
            suit_masks: [0; SUIT_COUNT],
            rank_mask: 0,
            pairs: 0,
            trips: 0,
            quads: 0,
            cards: 0,
        }
    }

    #[inline(always)]
    fn add(&mut self, card: u8) {
        let rank = (card >> 2) as usize;
        let suit = (card & 3) as usize;
        let bit = 1u16 << rank;
        let old = self.rank_counts[rank];

        match old {
            0 => self.rank_mask |= bit,
            1 => self.pairs += 1,
            2 => {
                self.pairs -= 1;
                self.trips += 1;
            }
            3 => {
                self.trips -= 1;
                self.quads += 1;
            }
            _ => unreachable!("a standard deck has only four cards per rank"),
        }

        self.rank_counts[rank] = old + 1;
        self.suit_counts[suit] += 1;
        self.suit_masks[suit] |= bit;
        self.cards += 1;
    }

    #[inline(always)]
    fn remove(&mut self, card: u8) {
        let rank = (card >> 2) as usize;
        let suit = (card & 3) as usize;
        let bit = 1u16 << rank;
        let old = self.rank_counts[rank];

        match old {
            1 => self.rank_mask &= !bit,
            2 => self.pairs -= 1,
            3 => {
                self.trips -= 1;
                self.pairs += 1;
            }
            4 => {
                self.quads -= 1;
                self.trips += 1;
            }
            _ => unreachable!("cannot remove a card that is not in the hand"),
        }

        self.rank_counts[rank] = old - 1;
        self.suit_counts[suit] -= 1;
        self.suit_masks[suit] &= !bit;
        self.cards -= 1;
    }

    #[inline(always)]
    fn evaluate(&self, straight_lookup: &[bool; 1 << RANK_COUNT]) -> HandRank {
        if self.cards < 5 {
            return if self.quads > 0 {
                HandRank::Quads
            } else if self.trips > 0 {
                HandRank::Trips
            } else if self.pairs >= 2 {
                HandRank::TwoPair
            } else if self.pairs == 1 {
                HandRank::Pair
            } else {
                HandRank::HighCard
            };
        }

        let mut has_straight_flush = false;
        let mut has_flush = false;
        for suit in 0..SUIT_COUNT {
            let suited_mask = self.suit_masks[suit] as usize;
            if (self.suit_masks[suit] & ROYAL_MASK) == ROYAL_MASK {
                return HandRank::RoyalFlush;
            }
            has_straight_flush |= straight_lookup[suited_mask];
            has_flush |= self.suit_counts[suit] >= 5;
        }

        if has_straight_flush {
            HandRank::StraightFlush
        } else if self.quads > 0 {
            HandRank::Quads
        } else if self.trips > 0 && (self.pairs > 0 || self.trips > 1) {
            HandRank::Boat
        } else if has_flush {
            HandRank::Flush
        } else if straight_lookup[self.rank_mask as usize] {
            HandRank::Straight
        } else if self.trips > 0 {
            HandRank::Trips
        } else if self.pairs >= 2 {
            HandRank::TwoPair
        } else if self.pairs == 1 {
            HandRank::Pair
        } else {
            HandRank::HighCard
        }
    }
}

#[derive(Clone)]
struct SolveRow {
    cards: usize,
    method: &'static str,
    observations: u64,
    elapsed_ms: f64,
    max_standard_error: f64,
    counts: [u64; HAND_RANK_COUNT],
}

struct Config {
    exact_through: usize,
    samples: u64,
    seed: u64,
    threads: usize,
    output: Option<PathBuf>,
}

fn main() {
    let config = match parse_args() {
        Ok(config) => config,
        Err(message) => {
            eprintln!("{message}");
            eprintln!(
                "usage: cargo run --release -- [--output path] [--exact-through n] [--samples n] [--seed n] [--threads n]"
            );
            std::process::exit(2);
        }
    };

    let straight_lookup = build_straight_lookup();
    let total_start = Instant::now();
    let mut rows = Vec::with_capacity(12);

    for cards in 2..=13 {
        let row = if cards <= config.exact_through {
            eprintln!("exact {cards} cards");
            run_exact(cards, &straight_lookup, config.threads)
        } else {
            eprintln!("monte carlo {cards} cards: {} samples", config.samples);
            run_monte_carlo(
                cards,
                config.samples,
                config.seed ^ mix64(cards as u64),
                &straight_lookup,
                config.threads,
            )
        };
        rows.push(row);
    }

    let total_elapsed_ms = total_start.elapsed().as_secs_f64() * 1000.0;
    let json = build_json(&rows, &config, total_elapsed_ms);

    if let Some(path) = config.output {
        std::fs::write(&path, json).unwrap_or_else(|err| {
            eprintln!("failed to write {}: {err}", path.display());
            std::process::exit(1);
        });
    } else {
        println!("{json}");
    }
}

fn parse_args() -> Result<Config, String> {
    let mut config = Config {
        exact_through: DEFAULT_EXACT_THROUGH,
        samples: DEFAULT_MONTE_CARLO_SAMPLES,
        seed: DEFAULT_SEED,
        threads: thread::available_parallelism().map_or(1, usize::from),
        output: None,
    };

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => {
                return Err("Poker calculation solver".to_string());
            }
            "--output" | "-o" => {
                let value = args.next().ok_or("--output requires a path")?;
                config.output = Some(PathBuf::from(value));
            }
            "--exact-through" => {
                let value = args.next().ok_or("--exact-through requires a number")?;
                config.exact_through = parse_usize("--exact-through", &value)?;
            }
            "--samples" => {
                let value = args.next().ok_or("--samples requires a number")?;
                config.samples = parse_u64("--samples", &value)?;
            }
            "--seed" => {
                let value = args.next().ok_or("--seed requires a number")?;
                config.seed = parse_seed(&value)?;
            }
            "--threads" => {
                let value = args.next().ok_or("--threads requires a number")?;
                config.threads = parse_usize("--threads", &value)?.max(1);
            }
            other => return Err(format!("unknown argument: {other}")),
        }
    }

    if config.exact_through > 13 {
        return Err("--exact-through cannot exceed 13".to_string());
    }
    if config.samples == 0 && config.exact_through < 13 {
        return Err("--samples must be positive when Monte Carlo rows are enabled".to_string());
    }

    Ok(config)
}

fn parse_usize(name: &str, value: &str) -> Result<usize, String> {
    value
        .replace('_', "")
        .parse::<usize>()
        .map_err(|_| format!("{name} must be an integer"))
}

fn parse_u64(name: &str, value: &str) -> Result<u64, String> {
    value
        .replace('_', "")
        .parse::<u64>()
        .map_err(|_| format!("{name} must be an integer"))
}

fn parse_seed(value: &str) -> Result<u64, String> {
    if let Some(hex) = value.strip_prefix("0x") {
        u64::from_str_radix(hex, 16)
            .map_err(|_| "--seed must be a u64 or 0x-prefixed hex u64".to_string())
    } else {
        parse_u64("--seed", value)
    }
}

fn build_straight_lookup() -> [bool; 1 << RANK_COUNT] {
    let mut lookup = [false; 1 << RANK_COUNT];
    let wheel = (1 << 12) | 0b1111;

    for (mask, value) in lookup.iter_mut().enumerate() {
        if (mask & wheel) == wheel {
            *value = true;
            continue;
        }

        for start in 0..=8 {
            let straight = 0b1_1111 << start;
            if (mask & straight) == straight {
                *value = true;
                break;
            }
        }
    }

    lookup
}

fn run_exact(cards: usize, straight_lookup: &[bool; 1 << RANK_COUNT], threads: usize) -> SolveRow {
    let start = Instant::now();
    let observations = combinations(CARD_COUNT as u64, cards as u64);
    let worker_count = threads.min(CARD_COUNT - cards + 1).max(1);
    let mut counts = [0u64; HAND_RANK_COUNT];

    thread::scope(|scope| {
        let mut handles = Vec::with_capacity(worker_count);
        for worker in 0..worker_count {
            handles.push(scope.spawn(move || {
                let mut local = [0u64; HAND_RANK_COUNT];
                let mut state = HandState::new();
                let max_first_card = CARD_COUNT - cards;
                let mut first_card = worker;

                while first_card <= max_first_card {
                    state.add(first_card as u8);
                    enumerate_exact(
                        cards,
                        1,
                        first_card + 1,
                        &mut state,
                        &mut local,
                        straight_lookup,
                    );
                    state.remove(first_card as u8);
                    first_card += worker_count;
                }

                local
            }));
        }

        for handle in handles {
            let local = handle.join().expect("exact worker panicked");
            for index in 0..HAND_RANK_COUNT {
                counts[index] += local[index];
            }
        }
    });

    SolveRow {
        cards,
        method: "exact",
        observations,
        elapsed_ms: start.elapsed().as_secs_f64() * 1000.0,
        max_standard_error: 0.0,
        counts,
    }
}

#[inline(always)]
fn enumerate_exact(
    target_cards: usize,
    depth: usize,
    start_card: usize,
    state: &mut HandState,
    counts: &mut [u64; HAND_RANK_COUNT],
    straight_lookup: &[bool; 1 << RANK_COUNT],
) {
    if depth == target_cards {
        counts[state.evaluate(straight_lookup) as usize] += 1;
        return;
    }

    let needed = target_cards - depth;
    let max_card = CARD_COUNT - needed;
    for card in start_card..=max_card {
        state.add(card as u8);
        enumerate_exact(
            target_cards,
            depth + 1,
            card + 1,
            state,
            counts,
            straight_lookup,
        );
        state.remove(card as u8);
    }
}

fn run_monte_carlo(
    cards: usize,
    samples: u64,
    seed: u64,
    straight_lookup: &[bool; 1 << RANK_COUNT],
    threads: usize,
) -> SolveRow {
    let start = Instant::now();
    let worker_count = threads.min(samples as usize).max(1);
    let mut counts = [0u64; HAND_RANK_COUNT];

    thread::scope(|scope| {
        let mut handles = Vec::with_capacity(worker_count);
        for worker in 0..worker_count {
            let worker_samples =
                samples / worker_count as u64 + u64::from(worker < samples as usize % worker_count);
            handles.push(scope.spawn(move || {
                let mut local = [0u64; HAND_RANK_COUNT];
                let mut deck = [0u8; CARD_COUNT];
                for (card, slot) in deck.iter_mut().enumerate() {
                    *slot = card as u8;
                }

                let mut rng = SplitMix64::new(seed ^ mix64(worker as u64 + 1));
                for _ in 0..worker_samples {
                    let mut state = HandState::new();
                    for index in 0..cards {
                        let swap_index = index + rng.bounded((CARD_COUNT - index) as u32);
                        deck.swap(index, swap_index);
                        state.add(deck[index]);
                    }
                    local[state.evaluate(straight_lookup) as usize] += 1;
                }

                local
            }));
        }

        for handle in handles {
            let local = handle.join().expect("Monte Carlo worker panicked");
            for index in 0..HAND_RANK_COUNT {
                counts[index] += local[index];
            }
        }
    });

    let max_standard_error = counts
        .iter()
        .map(|&count| {
            let probability = count as f64 / samples as f64;
            (probability * (1.0 - probability) / samples as f64).sqrt()
        })
        .fold(0.0_f64, f64::max);

    SolveRow {
        cards,
        method: "monte_carlo",
        observations: samples,
        elapsed_ms: start.elapsed().as_secs_f64() * 1000.0,
        max_standard_error,
        counts,
    }
}

fn combinations(n: u64, k: u64) -> u64 {
    let k = k.min(n - k);
    let mut result = 1u128;
    for i in 1..=k {
        result = result * (n - k + i) as u128 / i as u128;
    }
    result as u64
}

struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    #[inline(always)]
    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        mix64(self.state)
    }

    #[inline(always)]
    fn bounded(&mut self, bound: u32) -> usize {
        (((self.next_u64() as u128) * (bound as u128)) >> 64) as usize
    }
}

#[inline(always)]
fn mix64(mut value: u64) -> u64 {
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

fn build_json(rows: &[SolveRow], config: &Config, total_elapsed_ms: f64) -> String {
    let generated_at_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs());
    let monte_carlo_from = if config.exact_through < 13 {
        config.exact_through + 1
    } else {
        0
    };

    let mut json = String::with_capacity(24_000);
    writeln!(&mut json, "{{").unwrap();
    writeln!(
        &mut json,
        "  \"title\": \"Poker hand ranking probabilities by cards dealt\","
    )
    .unwrap();
    writeln!(&mut json, "  \"generatedAtUnix\": {generated_at_unix},").unwrap();
    writeln!(
        &mut json,
        "  \"deck\": \"52-card standard deck, no jokers\","
    )
    .unwrap();
    writeln!(
        &mut json,
        "  \"classification\": \"Rows are mutually exclusive. For five or more cards, the category is the best five-card poker hand available. For two to four cards, only made rank patterns possible with that many cards are counted.\","
    )
    .unwrap();
    writeln!(&mut json, "  \"parameters\": {{").unwrap();
    writeln!(&mut json, "    \"exactThrough\": {},", config.exact_through).unwrap();
    if monte_carlo_from == 0 {
        writeln!(&mut json, "    \"monteCarloFrom\": null,").unwrap();
    } else {
        writeln!(&mut json, "    \"monteCarloFrom\": {monte_carlo_from},").unwrap();
    }
    writeln!(
        &mut json,
        "    \"monteCarloSamplesPerRow\": {},",
        config.samples
    )
    .unwrap();
    writeln!(&mut json, "    \"seed\": \"0x{:016x}\",", config.seed).unwrap();
    writeln!(&mut json, "    \"threads\": {},", config.threads).unwrap();
    writeln!(&mut json, "    \"totalElapsedMs\": {:.6}", total_elapsed_ms).unwrap();
    writeln!(&mut json, "  }},").unwrap();
    writeln!(&mut json, "  \"handRanks\": [").unwrap();
    for (index, (key, label)) in HAND_RANKS.iter().enumerate() {
        let suffix = if index + 1 == HAND_RANKS.len() {
            ""
        } else {
            ","
        };
        writeln!(
            &mut json,
            "    {{\"key\": \"{key}\", \"label\": \"{label}\"}}{suffix}"
        )
        .unwrap();
    }
    writeln!(&mut json, "  ],").unwrap();
    writeln!(&mut json, "  \"rows\": [").unwrap();

    for (row_index, row) in rows.iter().enumerate() {
        let suffix = if row_index + 1 == rows.len() { "" } else { "," };
        writeln!(&mut json, "    {{").unwrap();
        writeln!(&mut json, "      \"cards\": {},", row.cards).unwrap();
        writeln!(&mut json, "      \"method\": \"{}\",", row.method).unwrap();
        writeln!(&mut json, "      \"observations\": {},", row.observations).unwrap();
        writeln!(&mut json, "      \"elapsedMs\": {:.6},", row.elapsed_ms).unwrap();
        writeln!(
            &mut json,
            "      \"maxStandardError\": {:.12},",
            row.max_standard_error
        )
        .unwrap();
        writeln!(
            &mut json,
            "      \"counts\": {},",
            array_json_u64(&row.counts)
        )
        .unwrap();
        writeln!(
            &mut json,
            "      \"probabilities\": {}",
            probability_array_json(&row.counts, row.observations)
        )
        .unwrap();
        writeln!(&mut json, "    }}{suffix}").unwrap();
    }

    writeln!(&mut json, "  ]").unwrap();
    writeln!(&mut json, "}}").unwrap();
    json
}

fn array_json_u64(values: &[u64; HAND_RANK_COUNT]) -> String {
    let mut output = String::from("[");
    for (index, value) in values.iter().enumerate() {
        if index > 0 {
            output.push_str(", ");
        }
        write!(&mut output, "{value}").unwrap();
    }
    output.push(']');
    output
}

fn probability_array_json(counts: &[u64; HAND_RANK_COUNT], observations: u64) -> String {
    let mut output = String::from("[");
    for (index, count) in counts.iter().enumerate() {
        if index > 0 {
            output.push_str(", ");
        }
        let probability = *count as f64 / observations as f64;
        write!(&mut output, "{probability:.12}").unwrap();
    }
    output.push(']');
    output
}
