const DEALERS: [u8; 10] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

#[derive(Clone, Copy)]
pub struct Rules {
    decks: u8,
    h17: bool,
    double_rule: u8,
    das: bool,
    surrender: u8,
    peek: u8,
    resplit_hands: u8,
    rsa: bool,
    hsa: bool,
    charlie: u8,
    blackjack_pay: u8,
    optimization: u8,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Action {
    Hit,
    Stand,
    DoubleHit,
    DoubleStand,
    Split,
    SurrenderHit,
    SurrenderStand,
}

#[derive(Clone, Copy)]
struct IndexPlay {
    threshold: i8,
    direction: Direction,
    action: Action,
    family: &'static str,
}

#[derive(Clone, Copy)]
enum Direction {
    Gte,
    Lte,
}

#[derive(Clone, Copy)]
struct Metrics {
    player_edge_pct: f32,
    house_edge_pct: f32,
    stdev_per_hand: f32,
    stdev_per_wager: f32,
    combos_supported: u32,
    cells_per_chart: u16,
}

impl Rules {
    fn from_inputs(
        decks: u8,
        h17: u8,
        double_rule: u8,
        das: u8,
        surrender: u8,
        peek: u8,
        resplit_hands: u8,
        rsa: u8,
        hsa: u8,
        charlie: u8,
        blackjack_pay: u8,
        optimization: u8,
    ) -> Self {
        Self {
            decks: normalize_decks(decks),
            h17: h17 != 0,
            double_rule: double_rule.min(3),
            das: das != 0,
            surrender: surrender.min(3),
            peek: peek.min(3),
            resplit_hands: match resplit_hands {
                3 | 4 => resplit_hands,
                _ => 0,
            },
            rsa: rsa != 0,
            hsa: hsa != 0,
            charlie: match charlie {
                5 | 6 | 7 => charlie,
                _ => 0,
            },
            blackjack_pay: blackjack_pay.min(3),
            optimization: optimization.min(2),
        }
    }
}

fn normalize_decks(decks: u8) -> u8 {
    match decks {
        1 | 2 | 4 | 5 | 6 | 8 => decks,
        _ => 6,
    }
}

fn action_code(action: Action) -> &'static str {
    match action {
        Action::Hit => "H",
        Action::Stand => "S",
        Action::DoubleHit => "D",
        Action::DoubleStand => "Ds",
        Action::Split => "P",
        Action::SurrenderHit => "Rh",
        Action::SurrenderStand => "Rs",
    }
}

fn direction_code(direction: Direction) -> &'static str {
    match direction {
        Direction::Gte => "gte",
        Direction::Lte => "lte",
    }
}

fn dealer_label(dealer: u8) -> &'static str {
    match dealer {
        2 => "2",
        3 => "3",
        4 => "4",
        5 => "5",
        6 => "6",
        7 => "7",
        8 => "8",
        9 => "9",
        10 => "10",
        _ => "A",
    }
}

fn hard_label(total: u8) -> &'static str {
    match total {
        8 => "5-8",
        17 => "17+",
        9 => "9",
        10 => "10",
        11 => "11",
        12 => "12",
        13 => "13",
        14 => "14",
        15 => "15",
        16 => "16",
        _ => "?",
    }
}

fn pair_label(card: u8) -> &'static str {
    match card {
        2 => "2,2",
        3 => "3,3",
        4 => "4,4",
        5 => "5,5",
        6 => "6,6",
        7 => "7,7",
        8 => "8,8",
        9 => "9,9",
        10 => "10,10",
        _ => "A,A",
    }
}

fn soft_label(card: u8) -> &'static str {
    match card {
        2 => "A,2",
        3 => "A,3",
        4 => "A,4",
        5 => "A,5",
        6 => "A,6",
        7 => "A,7",
        8 => "A,8",
        _ => "A,9",
    }
}

fn can_double(rules: &Rules, kind: u8, hard_total: u8, low_total: u8) -> bool {
    match rules.double_rule {
        0 => true,
        1 => kind != 1 && (9..=11).contains(&hard_total),
        2 => kind != 1 && (10..=11).contains(&hard_total),
        _ => {
            let constrained_total = if kind == 1 { low_total } else { hard_total };
            (9..=11).contains(&constrained_total)
        }
    }
}

fn double_or_hit(rules: &Rules, kind: u8, hard_total: u8, low_total: u8) -> Action {
    if can_double(rules, kind, hard_total, low_total) {
        Action::DoubleHit
    } else {
        Action::Hit
    }
}

fn double_or_stand(rules: &Rules, kind: u8, hard_total: u8, low_total: u8) -> Action {
    if can_double(rules, kind, hard_total, low_total) {
        Action::DoubleStand
    } else {
        Action::Stand
    }
}

fn base_hard(total: u8, dealer: u8, rules: &Rules) -> Action {
    match total {
        0..=8 => Action::Hit,
        9 => {
            if (3..=6).contains(&dealer) || (rules.h17 && dealer == 2 && rules.optimization > 0) {
                double_or_hit(rules, 0, 9, 9)
            } else {
                Action::Hit
            }
        }
        10 => {
            if (2..=9).contains(&dealer) {
                double_or_hit(rules, 0, 10, 10)
            } else {
                Action::Hit
            }
        }
        11 => {
            if dealer <= 10 || (rules.h17 && dealer == 11) {
                double_or_hit(rules, 0, 11, 11)
            } else {
                Action::Hit
            }
        }
        12 => {
            if (4..=6).contains(&dealer) {
                Action::Stand
            } else {
                Action::Hit
            }
        }
        13..=16 => {
            if (2..=6).contains(&dealer) {
                Action::Stand
            } else {
                Action::Hit
            }
        }
        _ => Action::Stand,
    }
}

fn base_soft(card: u8, dealer: u8, rules: &Rules) -> Action {
    let low_total = card + 1;
    let soft_total = card + 11;
    match card {
        2 | 3 => {
            if (5..=6).contains(&dealer) || (rules.h17 && dealer == 4 && rules.optimization > 0) {
                double_or_hit(rules, 1, soft_total, low_total)
            } else {
                Action::Hit
            }
        }
        4 | 5 => {
            if (4..=6).contains(&dealer) {
                double_or_hit(rules, 1, soft_total, low_total)
            } else {
                Action::Hit
            }
        }
        6 => {
            if (3..=6).contains(&dealer) || (rules.h17 && dealer == 2) {
                double_or_hit(rules, 1, soft_total, low_total)
            } else {
                Action::Hit
            }
        }
        7 => {
            if (3..=6).contains(&dealer) || (rules.optimization > 0 && dealer == 2) {
                double_or_stand(rules, 1, soft_total, low_total)
            } else if dealer == 2 || dealer == 7 || dealer == 8 {
                Action::Stand
            } else {
                Action::Hit
            }
        }
        8 => {
            if rules.h17 && dealer == 6 {
                double_or_stand(rules, 1, soft_total, low_total)
            } else {
                Action::Stand
            }
        }
        _ => Action::Stand,
    }
}

fn base_pair(card: u8, dealer: u8, rules: &Rules) -> Action {
    match card {
        11 => Action::Split,
        10 => Action::Stand,
        9 => {
            if (2..=6).contains(&dealer) || dealer == 8 || dealer == 9 {
                Action::Split
            } else {
                Action::Stand
            }
        }
        8 => Action::Split,
        7 => {
            if (2..=7).contains(&dealer) {
                Action::Split
            } else {
                Action::Hit
            }
        }
        6 => {
            if (3..=6).contains(&dealer) || (rules.das && dealer == 2) {
                Action::Split
            } else {
                Action::Hit
            }
        }
        5 => {
            if (2..=9).contains(&dealer) {
                double_or_hit(rules, 0, 10, 10)
            } else {
                Action::Hit
            }
        }
        4 => {
            if rules.das && (5..=6).contains(&dealer) {
                Action::Split
            } else {
                Action::Hit
            }
        }
        2 | 3 => {
            if (4..=7).contains(&dealer) || (rules.das && (2..=3).contains(&dealer)) {
                Action::Split
            } else {
                Action::Hit
            }
        }
        _ => Action::Hit,
    }
}

fn fallback_after_surrender(action: Action) -> Action {
    match action {
        Action::Stand | Action::DoubleStand | Action::SurrenderStand => Action::Stand,
        Action::Split => Action::Hit,
        _ => Action::Hit,
    }
}

fn apply_surrender(action: Action, kind: u8, value: u8, dealer: u8, rules: &Rules) -> Action {
    if rules.surrender == 0 {
        return action;
    }

    let hard_total = match kind {
        0 => value,
        2 => value.saturating_mul(2),
        _ => 0,
    };

    let wants_surrender = match rules.surrender {
        1 => {
            (hard_total == 16 && (dealer == 9 || dealer == 10 || dealer == 11))
                || (hard_total == 15 && (dealer == 10 || (rules.h17 && dealer == 11)))
                || (rules.h17 && hard_total == 17 && dealer == 11)
                || (rules.h17 && kind == 2 && value == 8 && dealer == 11)
        }
        2 => (14..=16).contains(&hard_total) && dealer == 10,
        _ => (14..=17).contains(&hard_total) && (dealer == 10 || dealer == 11),
    };

    if !wants_surrender {
        return action;
    }

    match fallback_after_surrender(action) {
        Action::Stand => Action::SurrenderStand,
        _ => Action::SurrenderHit,
    }
}

fn apply_no_peek_tax(action: Action, kind: u8, value: u8, dealer: u8, rules: &Rules) -> Action {
    let risk = match rules.peek {
        0 => false,
        1 => dealer == 10 || dealer == 11,
        2 => dealer == 10,
        _ => dealer == 10 || dealer == 11,
    };

    if !risk {
        return action;
    }

    match action {
        Action::DoubleHit => Action::Hit,
        Action::DoubleStand => Action::Stand,
        Action::Split if rules.peek != 3 && kind == 2 && value == 8 && dealer >= 10 => {
            if rules.surrender == 0 {
                Action::Hit
            } else {
                Action::SurrenderHit
            }
        }
        Action::Split if rules.peek != 3 && kind == 2 && value != 11 && dealer >= 10 => {
            if value == 10 {
                Action::Stand
            } else {
                Action::Hit
            }
        }
        _ => action,
    }
}

fn base_decision(kind: u8, value: u8, dealer: u8, rules: &Rules) -> Action {
    let raw = match kind {
        0 => base_hard(value, dealer, rules),
        1 => base_soft(value, dealer, rules),
        _ => base_pair(value, dealer, rules),
    };

    let surrendered = apply_surrender(raw, kind, value, dealer, rules);
    apply_no_peek_tax(surrendered, kind, value, dealer, rules)
}

fn split_allowed_for_index(card: u8, rules: &Rules) -> bool {
    if card == 11 {
        rules.rsa || rules.resplit_hands > 0
    } else {
        true
    }
}

fn index_play(kind: u8, value: u8, dealer: u8, rules: &Rules) -> Option<IndexPlay> {
    match kind {
        0 => match (value, dealer) {
            (16, 10) if rules.surrender == 0 => Some(IndexPlay {
                threshold: 0,
                direction: Direction::Gte,
                action: Action::Stand,
                family: "I18",
            }),
            (15, 10) if rules.surrender == 0 => Some(IndexPlay {
                threshold: 4,
                direction: Direction::Gte,
                action: Action::Stand,
                family: "I18",
            }),
            (10, 10) if can_double(rules, 0, 10, 10) => Some(IndexPlay {
                threshold: 4,
                direction: Direction::Gte,
                action: Action::DoubleHit,
                family: "I18",
            }),
            (10, 11) if can_double(rules, 0, 10, 10) => Some(IndexPlay {
                threshold: 4,
                direction: Direction::Gte,
                action: Action::DoubleHit,
                family: "I18",
            }),
            (11, 11) if can_double(rules, 0, 11, 11) => Some(IndexPlay {
                threshold: 1,
                direction: Direction::Gte,
                action: Action::DoubleHit,
                family: "I18",
            }),
            (9, 2) if can_double(rules, 0, 9, 9) => Some(IndexPlay {
                threshold: 1,
                direction: Direction::Gte,
                action: Action::DoubleHit,
                family: "I18",
            }),
            (9, 7) if can_double(rules, 0, 9, 9) => Some(IndexPlay {
                threshold: 3,
                direction: Direction::Gte,
                action: Action::DoubleHit,
                family: "I18",
            }),
            (12, 2) => Some(IndexPlay {
                threshold: 3,
                direction: Direction::Gte,
                action: Action::Stand,
                family: "I18",
            }),
            (12, 3) => Some(IndexPlay {
                threshold: 2,
                direction: Direction::Gte,
                action: Action::Stand,
                family: "I18",
            }),
            (12, 4) => Some(IndexPlay {
                threshold: -1,
                direction: Direction::Lte,
                action: Action::Hit,
                family: "I18",
            }),
            (12, 5) => Some(IndexPlay {
                threshold: -2,
                direction: Direction::Lte,
                action: Action::Hit,
                family: "I18",
            }),
            (12, 6) => Some(IndexPlay {
                threshold: -1,
                direction: Direction::Lte,
                action: Action::Hit,
                family: "I18",
            }),
            (13, 2) => Some(IndexPlay {
                threshold: -1,
                direction: Direction::Lte,
                action: Action::Hit,
                family: "I18",
            }),
            (13, 3) => Some(IndexPlay {
                threshold: -2,
                direction: Direction::Lte,
                action: Action::Hit,
                family: "I18",
            }),
            (14, 10) if rules.surrender != 0 => Some(IndexPlay {
                threshold: 3,
                direction: Direction::Gte,
                action: Action::SurrenderHit,
                family: "Fab4",
            }),
            (15, 9) if rules.surrender != 0 => Some(IndexPlay {
                threshold: 2,
                direction: Direction::Gte,
                action: Action::SurrenderHit,
                family: "Fab4",
            }),
            (15, 11) if rules.surrender != 0 && rules.h17 => Some(IndexPlay {
                threshold: 1,
                direction: Direction::Gte,
                action: Action::SurrenderHit,
                family: "Fab4",
            }),
            (16, 8) if rules.surrender != 0 => Some(IndexPlay {
                threshold: 4,
                direction: Direction::Gte,
                action: Action::SurrenderHit,
                family: "Fab4",
            }),
            _ => None,
        },
        1 => match (value, dealer) {
            (8, 6) if can_double(rules, 1, 19, 9) => Some(IndexPlay {
                threshold: 1,
                direction: Direction::Gte,
                action: Action::DoubleStand,
                family: "Soft",
            }),
            (7, 2) if can_double(rules, 1, 18, 8) => Some(IndexPlay {
                threshold: 1,
                direction: Direction::Gte,
                action: Action::DoubleStand,
                family: "Soft",
            }),
            _ => None,
        },
        _ => match (value, dealer) {
            (10, 5) if split_allowed_for_index(10, rules) => Some(IndexPlay {
                threshold: 5,
                direction: Direction::Gte,
                action: Action::Split,
                family: "I18",
            }),
            (10, 6) if split_allowed_for_index(10, rules) => Some(IndexPlay {
                threshold: 4,
                direction: Direction::Gte,
                action: Action::Split,
                family: "I18",
            }),
            (9, 7) if rules.optimization == 2 => Some(IndexPlay {
                threshold: 3,
                direction: Direction::Gte,
                action: Action::Split,
                family: "Risk",
            }),
            _ => None,
        },
    }
}

fn apply_index(action: Action, index: Option<IndexPlay>, true_count: i8) -> (Action, bool) {
    if let Some(play) = index {
        let active = match play.direction {
            Direction::Gte => true_count >= play.threshold,
            Direction::Lte => true_count <= play.threshold,
        };
        if active {
            return (play.action, true);
        }
    }
    (action, false)
}

fn estimate_cell_margin(action: Action, kind: u8, value: u8, dealer: u8, true_count: i8) -> i16 {
    let mut score = match action {
        Action::Stand | Action::SurrenderStand => {
            let total = if kind == 1 {
                value + 11
            } else if kind == 2 {
                value * 2
            } else {
                value
            };
            (total as i16 - dealer.min(10) as i16) * 16
        }
        Action::Hit | Action::SurrenderHit => {
            let total = if kind == 1 {
                value + 11
            } else if kind == 2 {
                value * 2
            } else {
                value
            };
            (17_i16 - total as i16) * 10 - (dealer.min(10) as i16 * 3)
        }
        Action::DoubleHit | Action::DoubleStand => 62 - (dealer.min(10) as i16 * 4),
        Action::Split => {
            let card_score = match value {
                11 | 8 => 84,
                9 | 7 => 48,
                2 | 3 | 6 => 26,
                _ => 12,
            };
            card_score - (dealer.min(10) as i16 * 2)
        }
    };
    score += true_count as i16 * 4;
    score.clamp(-220, 220)
}

fn metrics(rules: &Rules) -> Metrics {
    let mut edge = match rules.decks {
        1 => 0.11,
        2 => -0.24,
        4 => -0.40,
        5 => -0.44,
        6 => -0.46,
        _ => -0.49,
    };

    if rules.h17 {
        edge -= 0.21;
    }

    edge += match rules.double_rule {
        0 => 0.0,
        1 => -0.09,
        2 => -0.18,
        _ => -0.06,
    };

    if !rules.das {
        edge -= 0.12;
    }

    edge += match rules.peek {
        0 => 0.0,
        1 => -0.11,
        2 => -0.10,
        _ => -0.03,
    };

    edge += match rules.surrender {
        0 => 0.0,
        1 => {
            if rules.h17 {
                0.10
            } else {
                0.07
            }
        }
        2 => 0.23,
        _ => {
            if rules.h17 {
                0.72
            } else {
                0.63
            }
        }
    };

    edge += match rules.resplit_hands {
        3 => 0.04,
        4 => 0.06,
        _ => 0.0,
    };
    if rules.rsa {
        edge += 0.04;
    }
    if rules.hsa {
        edge += 0.18;
    }

    edge += match rules.charlie {
        5 => 0.30,
        6 => 0.16,
        7 => 0.01,
        _ => 0.0,
    };

    edge += match rules.blackjack_pay {
        0 => 0.0,
        1 => -1.36,
        2 => 2.27,
        _ => -2.27,
    };

    edge += match rules.optimization {
        0 => 0.0,
        1 => 0.006,
        _ => 0.020,
    };

    let mut stdev = match rules.decks {
        1 => 1.151,
        2 => 1.144,
        _ => 1.140,
    };
    if rules.blackjack_pay == 2 {
        stdev += 0.034;
    }
    if rules.surrender != 0 {
        stdev -= 0.012;
    }
    if !rules.das {
        stdev -= 0.014;
    }
    if rules.peek == 1 {
        stdev -= 0.020;
    }
    if rules.double_rule == 2 {
        stdev -= 0.040;
    }

    Metrics {
        player_edge_pct: edge,
        house_edge_pct: -edge,
        stdev_per_hand: stdev,
        stdev_per_wager: stdev / 1.065,
        combos_supported: 6 * 2 * 4 * 2 * 4 * 4 * 3 * 2 * 2 * 4 * 4 * 3,
        cells_per_chart: 28 * 10,
    }
}

fn push_bool(out: &mut String, value: bool) {
    out.push_str(if value { "true" } else { "false" });
}

fn push_u32(out: &mut String, mut value: u32) {
    if value == 0 {
        out.push('0');
        return;
    }

    let mut digits = [0u8; 10];
    let mut len = 0usize;
    while value > 0 {
        digits[len] = b'0' + (value % 10) as u8;
        value /= 10;
        len += 1;
    }
    while len > 0 {
        len -= 1;
        out.push(digits[len] as char);
    }
}

fn push_i32(out: &mut String, value: i32) {
    if value < 0 {
        out.push('-');
        push_u32(out, value.unsigned_abs());
    } else {
        push_u32(out, value as u32);
    }
}

fn push_f32_3(out: &mut String, value: f32) {
    let scaled = (value * 1000.0).round() as i32;
    if scaled < 0 {
        out.push('-');
    }
    let abs = scaled.unsigned_abs();
    let whole = abs / 1000;
    let decimals = abs % 1000;
    push_u32(out, whole);
    out.push('.');
    out.push(char::from(b'0' + ((decimals / 100) % 10) as u8));
    out.push(char::from(b'0' + ((decimals / 10) % 10) as u8));
    out.push(char::from(b'0' + (decimals % 10) as u8));
}

fn push_rule_json(out: &mut String, rules: &Rules, true_count: i8) {
    out.push_str("\"rules\":{\"decks\":");
    push_u32(out, rules.decks as u32);
    out.push_str(",\"h17\":");
    push_bool(out, rules.h17);
    out.push_str(",\"doubleRule\":");
    push_u32(out, rules.double_rule as u32);
    out.push_str(",\"das\":");
    push_bool(out, rules.das);
    out.push_str(",\"surrender\":");
    push_u32(out, rules.surrender as u32);
    out.push_str(",\"peek\":");
    push_u32(out, rules.peek as u32);
    out.push_str(",\"resplitHands\":");
    push_u32(out, rules.resplit_hands as u32);
    out.push_str(",\"rsa\":");
    push_bool(out, rules.rsa);
    out.push_str(",\"hsa\":");
    push_bool(out, rules.hsa);
    out.push_str(",\"charlie\":");
    push_u32(out, rules.charlie as u32);
    out.push_str(",\"blackjackPay\":");
    push_u32(out, rules.blackjack_pay as u32);
    out.push_str(",\"optimization\":");
    push_u32(out, rules.optimization as u32);
    out.push_str(",\"trueCount\":");
    push_i32(out, true_count as i32);
    out.push('}');
}

fn push_cell_json(
    out: &mut String,
    kind: u8,
    value: u8,
    dealer: u8,
    rules: &Rules,
    true_count: i8,
) {
    let base = base_decision(kind, value, dealer, rules);
    let index = index_play(kind, value, dealer, rules);
    let (action, active) = apply_index(base, index, true_count);
    let margin = estimate_cell_margin(action, kind, value, dealer, true_count);

    out.push_str("{\"dealer\":\"");
    out.push_str(dealer_label(dealer));
    out.push_str("\",\"a\":\"");
    out.push_str(action_code(action));
    out.push_str("\",\"b\":\"");
    out.push_str(action_code(base));
    out.push_str("\",\"m\":");
    push_i32(out, margin as i32);
    out.push_str(",\"x\":");
    push_bool(out, active);

    if let Some(play) = index {
        out.push_str(",\"i\":");
        push_i32(out, play.threshold as i32);
        out.push_str(",\"ia\":\"");
        out.push_str(action_code(play.action));
        out.push_str("\",\"idir\":\"");
        out.push_str(direction_code(play.direction));
        out.push_str("\",\"if\":\"");
        out.push_str(play.family);
        out.push('"');
    }

    out.push('}');
}

fn push_row_json(out: &mut String, kind: u8, value: u8, rules: &Rules, true_count: i8) {
    let (id_prefix, label) = match kind {
        0 => ("hard", hard_label(value)),
        1 => ("soft", soft_label(value)),
        _ => ("pair", pair_label(value)),
    };

    out.push_str("{\"id\":\"");
    out.push_str(id_prefix);
    out.push('-');
    push_u32(out, value as u32);
    out.push_str("\",\"kind\":\"");
    out.push_str(id_prefix);
    out.push_str("\",\"label\":\"");
    out.push_str(label);
    out.push_str("\",\"cells\":[");

    for (index, dealer) in DEALERS.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        push_cell_json(out, kind, value, *dealer, rules, true_count);
    }

    out.push_str("]}");
}

pub fn solve_chart_json(
    decks: u8,
    h17: u8,
    double_rule: u8,
    das: u8,
    surrender: u8,
    peek: u8,
    resplit_hands: u8,
    rsa: u8,
    hsa: u8,
    charlie: u8,
    blackjack_pay: u8,
    optimization: u8,
    true_count: i8,
) -> String {
    let rules = Rules::from_inputs(
        decks,
        h17,
        double_rule,
        das,
        surrender,
        peek,
        resplit_hands,
        rsa,
        hsa,
        charlie,
        blackjack_pay,
        optimization,
    );
    let metric = metrics(&rules);
    let mut out = String::with_capacity(36_000);

    out.push_str("{\"version\":\"0.1.0\",");
    push_rule_json(&mut out, &rules, true_count);
    out.push_str(",\"dealer\":[");
    for (index, dealer) in DEALERS.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        out.push('"');
        out.push_str(dealer_label(*dealer));
        out.push('"');
    }
    out.push_str("],\"rows\":[");

    let hard_rows = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    for (row_index, total) in hard_rows.iter().enumerate() {
        if row_index > 0 {
            out.push(',');
        }
        push_row_json(&mut out, 0, *total, &rules, true_count);
    }

    for card in 2..=9 {
        out.push(',');
        push_row_json(&mut out, 1, card, &rules, true_count);
    }

    let pair_rows = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for card in pair_rows {
        out.push(',');
        push_row_json(&mut out, 2, card, &rules, true_count);
    }

    out.push_str("],\"metrics\":{\"playerEdgePct\":");
    push_f32_3(&mut out, metric.player_edge_pct);
    out.push_str(",\"houseEdgePct\":");
    push_f32_3(&mut out, metric.house_edge_pct);
    out.push_str(",\"stdevPerHand\":");
    push_f32_3(&mut out, metric.stdev_per_hand);
    out.push_str(",\"stdevPerWager\":");
    push_f32_3(&mut out, metric.stdev_per_wager);
    out.push_str(",\"combosSupported\":");
    push_u32(&mut out, metric.combos_supported);
    out.push_str(",\"cellsPerChart\":");
    push_u32(&mut out, metric.cells_per_chart as u32);
    out.push('}');

    out.push_str(",\"legend\":[");
    out.push_str("{\"code\":\"H\",\"label\":\"Hit\"},");
    out.push_str("{\"code\":\"S\",\"label\":\"Stand\"},");
    out.push_str("{\"code\":\"D\",\"label\":\"Double if possible, otherwise hit\"},");
    out.push_str("{\"code\":\"Ds\",\"label\":\"Double if possible, otherwise stand\"},");
    out.push_str("{\"code\":\"P\",\"label\":\"Split pair\"},");
    out.push_str("{\"code\":\"Rh\",\"label\":\"Surrender if possible, otherwise hit\"},");
    out.push_str("{\"code\":\"Rs\",\"label\":\"Surrender if possible, otherwise stand\"}");
    out.push_str("]}");

    out
}

static mut LAST_LEN: usize = 0;

#[no_mangle]
pub extern "C" fn solve_chart(
    decks: u8,
    h17: u8,
    double_rule: u8,
    das: u8,
    surrender: u8,
    peek: u8,
    resplit_hands: u8,
    rsa: u8,
    hsa: u8,
    charlie: u8,
    blackjack_pay: u8,
    optimization: u8,
    true_count: i8,
) -> *mut u8 {
    let mut bytes = solve_chart_json(
        decks,
        h17,
        double_rule,
        das,
        surrender,
        peek,
        resplit_hands,
        rsa,
        hsa,
        charlie,
        blackjack_pay,
        optimization,
        true_count,
    )
    .into_bytes();

    let ptr = bytes.as_mut_ptr();
    unsafe {
        LAST_LEN = bytes.len();
    }
    std::mem::forget(bytes);
    ptr
}

#[no_mangle]
pub extern "C" fn last_result_len() -> usize {
    unsafe { LAST_LEN }
}

#[no_mangle]
pub extern "C" fn free_result(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    unsafe {
        drop(Vec::from_raw_parts(ptr, len, len));
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub fn benchmark_json(iterations: usize) -> String {
    let loops = iterations.max(1);
    let start = std::time::Instant::now();
    let mut bytes = 0usize;
    for i in 0..loops {
        let decks = [1, 2, 4, 5, 6, 8][i % 6];
        let h17 = (i % 2) as u8;
        let double_rule = (i % 4) as u8;
        let das = ((i / 3) % 2) as u8;
        let surrender = (i % 4) as u8;
        let peek = ((i / 5) % 4) as u8;
        let resplit_hands = [0, 3, 4][i % 3];
        let rsa = ((i / 7) % 2) as u8;
        let hsa = ((i / 11) % 2) as u8;
        let charlie = [0, 5, 6, 7][i % 4];
        let blackjack_pay = ((i / 13) % 4) as u8;
        let optimization = (i % 3) as u8;
        let true_count = (i as i8 % 13) - 6;
        bytes += solve_chart_json(
            decks,
            h17,
            double_rule,
            das,
            surrender,
            peek,
            resplit_hands,
            rsa,
            hsa,
            charlie,
            blackjack_pay,
            optimization,
            true_count,
        )
        .len();
    }
    let elapsed = start.elapsed();
    let seconds = elapsed.as_secs_f64().max(0.000_001);
    let charts_per_second = loops as f64 / seconds;
    let cells_per_second = charts_per_second * 280.0;
    let avg_us = seconds * 1_000_000.0 / loops as f64;

    format!(
        "{{\"engine\":\"blackjack_solver\",\"version\":\"0.1.0\",\"iterations\":{},\"elapsedMs\":{:.3},\"avgChartUs\":{:.3},\"chartsPerSecond\":{:.1},\"cellsPerSecond\":{:.1},\"avgJsonBytes\":{},\"wasmTarget\":\"wasm32-unknown-unknown\",\"chartCells\":280,\"supportedRuleCombos\":884736}}",
        loops,
        seconds * 1000.0,
        avg_us,
        charts_per_second,
        cells_per_second,
        bytes / loops
    )
}
