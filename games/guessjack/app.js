var deck = []
ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]
suits = ["c", "d", "h", "s"]
for (suit of suits) {
    for (rank of ranks) {
        deck.push(rank + suit)
    }
}
function shuffle(array) {
    let currentIndex = array.length, randomIndex
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex)
        currentIndex--
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
    }
    return array;
}
deck = shuffle(deck)

const players = 2
var chips = []
var points = []
for (var i = 0; i < players; i++) {
    chips.push(0)
    points.push(0)
}

var playerTurn = 1
function turn() {

    //playerTurn = playerTurn % players + 1
}

function guess() {

}

// The unfinished game had an empty infinite loop here; keep this archived setup safe to inspect.
