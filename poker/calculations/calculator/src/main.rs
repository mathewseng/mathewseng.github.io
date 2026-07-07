use std::collections::HashMap;
use std::fmt::Write as _;
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

const CARD_COUNT: usize = 52;
const RANK_COUNT: usize = 13;
const SUIT_COUNT: usize = 4;
const MAX_TRACKED_CARDS: usize = 13;
const HAND_RANK_COUNT: usize = 10;
const LANE_COUNT_MASK: u8 = 0b0000_0111;
const LANE_RUN_MASK: u8 = 0b0011_1000;
const LANE_WHEEL_LOW: u8 = 0b0100_0000;

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

const RANK_LABELS: [&str; RANK_COUNT] = [
    "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A",
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
struct SolveRow {
    cards: usize,
    observations: u64,
    counts: [u64; HAND_RANK_COUNT],
}

#[derive(Clone)]
struct LayerStat {
    rank: &'static str,
    states: usize,
    represented_subsets: u64,
}

struct SolveResult {
    rows: Vec<SolveRow>,
    layer_stats: Vec<LayerStat>,
    final_states: usize,
    peak_states: usize,
    covered_subsets: u64,
    elapsed_ms: f64,
}

#[derive(Clone, Copy)]
struct StateFields {
    total: u8,
    pairs: u8,
    trips: u8,
    quads: bool,
    rank_run: u8,
    rank_wheel_low: bool,
    straight: bool,
    straight_flush: bool,
    royal_flush: bool,
    lanes: [u8; SUIT_COUNT],
}

struct Config {
    output: Option<PathBuf>,
}

fn main() {
    let config = match parse_args() {
        Ok(config) => config,
        Err(message) => {
            eprintln!("{message}");
            eprintln!("usage: cargo run --release -- [--output path]");
            std::process::exit(2);
        }
    };

    let result = solve_exact();
    let json = build_json(&result);

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
    let mut config = Config { output: None };
    let mut args = std::env::args().skip(1);

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => return Err("Poker calculation solver".to_string()),
            "--output" | "-o" => {
                let value = args.next().ok_or("--output requires a path")?;
                config.output = Some(PathBuf::from(value));
            }
            other => return Err(format!("unknown argument: {other}")),
        }
    }

    Ok(config)
}

fn solve_exact() -> SolveResult {
    let start = Instant::now();
    let mut states = HashMap::with_capacity(1);
    let start_lanes = [pack_lane(0, 0, true); SUIT_COUNT];
    states.insert(
        pack_state(StateFields {
            total: 0,
            pairs: 0,
            trips: 0,
            quads: false,
            rank_run: 0,
            rank_wheel_low: true,
            straight: false,
            straight_flush: false,
            royal_flush: false,
            lanes: start_lanes,
        }),
        1u64,
    );

    let mut layer_stats = Vec::with_capacity(RANK_COUNT);
    let mut peak_states = states.len();

    for rank in 0..RANK_COUNT {
        let mut next = HashMap::with_capacity(states.len() * 4);

        for (&key, &ways) in &states {
            let fields = unpack_state(key);
            for suit_mask in 0u8..(1 << SUIT_COUNT) {
                let added_cards = suit_mask.count_ones() as u8;
                if fields.total as usize + added_cards as usize > MAX_TRACKED_CARDS {
                    continue;
                }

                let next_fields = advance_state(fields, rank, suit_mask, added_cards);
                let next_key = pack_state(next_fields);
                *next.entry(next_key).or_insert(0) += ways;
            }
        }

        let represented_subsets = next.values().sum();
        peak_states = peak_states.max(next.len());
        layer_stats.push(LayerStat {
            rank: RANK_LABELS[rank],
            states: next.len(),
            represented_subsets,
        });
        states = next;
    }

    let mut counts = [[0u64; HAND_RANK_COUNT]; MAX_TRACKED_CARDS + 1];
    for (&key, &ways) in &states {
        let fields = unpack_state(key);
        if fields.total < 2 {
            continue;
        }
        let rank = evaluate_final(fields);
        counts[fields.total as usize][rank as usize] += ways;
    }

    let mut rows = Vec::with_capacity(12);
    for cards in 2..=MAX_TRACKED_CARDS {
        let observations = combinations(CARD_COUNT as u64, cards as u64);
        let row_total: u64 = counts[cards].iter().sum();
        assert_eq!(
            row_total, observations,
            "exact counts did not sum to C(52,{cards})"
        );
        rows.push(SolveRow {
            cards,
            observations,
            counts: counts[cards],
        });
    }

    SolveResult {
        rows,
        layer_stats,
        final_states: states.len(),
        peak_states,
        covered_subsets: states.values().sum(),
        elapsed_ms: start.elapsed().as_secs_f64() * 1000.0,
    }
}

#[inline(always)]
fn advance_state(fields: StateFields, rank: usize, suit_mask: u8, added_cards: u8) -> StateFields {
    let mut next = fields;
    next.total += added_cards;

    match added_cards {
        2 => next.pairs = (next.pairs + 1).min(2),
        3 => next.trips = (next.trips + 1).min(2),
        4 => next.quads = true,
        _ => {}
    }

    let rank_present = added_cards > 0;
    next.rank_run = if rank_present {
        (fields.rank_run + 1).min(5)
    } else {
        0
    };
    next.straight |= next.rank_run >= 5;

    if rank < 4 {
        next.rank_wheel_low &= rank_present;
    }
    if rank == 12 && rank_present && fields.rank_wheel_low {
        next.straight = true;
    }

    for suit in 0..SUIT_COUNT {
        let selected = (suit_mask & (1 << suit)) != 0;
        let old_lane = fields.lanes[suit];
        let old_count = lane_count(old_lane);
        let old_run = lane_run(old_lane);
        let old_wheel_low = lane_wheel_low(old_lane);

        let count = if selected {
            (old_count + 1).min(5)
        } else {
            old_count
        };
        let run = if selected { (old_run + 1).min(5) } else { 0 };
        let mut wheel_low = old_wheel_low;

        if rank < 4 {
            wheel_low &= selected;
        }

        if selected && run >= 5 {
            next.straight_flush = true;
            if rank == 12 {
                next.royal_flush = true;
            }
        }
        if rank == 12 && selected && old_wheel_low {
            next.straight_flush = true;
        }

        next.lanes[suit] = pack_lane(count, run, wheel_low);
    }

    next.lanes.sort_unstable();
    next
}

#[inline(always)]
fn evaluate_final(fields: StateFields) -> HandRank {
    if fields.total < 5 {
        return if fields.quads {
            HandRank::Quads
        } else if fields.trips > 0 {
            HandRank::Trips
        } else if fields.pairs >= 2 {
            HandRank::TwoPair
        } else if fields.pairs == 1 {
            HandRank::Pair
        } else {
            HandRank::HighCard
        };
    }

    let has_flush = fields.lanes.iter().any(|&lane| lane_count(lane) >= 5);

    if fields.royal_flush {
        HandRank::RoyalFlush
    } else if fields.straight_flush {
        HandRank::StraightFlush
    } else if fields.quads {
        HandRank::Quads
    } else if fields.trips > 0 && (fields.pairs > 0 || fields.trips > 1) {
        HandRank::Boat
    } else if has_flush {
        HandRank::Flush
    } else if fields.straight {
        HandRank::Straight
    } else if fields.trips > 0 {
        HandRank::Trips
    } else if fields.pairs >= 2 {
        HandRank::TwoPair
    } else if fields.pairs == 1 {
        HandRank::Pair
    } else {
        HandRank::HighCard
    }
}

#[inline(always)]
fn pack_lane(count: u8, run: u8, wheel_low: bool) -> u8 {
    count | (run << 3) | if wheel_low { LANE_WHEEL_LOW } else { 0 }
}

#[inline(always)]
fn lane_count(lane: u8) -> u8 {
    lane & LANE_COUNT_MASK
}

#[inline(always)]
fn lane_run(lane: u8) -> u8 {
    (lane & LANE_RUN_MASK) >> 3
}

#[inline(always)]
fn lane_wheel_low(lane: u8) -> bool {
    (lane & LANE_WHEEL_LOW) != 0
}

#[inline(always)]
fn pack_state(fields: StateFields) -> u64 {
    let mut lanes = fields.lanes;
    lanes.sort_unstable();

    let mut key = fields.total as u64;
    let mut shift = 4;
    push_bits(&mut key, &mut shift, fields.pairs as u64, 2);
    push_bits(&mut key, &mut shift, fields.trips as u64, 2);
    push_bits(&mut key, &mut shift, fields.quads as u64, 1);
    push_bits(&mut key, &mut shift, fields.rank_run as u64, 3);
    push_bits(&mut key, &mut shift, fields.rank_wheel_low as u64, 1);
    push_bits(&mut key, &mut shift, fields.straight as u64, 1);
    push_bits(&mut key, &mut shift, fields.straight_flush as u64, 1);
    push_bits(&mut key, &mut shift, fields.royal_flush as u64, 1);

    for lane in lanes {
        push_bits(&mut key, &mut shift, lane as u64, 7);
    }

    key
}

#[inline(always)]
fn unpack_state(key: u64) -> StateFields {
    let mut shift = 4;
    let total = (key & 0b1111) as u8;
    let pairs = read_bits(key, &mut shift, 2) as u8;
    let trips = read_bits(key, &mut shift, 2) as u8;
    let quads = read_bits(key, &mut shift, 1) != 0;
    let rank_run = read_bits(key, &mut shift, 3) as u8;
    let rank_wheel_low = read_bits(key, &mut shift, 1) != 0;
    let straight = read_bits(key, &mut shift, 1) != 0;
    let straight_flush = read_bits(key, &mut shift, 1) != 0;
    let royal_flush = read_bits(key, &mut shift, 1) != 0;
    let mut lanes = [0u8; SUIT_COUNT];

    for lane in &mut lanes {
        *lane = read_bits(key, &mut shift, 7) as u8;
    }

    StateFields {
        total,
        pairs,
        trips,
        quads,
        rank_run,
        rank_wheel_low,
        straight,
        straight_flush,
        royal_flush,
        lanes,
    }
}

#[inline(always)]
fn push_bits(key: &mut u64, shift: &mut u8, value: u64, bits: u8) {
    *key |= value << *shift;
    *shift += bits;
}

#[inline(always)]
fn read_bits(key: u64, shift: &mut u8, bits: u8) -> u64 {
    let mask = (1u64 << bits) - 1;
    let value = (key >> *shift) & mask;
    *shift += bits;
    value
}

fn combinations(n: u64, k: u64) -> u64 {
    let k = k.min(n - k);
    let mut result = 1u128;
    for i in 1..=k {
        result = result * (n - k + i) as u128 / i as u128;
    }
    result as u64
}

fn build_json(result: &SolveResult) -> String {
    let generated_at_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs());

    let mut json = String::with_capacity(30_000);
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
    writeln!(&mut json, "    \"algorithm\": \"canonical_suit_lane_dp\",").unwrap();
    writeln!(&mut json, "    \"algorithmLabel\": \"Exact canonical DP\",").unwrap();
    writeln!(&mut json, "    \"exactThrough\": 13,").unwrap();
    writeln!(&mut json, "    \"monteCarloFrom\": null,").unwrap();
    writeln!(&mut json, "    \"monteCarloSamplesPerRow\": 0,").unwrap();
    writeln!(
        &mut json,
        "    \"totalElapsedMs\": {:.6},",
        result.elapsed_ms
    )
    .unwrap();
    writeln!(&mut json, "    \"finalStates\": {},", result.final_states).unwrap();
    writeln!(&mut json, "    \"peakStates\": {},", result.peak_states).unwrap();
    writeln!(
        &mut json,
        "    \"coveredSubsets\": {}",
        result.covered_subsets
    )
    .unwrap();
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

    writeln!(&mut json, "  \"solverLayers\": [").unwrap();
    for (index, layer) in result.layer_stats.iter().enumerate() {
        let suffix = if index + 1 == result.layer_stats.len() {
            ""
        } else {
            ","
        };
        writeln!(
            &mut json,
            "    {{\"rank\": \"{}\", \"states\": {}, \"representedSubsets\": {}}}{suffix}",
            layer.rank, layer.states, layer.represented_subsets
        )
        .unwrap();
    }
    writeln!(&mut json, "  ],").unwrap();

    writeln!(&mut json, "  \"rows\": [").unwrap();
    for (row_index, row) in result.rows.iter().enumerate() {
        let suffix = if row_index + 1 == result.rows.len() {
            ""
        } else {
            ","
        };
        writeln!(&mut json, "    {{").unwrap();
        writeln!(&mut json, "      \"cards\": {},", row.cards).unwrap();
        writeln!(&mut json, "      \"method\": \"exact\",").unwrap();
        writeln!(&mut json, "      \"observations\": {},", row.observations).unwrap();
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
