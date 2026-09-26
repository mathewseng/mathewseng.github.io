/**
 * Poker Hand Evaluation for Ultimate Omaha
 * Handles Omaha rules: must use exactly 2 hole cards + 3 board cards
 */

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c']; // spades, hearts, diamonds, clubs
const SUIT_SYMBOLS = { 's': '♠', 'h': '♥', 'd': '♦', 'c': '♣' };

// Hand rankings
const HAND_RANKS = {
    HIGH_CARD: 0,
    PAIR: 1,
    TWO_PAIR: 2,
    THREE_OF_A_KIND: 3,
    STRAIGHT: 4,
    FLUSH: 5,
    FULL_HOUSE: 6,
    FOUR_OF_A_KIND: 7,
    STRAIGHT_FLUSH: 8,
    ROYAL_FLUSH: 9
};

// Simple hand names for display
const HAND_NAMES = {
    [HAND_RANKS.HIGH_CARD]: 'High Card',
    [HAND_RANKS.PAIR]: 'Pair',
    [HAND_RANKS.TWO_PAIR]: 'Two Pair',
    [HAND_RANKS.THREE_OF_A_KIND]: 'Trips',
    [HAND_RANKS.STRAIGHT]: 'Straight',
    [HAND_RANKS.FLUSH]: 'Flush',
    [HAND_RANKS.FULL_HOUSE]: 'Boat',
    [HAND_RANKS.FOUR_OF_A_KIND]: 'Quads',
    [HAND_RANKS.STRAIGHT_FLUSH]: 'Straight Flush',
    [HAND_RANKS.ROYAL_FLUSH]: 'Royal Flush'
};

// Multipliers for payouts
const MULTIPLIERS = {
    [HAND_RANKS.HIGH_CARD]: 1,
    [HAND_RANKS.PAIR]: 1,
    [HAND_RANKS.TWO_PAIR]: 1,
    [HAND_RANKS.THREE_OF_A_KIND]: 1,
    [HAND_RANKS.STRAIGHT]: 2,
    [HAND_RANKS.FLUSH]: 2,
    [HAND_RANKS.FULL_HOUSE]: 3,
    [HAND_RANKS.FOUR_OF_A_KIND]: 4,
    [HAND_RANKS.STRAIGHT_FLUSH]: 5,
    [HAND_RANKS.ROYAL_FLUSH]: 10
};

/**
 * Create a deck of 52 cards
 */
function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ rank, suit });
        }
    }
    return deck;
}

/**
 * Shuffle deck using Fisher-Yates algorithm
 */
function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Get rank value (2=0, 3=1, ..., A=12)
 */
function getRankValue(rank) {
    return RANKS.indexOf(rank);
}

/**
 * Get combinations of k elements from array
 */
function combinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    
    const result = [];
    const first = arr[0];
    const rest = arr.slice(1);
    
    // Combinations that include first element
    for (const combo of combinations(rest, k - 1)) {
        result.push([first, ...combo]);
    }
    
    // Combinations that don't include first element
    for (const combo of combinations(rest, k)) {
        result.push(combo);
    }
    
    return result;
}

/**
 * Check if 5 cards form a flush
 */
function isFlush(cards) {
    const suit = cards[0].suit;
    return cards.every(c => c.suit === suit);
}

/**
 * Check if 5 cards form a straight, returns high card rank value or -1
 */
function getStraightHighCard(cards) {
    const values = cards.map(c => getRankValue(c.rank)).sort((a, b) => a - b);
    
    // Check for wheel (A-2-3-4-5)
    if (values[0] === 0 && values[1] === 1 && values[2] === 2 && 
        values[3] === 3 && values[4] === 12) {
        return 3; // 5-high straight
    }
    
    // Check for regular straight
    for (let i = 1; i < values.length; i++) {
        if (values[i] !== values[i - 1] + 1) {
            return -1;
        }
    }
    
    return values[4]; // High card of the straight
}

/**
 * Get rank counts from 5 cards
 */
function getRankCounts(cards) {
    const counts = {};
    for (const card of cards) {
        counts[card.rank] = (counts[card.rank] || 0) + 1;
    }
    return counts;
}

/**
 * Evaluate a 5-card hand
 * Returns { rank: HAND_RANKS.X, value: [comparison values], name: string, cards: [...] }
 */
function evaluate5CardHand(cards) {
    const isFlushHand = isFlush(cards);
    const straightHigh = getStraightHighCard(cards);
    const isStraight = straightHigh >= 0;
    const rankCounts = getRankCounts(cards);
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    
    // Get ranks sorted by count, then by rank value
    const ranksByCount = Object.entries(rankCounts)
        .sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            return getRankValue(b[0]) - getRankValue(a[0]);
        })
        .map(e => e[0]);
    
    // Straight Flush / Royal Flush
    if (isFlushHand && isStraight) {
        if (straightHigh === 12) { // Ace-high straight flush
            return {
                rank: HAND_RANKS.ROYAL_FLUSH,
                value: [straightHigh],
                name: 'Royal Flush',
                cards
            };
        }
        return {
            rank: HAND_RANKS.STRAIGHT_FLUSH,
            value: [straightHigh],
            name: 'Straight Flush',
            cards
        };
    }
    
    // Four of a Kind
    if (counts[0] === 4) {
        const quadRank = ranksByCount[0];
        const kicker = ranksByCount[1];
        return {
            rank: HAND_RANKS.FOUR_OF_A_KIND,
            value: [getRankValue(quadRank), getRankValue(kicker)],
            name: 'Quads',
            cards
        };
    }
    
    // Full House
    if (counts[0] === 3 && counts[1] === 2) {
        const tripRank = ranksByCount[0];
        const pairRank = ranksByCount[1];
        return {
            rank: HAND_RANKS.FULL_HOUSE,
            value: [getRankValue(tripRank), getRankValue(pairRank)],
            name: 'Boat',
            cards
        };
    }
    
    // Flush
    if (isFlushHand) {
        const values = cards.map(c => getRankValue(c.rank)).sort((a, b) => b - a);
        return {
            rank: HAND_RANKS.FLUSH,
            value: values,
            name: 'Flush',
            cards
        };
    }
    
    // Straight
    if (isStraight) {
        return {
            rank: HAND_RANKS.STRAIGHT,
            value: [straightHigh],
            name: 'Straight',
            cards
        };
    }
    
    // Three of a Kind
    if (counts[0] === 3) {
        const tripRank = ranksByCount[0];
        const kickers = ranksByCount.slice(1).map(r => getRankValue(r)).sort((a, b) => b - a);
        return {
            rank: HAND_RANKS.THREE_OF_A_KIND,
            value: [getRankValue(tripRank), ...kickers],
            name: 'Trips',
            cards
        };
    }
    
    // Two Pair
    if (counts[0] === 2 && counts[1] === 2) {
        const pairs = ranksByCount.slice(0, 2).sort((a, b) => getRankValue(b) - getRankValue(a));
        const kicker = ranksByCount[2];
        return {
            rank: HAND_RANKS.TWO_PAIR,
            value: [getRankValue(pairs[0]), getRankValue(pairs[1]), getRankValue(kicker)],
            name: 'Two Pair',
            cards
        };
    }
    
    // One Pair
    if (counts[0] === 2) {
        const pairRank = ranksByCount[0];
        const kickers = ranksByCount.slice(1).map(r => getRankValue(r)).sort((a, b) => b - a);
        return {
            rank: HAND_RANKS.PAIR,
            value: [getRankValue(pairRank), ...kickers],
            name: 'Pair',
            cards
        };
    }
    
    // High Card
    const values = cards.map(c => getRankValue(c.rank)).sort((a, b) => b - a);
    const highCard = RANKS[values[0]];
    return {
        rank: HAND_RANKS.HIGH_CARD,
        value: values,
        name: `${highCard} High`,
        cards
    };
}

/**
 * Compare two hands
 * Returns positive if hand1 > hand2, negative if hand1 < hand2, 0 if equal
 */
function compareHands(hand1, hand2) {
    if (hand1.rank !== hand2.rank) {
        return hand1.rank - hand2.rank;
    }
    
    // Compare values
    for (let i = 0; i < hand1.value.length; i++) {
        if (hand1.value[i] !== hand2.value[i]) {
            return hand1.value[i] - hand2.value[i];
        }
    }
    
    return 0;
}

/**
 * Evaluate best Omaha hand (exactly 2 hole cards + 3 board cards)
 * Returns the best possible hand
 */
function evaluateOmahaHand(holeCards, boardCards) {
    let bestHand = null;
    
    // Get all combinations of 2 hole cards
    const holeCombos = combinations(holeCards, 2);
    
    // Get all combinations of 3 board cards
    const boardCombos = combinations(boardCards, 3);
    
    // Try all combinations
    for (const holeCombo of holeCombos) {
        for (const boardCombo of boardCombos) {
            const fiveCards = [...holeCombo, ...boardCombo];
            const hand = evaluate5CardHand(fiveCards);
            hand.holeCardsUsed = holeCombo;
            hand.boardCardsUsed = boardCombo;
            
            if (!bestHand || compareHands(hand, bestHand) > 0) {
                bestHand = hand;
            }
        }
    }
    
    return bestHand;
}

/**
 * Check if a hand qualifies (pair of aces or better)
 * Pair of Aces means: at minimum a pair, and if it's just a pair, it must be Aces
 */
function doesHandQualify(hand) {
    // Two pair or better always qualifies
    if (hand.rank >= HAND_RANKS.TWO_PAIR) {
        return true;
    }
    
    // Only a pair of Aces qualifies among single pairs
    if (hand.rank === HAND_RANKS.PAIR) {
        // Check if it's a pair of Aces
        return hand.value[0] === 12; // Ace is rank 12
    }
    
    // High card doesn't qualify
    return false;
}

/**
 * Get multiplier for a hand
 */
function getMultiplier(hand) {
    return MULTIPLIERS[hand.rank];
}

/**
 * Calculate total multiplier for both boards
 */
function calculateTotalMultiplier(hand1, hand2) {
    return getMultiplier(hand1) * getMultiplier(hand2);
}

/**
 * Format a card for display
 */
function formatCard(card) {
    return {
        rank: card.rank === 'T' ? '10' : card.rank,
        suit: SUIT_SYMBOLS[card.suit],
        isRed: card.suit === 'h' || card.suit === 'd',
        original: card
    };
}

/**
 * Get card ID for comparison
 */
function getCardId(card) {
    return `${card.rank}${card.suit}`;
}

// Export for use in other modules
window.Poker = {
    RANKS,
    SUITS,
    SUIT_SYMBOLS,
    HAND_RANKS,
    HAND_NAMES,
    MULTIPLIERS,
    createDeck,
    shuffleDeck,
    getRankValue,
    combinations,
    evaluate5CardHand,
    evaluateOmahaHand,
    compareHands,
    doesHandQualify,
    getMultiplier,
    calculateTotalMultiplier,
    formatCard,
    getCardId
};

