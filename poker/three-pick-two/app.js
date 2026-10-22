startTime = new Date();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

var ranksArr = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"]
var suitsArr = ["s", "h", "d", "c"]
var deck = []
var hands = []
var matchups = []

function shuffleDeck(shuffle = true) {
    deck = []
    for (rank of ranksArr) {
        for (suit of suitsArr) {
            deck.push(rank + suit)
        }
    }
    if (shuffle) {
        shuffleArray(deck)
    }
}
function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

shuffleDeck(false)
for (let i = 0; i < 52; i++) {
    for (let j = i + 1; j < 52; j++) {
        hands.push(deck[i] + deck[j])
    }
}

function noDuplicateCards(hand0, hand1) {
    hand0c0 = hand0[0] + hand0[1]
    hand0c1 = hand0[2] + hand0[3]
    hand1c0 = hand1[0] + hand1[1]
    hand1c1 = hand1[2] + hand1[3]
    if (hand0c0 === hand1c0 || hand0c0 === hand1c1 || hand0c1 === hand1c0 || hand0c1 === hand1c1) {
        return false
    }
    return true
}

function noDuplicateMatchup(hand0, hand1) {
    let suits = []
    suits.push(hand0[1])
    suits.push(hand0[3])
    suits.push(hand1[1])
    suits.push(hand1[3])
    let uniqueSuits = new Set(suits).size
    let suitsSorted = suits.slice()
    suitsSorted.sort().reverse()
    if (uniqueSuits === 4) {
        if (suits.every((val, index) => val === suitsSorted[index])) {
            return true
        }
    } else if (uniqueSuits === 3) {
        if (suits.includes("c")) {
            return false
        }
        if (suits[0] === "s" && (suits[1] === "s" && suits[2] === "h" || suits[1] === "h")) {
            return true
        }
    } else if (uniqueSuits === 2) {
        if (suits.includes("d") || suits.includes("c")) {
            return false
        }
        if (suits[0] === "s") {
            return true
        }
    } else {
        if (suits[0] === "s") {
            return true
        }
    }
    return false
}

for (hand0 of hands) {
    for (hand1 of hands) {
        if (noDuplicateCards(hand0, hand1) && noDuplicateMatchup(hand0, hand1)) {
            matchups.push(hand0 + " " + hand1)
        }
    }
}

// Matchup generation is retained for the original research experiment.

function getEquity(matchup) {
    let total = 0
    let won = 0
    let hand0c0 = matchup[0] + matchup[1]
    let hand0c1 = matchup[2] + matchup[3]
    let hand1c0 = matchup[5] + matchup[6]
    let hand1c1 = matchup[7] + matchup[8]
    shuffleDeck(false)
    deck.splice(deck.indexOf(hand0c0), 1)
    deck.splice(deck.indexOf(hand0c1), 1)
    deck.splice(deck.indexOf(hand1c0), 1)
    deck.splice(deck.indexOf(hand1c1), 1)
    newDeck = deck
    /*
    for (let c0 = 0; c0 < deck.length - 4; c0++) {
        for (let c1 = c0 + 1; c1 < deck.length; c1++) {
            for (let c2 = c1 + 1; c2 < deck.length; c2++) {
                for (let c3 = c2 + 1; c3 < deck.length; c3++) {
                    for (let c4 = c3 + 1; c4 < deck.length; c4++) {
                        let board = [deck[c0], deck[c1], deck[c2], deck[c3], deck[c4]]
                        let hand0 = Hand.solve([hand0c0, hand0c1].concat(board))
                        let hand1 = Hand.solve([hand1c0, hand1c1].concat(board))
                        let winner = Hand.winners([hand0, hand1])
                        if (winner) {
                            won++
                        }
                        total++
                        if (total % 1000000 === 0) {
                            console.log(total)
                        }
                    }
                }
            }
        }
    }*/
    iterations = 10000
    for (let i = 0; i < iterations; i++) {
        deck = newDeck.slice()
        let board = [deck.splice(Math.floor(Math.random() * deck.length), 1)[0], deck.splice(Math.floor(Math.random() * deck.length), 1)[0], deck.splice(Math.floor(Math.random() * deck.length), 1)[0], deck.splice(Math.floor(Math.random() * deck.length), 1)[0], deck.splice(Math.floor(Math.random() * deck.length), 1)[0]]
        let hand0 = evaluateCards([hand0c0, hand0c1].concat(board))
        let hand1 = evaluateCards([hand1c0, hand1c1].concat(board))
        let tie = hand0 === hand1
        let win = hand0 < hand1
        if (tie) {
            won += 0.5
        }
        if (win) {
            won++
        }
        total++
    }
    return Math.round(won / total * 1000) / 1000
}

// The original page was unfinished and ran a long benchmark automatically.
// Make its experiment explicit and keep the UI responsive before sampling.
document.getElementById("sample-equity").addEventListener("click", async function () {
    this.disabled = true;
    const output = document.getElementById("equity-output");
    output.textContent = "Sampling 10,000 boards…";
    await sleep(30);
    try {
        const matchup = "AsAh KsKh";
        output.textContent = "As Ah vs Ks Kh: " + (getEquity(matchup) * 100).toFixed(1) + "% estimated equity for aces (10,000 random boards; results vary).";
    } catch (error) { output.textContent = "The archived evaluator could not complete this experiment: " + error.message; }
    this.disabled = false;
});
