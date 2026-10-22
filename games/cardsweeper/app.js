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

var players = 3
var chips = []
var hands = []
const cardsInHand = 7
for (let i = 0; i < players; i++) {
    chips.push(-cardsInHand)
    hands.push([])
    for (let j = 0; j < cardsInHand; j++) {
        hands[i].push([deck.pop(), 1])
    }
}

var pTurn = -1
function turn() {
    printInfo()
    prevCard = ""
    stash = 0
    pTurn = (pTurn + 1) % players
    console.log("Player " + (pTurn + 1) + "'s Turn (use 'reveal(num)')")
}

var prevCard = ""
var stash = 0
function reveal(num) {
    let nextP = 0
    while (true) {
        if (hands[pTurn + nextP].length === 0) {
            nextP++
            if (pTurn + nextP >= players) {
                nextP -= players
            }
            if (nextP === 0) {
                console.log("No more cards left")
                return
            }
        } else {
            break
        }
    }
    revealHand = pTurn + nextP
    if (num >= hands[revealHand].length) {
        console.log(num + " is out of bounds, must be less than " + hands[revealHand].length)
        return
    }
    card = hands[revealHand].splice(num, 1)[0]
    stash += card[1]
    console.log(card[0] + " revealed (+" + card[1] + "), Stash: " + stash)
    card = card[0]
    if (["J", "Q", "K", "A"].includes(card[0])) {
        if (card[0] === "A" || ["J", "Q", "K"].includes(prevCard[0])) {
            console.log("You hit a bomb! Chips will be distributed")
            hitBomb(revealHand)
            return
        }
        console.log("Would you like to stop? (use 'stop()' to stop)")
    }
    prevCard = card
    let count = 0
    for (hand in hands) {
        count += hand.length
    }
    if (count === 0) {
        stop(true)
    }
}

function stop(force = false) {
    if (["J", "Q", "K"].includes(prevCard[0]) || force) {
        chips[pTurn] += stash
        turn()
        return
    }
    console.log("You can only stop on a face card")
}

function hitBomb(p) {
    while (stash > 0) {
        p = (p + 1) % players
        if (hands[p].length !== 0) {
            hands[p][Math.floor(Math.random() * hands[p].length)][1]++
            stash--
        }
    }
    turn()
}

function printInfo(printHands = false) {
    let i = 0
    for (hand of hands) {
        i++
        let str = "Player " + i + " Chips: " + chips[i - 1]
        if (printHands) {
            str += " | "
            for (card of hand) {
                str += "(" + card[0] + ", " + card[1] + "), "
            }
            str = str.substr(0, str.length - 2)
        }
        console.log(str)
    }
}

turn()