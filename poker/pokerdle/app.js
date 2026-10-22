// TODO:
// list button
// -- button to show/hide only possible words
// stats button
// - similar to wordle
// settings button?
// daily word

const pokerWords = [
    "added",
    "addon",
    "aggro",
    "allin",
    "angle",
    "antes",
    "asian",
    "backs",
    "balls",
    "bands",
    "banks",
    "beats",
    "begin",
    "belly",
    "bends",
    "benji",
    "bills",
    "binks",
    "black",
    "blank",
    "blast",
    "bleed",
    "blind",
    "block",
    "blows",
    "bluff",
    "board",
    "boats",
    "bombs",
    "brain",
    "break",
    "brick",
    "bring",
    "broke",
    "bucks",
    "bully",
    "burns",
    "burnt",
    "busto",
    "busts",
    "buyer",
    "buyin",
    "calls",
    "cards",
    "catch",
    "cbets",
    "cents",
    "champ",
    "chase",
    "cheat",
    "check",
    "chips",
    "chops",
    "chunk",
    "clean",
    "click",
    "climb",
    "clock",
    "clubs",
    "color",
    "combo",
    "cools",
    "count",
    "crabs",
    "crack",
    "cycle",
    "deals",
    "dealt",
    "death",
    "degen",
    "delay",
    "depth",
    "deuce",
    "dimes",
    "dirty",
    "dnegs",
    "dodge",
    "donks",
    "doubt",
    "doyle",
    "drawn",
    "draws",
    "drawy",
    "drown",
    "ducks",
    "early",
    "eight",
    "enter",
    "error",
    "event",
    "exits",
    "faced",
    "faces",
    "favor",
    "felts",
    "field",
    "fifth",
    "fifty",
    "fight",
    "fills",
    "final",
    "fired",
    "fires",
    "first",
    "fishy",
    "fives",
    "flake",
    "flash",
    "flats",
    "flips",
    "float",
    "flops",
    "flush",
    "focus",
    "folds",
    "force",
    "fours",
    "freer",
    "freqs",
    "front",
    "funds",
    "games",
    "giant",
    "gifts",
    "goods",
    "grabs",
    "grand",
    "greed",
    "greek",
    "green",
    "grind",
    "guide",
    "gypsy",
    "hands",
    "heads",
    "heart",
    "heats",
    "heavy",
    "hides",
    "highs",
    "holds",
    "holes",
    "hooks",
    "horse",
    "hosts",
    "house",
    "hundo",
    "hunts",
    "idiot",
    "image",
    "imply",
    "jacks",
    "joker",
    "kicks",
    "kills",
    "kings",
    "knock",
    "large",
    "lasts",
    "later",
    "leads",
    "leaks",
    "least",
    "leave",
    "legal",
    "level",
    "light",
    "limit",
    "limps",
    "lines",
    "loads",
    "locks",
    "lodge",
    "looks",
    "loose",
    "loser",
    "loses",
    "lower",
    "lucky",
    "lying",
    "magic",
    "match",
    "merge",
    "micro",
    "milky",
    "miner",
    "mines",
    "minus",
    "mixed",
    "money",
    "moves",
    "mucks",
    "multi",
    "night",
    "nines",
    "nitty",
    "north",
    "nutty",
    "ocean",
    "often",
    "omaha",
    "opens",
    "orbit",
    "outer",
    "overs",
    "paint",
    "pairs",
    "payer",
    "penny",
    "place",
    "plays",
    "plohi",
    "poker",
    "polar",
    "posts",
    "prays",
    "preys",
    "price",
    "prize",
    "probe",
    "props",
    "pulls",
    "punts",
    "purse",
    "quads",
    "queen",
    "quick",
    "quits",
    "races",
    "racks",
    "rails",
    "raise",
    "rakes",
    "range",
    "ranks",
    "rates",
    "ratio",
    "reads",
    "rebuy",
    "repop",
    "rhode",
    "right",
    "rings",
    "river",
    "rocks",
    "rolls",
    "rooms",
    "round",
    "royal",
    "rules",
    "saves",
    "scams",
    "scare",
    "scoop",
    "sells",
    "sense",
    "setup",
    "seven",
    "shark",
    "shill",
    "shoot",
    "short",
    "shots",
    "shove",
    "shows",
    "sixes",
    "sixty",
    "sized",
    "sizes",
    "skill",
    "sleep",
    "slick",
    "slide",
    "slows",
    "small",
    "smell",
    "snaps",
    "sniff",
    "solve",
    "south",
    "space",
    "spade",
    "speak",
    "speed",
    "spend",
    "spent",
    "spike",
    "spins",
    "split",
    "sport",
    "stabs",
    "stack",
    "stake",
    "stall",
    "stand",
    "stare",
    "stars",
    "start",
    "stays",
    "steal",
    "steam",
    "steel",
    "stick",
    "stiff",
    "stole",
    "stone",
    "stuck",
    "studs",
    "study",
    "sucks",
    "suits",
    "super",
    "sweat",
    "sweet",
    "swing",
    "table",
    "taint",
    "takes",
    "tanks",
    "teeny",
    "tells",
    "texas",
    "thick",
    "think",
    "thins",
    "third",
    "three",
    "throw",
    "tight",
    "tilts",
    "timer",
    "times",
    "token",
    "tokes",
    "tough",
    "track",
    "traps",
    "trash",
    "treys",
    "trick",
    "trips",
    "turbo",
    "turns",
    "twice",
    "twist",
    "under",
    "value",
    "vegas",
    "venmo",
    "verse",
    "waits",
    "wakes",
    "walks",
    "watch",
    "weeds",
    "whale",
    "wheel",
    "white",
    "widen",
    "witty",
    "wraps",
    "yacht",
    "yoink",
    "zeros"
]
const findDuplicates = (arr) => {
    let sorted_arr = arr.slice().sort();
    let results = [];
    for (let i = 0; i < sorted_arr.length - 1; i++) {
        if (sorted_arr[i + 1] == sorted_arr[i]) {
            results.push(sorted_arr[i]);
        }
    }
    return results;
}
console.log("Duplicate Words: " + findDuplicates(pokerWords))

let pokerWordsStr = ""
for (word of pokerWords.sort()) {
    pokerWordsStr += '"' + word + '",\n'
}
console.log(pokerWordsStr.substring(0, pokerWordsStr.length - 2))

let pokerWordsNotInList = "Poker Words Not In Wordle List: "
for (word of pokerWords) {
    if (!allWords.includes(word)) {
        allWords += word
        pokerWordsNotInList += word + ", "
    }
}
console.log(pokerWordsNotInList.substring(0, pokerWordsNotInList.length - 2))

let printStr = "Poker Words: " + pokerWords.length + "\n"
for (word of pokerWords) {
    printStr += word + " "
}
console.log(printStr)

// Create elements in svg
const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
const mobileClickMs = 100
const height = Math.max(420, window.innerHeight - document.querySelector(".legacy-header").getBoundingClientRect().height - 12)
const width = Math.min(window.innerWidth, height / 1.5)
const root = document.querySelector(":root")
const stdTextSize = height / 717 * 1.5
root.style.setProperty("--textSize", stdTextSize + "em")
root.style.setProperty("--gridTextSize", (stdTextSize * 2) + "em")
root.style.setProperty("--svgMargin", (window.innerWidth - width) / 2 + "px")
root.addEventListener("dblclick", function(e) {
    e.preventDefault()
})
const svg = d3.select("#legacy-stage").append("svg")
    .attr("width", width)
    .attr("height", height)


const keyPaddingRatio = 1/6
const keyWidth = width / (10 + 11 * keyPaddingRatio)
const keyHeight = keyWidth * 1.5
const keyPadding = keyWidth * keyPaddingRatio
const keyboardHeight = keyHeight * 3 + keyPadding * 3
const keyboardY = height - keyboardHeight
const enter = "\u21AA\uFE0E"
const backspace = "\u232B\uFE0E"
const letters = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "A", "S", "D", "F", "G", "H", "J", "K", "L", enter, "Z", "X", "C", "V", "B", "N", "M", backspace]
const numLetters = [10, 9, 9]
const lettersOffset = [keyPadding, keyWidth * 0.5 + keyPadding * 1.5, keyPadding]
var count = 0
for (let r = 0; r < 3; r++) {
    let x = lettersOffset[r]
    for (let i = 0; i < numLetters[r]; i++) {
        let y = keyboardY + keyHeight * r + keyPadding * r
        let l = letters[count]
        let keyStretch = l === enter || l === backspace ? 1.5 : 1
        let id = l === enter ? "enter" : l === backspace ? "backspace" : l
        let key = svg.append("g")
            .attr("transform", "translate(" + x + "," + y + ")")
            .attr("id", "g" + id)
            .on("mouseover", function() {
                d3.selectAll(this.children).classed("hover", true)
                d3.selectAll(this.children[1].children).classed("hover", true)
            })
            .on("mouseout", function() {
                d3.selectAll(this.children).classed("hover", false)
                d3.selectAll(this.children[1].children).classed("hover", false)
            })
            .on("click", function() {
                typeKey(id)
                if (mobile) {
                    setTimeout(() => {
                        d3.selectAll(this.children).classed("hover", false)
                        d3.selectAll(this.children[1].children).classed("hover", false)
                    }, mobileClickMs);
                }
            })

        key.append("rect")
            .attr("width", keyWidth * keyStretch + keyPadding * (keyStretch - 1))
            .attr("height", keyHeight)
            .attr("rx", keyWidth / 8)
            .attr("ry", keyWidth / 8)
            .attr("class", "key")
            .attr("id", "key" + id)

        key.append("g")
            .attr("transform", "translate(" + keyWidth / 2 + "," + keyHeight / 2 + ")")
            .classed("suitG", true)

        key.append("text")
            .attr("x", keyWidth / 2 * keyStretch * (l === enter ? 1.03 : 1))
            .attr("y", keyHeight * 0.65 * (l === enter ? 1.1 : 1))
            .attr("id", "text" + id)
            .text(l)

        count++
        x += (keyWidth + keyPadding) * keyStretch
    }
}

const boxPaddingRatio = 1/6
const boxS = width / (5 + 6 * keyPaddingRatio)
const boxP = boxS / 6
const boxBorderW = boxP / 2
for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
        let boxX = boxS * col + boxP * (col + 1)
        let boxY = boxS * row + boxP * (row + 1)

        let box = svg.append("g")
            .attr("transform", "translate(" + boxX + "," + boxY + ")")
            .attr("id", "g" + row + col)

        box.append("rect")
            .attr("width", boxS)
            .attr("height", boxS)
            .attr("rx", boxBorderW)
            .attr("ry", boxBorderW)
            .attr("class", "box boxDark")
            .attr("id", "box" + row + col)
            .attr("stroke-width", boxBorderW)

        box.append("g")
            .attr("transform", "translate(" + boxS / 2 + "," + boxS / 2 + ")")
            .classed("suitG", true)

        box.append("text")
            .attr("x", boxS / 2)
            .attr("y", boxS * 0.72)
            .attr("class", "gridText")
            .attr("id", "boxText" + row + col)
    }
}

const answerText = svg.append("text")
    .attr("x", width / 2)
    .attr("y", width + boxS / 4)
    .attr("id", "answerText")

function applyButtonFunc(b, func) {
    b.classed("auxButton", true)
    .on("mouseover", function() {
        d3.select(this.parentNode).selectAll("*").classed("hover", true)
    })
    .on("mouseout", function() {
        d3.select(this.parentNode).selectAll("*").classed("hover", false)
    })
    .on("click", function() {
        func()
        if (mobile) {
            setTimeout(() => {
                d3.select(this.parentNode).selectAll("*").classed("hover", false)
            }, mobileClickMs);
        }
    })
    return b
}

const buttonStrokeWidth = keyWidth / 16
const help = svg.append("g").attr("id", "help")
const helpButton = svg.append("g")
    .attr("id", "helpButton")
    .attr("transform", "translate(" + (width - keyPadding - keyWidth / 2) + "," + (keyboardY - keyWidth * 5/9) + ")")
applyButtonFunc(helpButton.append("circle")
    .attr("r", keyWidth / 3)
    .attr("stroke-width", buttonStrokeWidth)
    , clickHelp
)
const helpQuestionMark = applyButtonFunc(helpButton.append("text")
    .attr("y", keyWidth / 5)
    .text("?")
    , clickHelp
)
if (mobile) {
    helpQuestionMark.style("font-size", (stdTextSize * 0.875) + "em")
}

const stats = svg.append("g").attr("id", "stats")
const statsButton = svg.append("g")
    .attr("id", "statsButton")
    .attr("transform", "translate(" + (keyPadding * 1.75) + "," + (keyboardY - keyWidth * 1/4) + ")")
for (i of [[0, 1.75], [1, 2.5], [2, 1]]) {
    let unit = keyWidth / 4
    applyButtonFunc(statsButton.append("rect")
        .attr("x", unit * i[0])
        .attr("y", -unit * i[1])
        .attr("width", unit)
        .attr("height", unit * i[1])
        .attr("stroke-width", buttonStrokeWidth)
        , clickStats
    )
}

const list = svg.append("g").attr("id", "list")
const listButton = svg.append("g")
    .attr("id", "listButton")
    .attr("transform", "translate(" + (width - keyPadding * 2 - keyWidth * 11/6) + "," + (keyboardY - keyWidth * 8/9) + ")")
const listButtonRects = [
    [0, 0, 64, 64],
    [12, 13, 4, 4],
    [24, 15, 28, 1],
    [12, 29, 4, 4],
    [24, 31, 28, 1],
    [12, 45, 4, 4],
    [24, 47, 28, 1]
]
for (i of listButtonRects) {
    applyButtonFunc(listButton.append("rect")
        .attr("x", keyWidth * 2/3 * i[0] / 64)
        .attr("y", keyWidth * 2/3 * i[1] / 64)
        .attr("rx", keyWidth / 8)
        .attr("ry", keyWidth / 8)
        .attr("width", keyWidth * 2/3 * i[2] / 64)
        .attr("height", keyWidth * 2/3 * i[3] / 64)
        .attr("stroke-width", buttonStrokeWidth)
        , clickList
    )
}

// Key listeners
var currentWord = pokerWords[Math.floor(Math.random() * pokerWords.length)]
console.log(currentWord)
var currentGuess = ""
var guessNum = 0
var guesses = ["", "", "", "", ""]
var resetReady = false

document.addEventListener("keydown", keyDown);
document.addEventListener("keyup", keyUp);

function keyDown(e) {
    if (onHelp || onStats || onList) {
        clearHelp()
        clearStats()
        clearList()
        return
    }
    let code = `${e.code}`
    if (code.substring(0, 3) === "Key") {
        code = code.substring(3)
    } else if (code === "Enter" || code === "Backspace") {
        code = code.toLowerCase()
    } else {
        return
    }
    d3.select("#key" + code).classed("hover", true)
    d3.selectAll("#g" + code + ">g>*").classed("hover", true)
    typeKey(code)
}

function keyUp(e) {
    let code = `${e.code}`
    if (code.substring(0, 3) === "Key") {
        code = code.substring(3)
    } else if (code === "Enter" || code === "Backspace") {
        code = code.toLowerCase()
    } else {
        return
    }
    d3.select("#key" + code).classed("hover", false)
    d3.selectAll("#g" + code + ">g>*").classed("hover", false)
}

function updateGuess() {
    for (let col = 0; col < 5; col++) {
        let text = ""
        if (col < currentGuess.length) {
            text = currentGuess.substring(col, col + 1)
            d3.select("#box" + guessNum + col).classed("boxLight", true).classed("boxMed", false)
        } else {
            d3.select("#box" + guessNum + col).classed("boxMed", true).classed("boxLight", false).classed("boxDark", false)
        }
        d3.select("#boxText" + guessNum + col)
            .classed("invalid", currentGuess.length === 5 && !validGuess())
            .text(text)
    }
}
updateGuess()

function typeKey(key) {
    if (key === "enter") {
        pressEnter()
    } else if (key === "backspace") {
        pressBackspace()
    } else if (currentGuess.length < 5) {
        animateBoxInput()
        currentGuess += key
    }
    if (!resetReady) {
        updateGuess()
    }
}

function pressBackspace() {
    if (currentGuess.length > 0) {
        currentGuess = currentGuess.substring(0, currentGuess.length - 1)
    }
}

function pressEnter() {
    if (animRevealOver) {
        if (resetReady) {
            reset()
            return
        }
        let correct = false
        if (validGuess()) {
            correct = guess()
        } else {
            animateInvalidWord()
        }
        if (guessNum === 5) {
            resetReady = true
            if (!correct) {
                answerText.text(currentWord.toUpperCase())
            }
        }
    }
}

function validGuess() {
    return currentGuess.length === 5 && allWords.includes(currentGuess.toLowerCase()) && !guesses.includes(currentGuess)
}

function reset() {
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            d3.select("#box" + row + col)
                .classed("club", false)
                .classed("diamond", false)
                .classed("heart", false)
                .classed("spade", false)
                .classed("boxLight", false)
                .classed("boxMed", false)
                .classed("boxDark", true)
            d3.select("#boxText" + row + col)
                .text("")
        }
    }
    d3.selectAll(".key")
        .classed("club", false)
        .classed("diamond", false)
        .classed("heart", false)
        .classed("spade", false)
    d3.selectAll(".suitShape")
        .remove()
    answerText.text("")
    currentWord = pokerWords[Math.floor(Math.random() * pokerWords.length)]
    currentGuess = ""
    guessNum = 0
    guesses = ["", "", "", "", ""]
    resetReady = false
}

function guess() {
    let allCorrect = true
    let suits = [null, null, null, null, null]
    for (let col = 0; col < 5; col++) {
        let guessLetter = currentGuess.toLowerCase().substring(col, col + 1)
        let suit = "spade"
        if (guessLetter === currentWord.substring(col, col + 1)) {
            suit = "club"
        } else {
            allCorrect = false
            if (currentWord.includes(guessLetter)) {
                suit = "diamond"
            }
        }
        suits[col] = suit
    }
    if (allCorrect) {
        resetReady = true
        suits = ["heart", "heart", "heart", "heart", "heart"]
    }
    // Double Letters
    let guessLetters = {}
    let wordLetters = {}
    for (l of currentGuess) {
        l = l.toLowerCase()
        if (guessLetters[l] === undefined) {
            guessLetters[l] = 1
        } else {
            guessLetters[l]++
        }
    }
    for (l of currentWord) {
        if (wordLetters[l] === undefined) {
            wordLetters[l] = 1
        } else {
            wordLetters[l]++
        }
    }
    for (key of Object.keys(guessLetters)) {
        if (guessLetters[key] > wordLetters[key]) {
            let extraLetters = guessLetters[key] - wordLetters[key]
            for (let i = 4; i >= 0; i--) {
                if (extraLetters > 0 && suits[i] === "diamond" && currentGuess.substring(i, i + 1).toLowerCase() === key) {
                    suits[i] = "spade"
                    extraLetters--
                }
            }
        }
    }
    for (let col = 0; col < 5; col++) {
        let l = currentGuess.substring(col, col + 1)
        animateReveal(() => drawSuit(suits[col], guessNum - 1, col, l), col)
    }
    guesses[guessNum] = currentGuess
    guessNum++
    currentGuess = ""
    return allCorrect
}

// Draw suits
const boxC = boxS / 2
const keyCX = keyWidth / 2
const keyCY = keyHeight / 2
const keyS = keyWidth
const d = [[0, boxS / 2.4], [boxS / 3.2, 0], [0, -boxS / 2.4], [-boxS / 3.2, 0]]
const dK = [[0, keyS / 2], [keyS * 0.375, 0], [0, -keyS / 2], [-keyS * 0.375, 0]]
const h = [[-boxS * 0.3, -boxS * 1/15], [0, -boxS / 6], [boxS * 0.3, -boxS * 1/15], [0, boxS / 3]]
const hK = [[-keyS * 0.3, -keyS * 1/15], [0, -keyS / 6], [keyS * 0.3, -keyS * 1/15], [0, keyS / 3]]
const c = [[0, -boxS / 6], [boxS / 6, boxS * Math.sqrt(2)/12], [-boxS / 6, boxS * Math.sqrt(2)/12]]
const cK = [[0, -keyS / 6], [keyS / 6, keyS * Math.sqrt(2)/12], [-keyS / 6, keyS * Math.sqrt(2)/12]]
var stem = [[0.01196, 0.1], [0.02992, 0.21313], [0.0387, 0.25], [0.05301, 0.3], [0.06568, 0.3377], [0.03, 0.3342], [0, 1/3], [-0.03, 0.3342], [-0.06568, 0.3377], [-0.05301, 0.3], [-0.0387, 0.25], [-0.02992, 0.21313], [-0.01196, 0.1]]
for (let i = 0; i < stem.length; i++) {
    stem[i][1] *= 7/6
}
// THIS CODE IS SUPER JANK BUT WORKS
function drawStemBox(gBox, suit) {
    gBoxStem = ""
    for (i of stem) {
        gBoxStem += i[0] * boxC * 2 + ", " + i[1] * boxC * 2 + " "
    }
    gBox.append("polygon")
        .attr("points", gBoxStem)
        .classed("suitShape", true)
        .classed(suit, true)
}
function drawStemKey(gKey, suit, key = "") {
    gKeyStem = ""
    for (i of stem) {
        gKeyStem += i[0] * keyS + ", " + i[1] * keyS + " "
    }
    gKey.append("polygon")
        .attr("points", gKeyStem)
        .classed("suitShape", true)
        .classed("ss" + key, true)
        .classed(suit, true)
}
function drawSuit(suit, row, col, key) {
    d3.select("#box" + row + col)
        .classed(suit, true)
    let gBox = d3.select("#g" + row + col).select(".suitG")
    let gKey = d3.select("#g" + key).select(".suitG")
    let rectKey = d3.select("#key" + key)
    let currentSuit = rectKey.attr("class").split(" ")[1]
    if (!((currentSuit === suit) || (currentSuit === "club" && (suit === "diamond" || suit === "spade")) || (currentSuit === "diamond" && suit === "spade"))) {
        rectKey.classed("spade", false)
        rectKey.classed("heart", false)
        rectKey.classed("diamond", false)
        rectKey.classed("club", false)
        rectKey.classed(suit, true)
    }
    switch (suit) {
        case "spade":
            for (i of [-1, 1]) {
                gBox.append("circle")
                    .attr("cx", -boxS / 6 * i)
                    .attr("cy", boxS / 6)
                    .attr("r", boxS / 6)
                    .classed("suitShape", true)
                    .classed(suit, true)
            }
            gBox.append("polygon")
                .attr("points", `${h[0][0]}, ${-h[0][1]} ${h[1][0]}, ${-h[1][1]} ${h[2][0]}, ${-h[2][1]} ${h[3][0]}, ${-h[3][1]}`)
                .classed("suitShape", true)
                .classed(suit, true)
            drawStemBox(gBox, suit)
            if (currentSuit === "diamond" || currentSuit === "club") {
                break
            }
            d3.selectAll(".ss" + key).remove()
            for (i of [-1, 1]) {
                gKey.append("circle")
                .attr("cx", -keyS / 6 * i)
                .attr("cy", keyS / 6)
                .attr("r", keyS / 6)
                .classed("suitShape", true)
                .classed("ss" + key, true)
                .classed(suit, true)
            }
            gKey.append("polygon")
                .attr("points", `${hK[0][0]}, ${-hK[0][1]} ${hK[1][0]}, ${-hK[1][1]} ${hK[2][0]}, ${-hK[2][1]} ${hK[3][0]}, ${-hK[3][1]}`)
                .classed("suitShape", true)
                .classed("ss" + key, true)
                .classed(suit, true)
            drawStemKey(gKey, suit, key)
            break
        case "heart":
            d3.selectAll(".ss" + key).remove()
            for (i of [-1, 1]) {
                gBox.append("circle")
                    .attr("cx", -boxS / 6 * i)
                    .attr("cy", -boxS / 6)
                    .attr("r", boxS / 6)
                    .classed("suitShape", true)
                    .classed(suit, true)
                gKey.append("circle")
                    .attr("cx", -keyS / 6 * i)
                    .attr("cy", -keyS / 6)
                    .attr("r", keyS / 6)
                    .classed("suitShape", true)
                    .classed("ss" + key, true)
                    .classed(suit, true)
            }
            gBox.append("polygon")
                .attr("points", `${h[0][0]}, ${h[0][1]} ${h[1][0]}, ${h[1][1]} ${h[2][0]}, ${h[2][1]} ${h[3][0]}, ${h[3][1]}`)
                .classed("suitShape", true)
                .classed(suit, true)
            gKey.append("polygon")
                .attr("points", `${hK[0][0]}, ${hK[0][1]} ${hK[1][0]}, ${hK[1][1]} ${hK[2][0]}, ${hK[2][1]} ${hK[3][0]}, ${hK[3][1]}`)
                .classed("suitShape", true)
                .classed("ss" + key, true)
                .classed(suit, true)
            break
        case "diamond":
            gBox.append("polygon")
                .attr("points", `${d[0][0]}, ${d[0][1]} ${d[1][0]}, ${d[1][1]} ${d[2][0]}, ${d[2][1]} ${d[3][0]}, ${d[3][1]}`)
                .classed("suitShape", true)
                .classed(suit, true)
            if (currentSuit === "club") {
                break
            }
            d3.selectAll(".ss" + key).remove()
            gKey.append("polygon")
                .attr("points", `${dK[0][0]}, ${dK[0][1]} ${dK[1][0]}, ${dK[1][1]} ${dK[2][0]}, ${dK[2][1]} ${dK[3][0]}, ${dK[3][1]}`)
                .classed("suitShape", true)
                .classed("ss" + key, true)
                .classed(suit, true)
            break
        case "club":
            gBox.append("circle")
                .attr("r", boxC / 4)
                .classed("suitShape", true)
                .classed(suit, true)
            for (i of c) {
                gBox.append("circle")
                    .attr("cx", i[0])
                    .attr("cy", i[1])
                    .attr("r", boxC / 3)
                    .classed("suitShape", true)
                    .classed(suit, true)
            }
            drawStemBox(gBox, suit)
            d3.selectAll(".ss" + key).remove()
            gKey.append("circle")
                .attr("r", keyS / 8)
                .classed("suitShape", true)
                .classed("ss" + key, true)
                .classed(suit, true)
            for (i of cK) {
                gKey.append("circle")
                    .attr("cx", i[0])
                    .attr("cy", i[1])
                    .attr("r", keyS / 6)
                    .classed("suitShape", true)
                    .classed("ss" + key, true)
                    .classed(suit, true)
            }
            drawStemKey(gKey, suit, key)
            break
    }
}

// Animations
const frameMs = 1000/60
const animInputFrames = 8
function animateBoxInput(g = d3.select("#g" + guessNum + currentGuess.length), frame = 0) {
    let animLen = animInputFrames / 2
    let ratio = frame < animLen ? frame / animLen : (animInputFrames - frame) / animLen
    ratio = Math.pow(ratio, 2/3)
    let scale = 1 + 1/6 * ratio
    let trans = -boxBorderW * ratio
    g.select("rect").attr("transform", "translate(" + trans + "," + trans + ") scale(" + scale + "," + scale + ")")
    g.select("text").attr("transform", "translate(" + trans + "," + trans + ") scale(" + scale + "," + scale + ")")
    if (frame < animInputFrames) {
        setTimeout(() => animateBoxInput(g, frame + 1), frameMs)
    }
}

const animRevealFrames = 24
var animRevealOver = true
function animateReveal(draw, col, row = guessNum, frame = 0, gKey, guess) {
    animRevealOver = false
    if (gKey === undefined) {
        gKey = d3.select("#g" + currentGuess.substring(col, col + 1))
    }
    if (guess === undefined) {
        guess = currentGuess
    }
    let animLen = animRevealFrames / 2
    let colFrame = frame - col * animRevealFrames / 2
    let ratio = colFrame < animLen ? colFrame / animLen : (animRevealFrames - colFrame) / animLen
    let ready = true
    let drawn = colFrame >= animLen
    if (ratio < 0) {
        ratio = 0
        ready = false
    } else if (ratio === 1) {
        draw()
    }
    let scale = 1 - ratio
    let trans = boxS / 2 * ratio
    let keyTrans = keyHeight / 2 * ratio
    let g = d3.select("#g" + row + col)
    g.select("rect").attr("transform", "translate(0," + trans + ") scale(1," + scale + ")")
    g.select("g").selectAll("*").attr("transform", "scale(1," + scale + ")")
    g.select("text").attr("transform", "translate(0," + trans + ") scale(1," + scale + ")")
    if (ready) {
        let lastLetterSame = guess.substring(col - 1, col) === guess.substring(col, col + 1)
        if (lastLetterSame && !drawn) {
            scale = 0
        }
        gKey.select("rect").attr("transform", "translate(0," + keyTrans + ") scale(1," + scale + ")")
        gKey.select("g").selectAll("*").attr("transform", "scale(1," + scale + ")")
        gKey.select("text").attr("transform", "translate(0," + keyTrans + ") scale(1," + scale + ")")
    }
    if (frame < animRevealFrames * (col / 2 + 1)) {
        setTimeout(() => animateReveal(draw, col, row, frame + 1, gKey, guess), frameMs)
    } else {
        animRevealOver = true
    }
}

const animInvalidFrames = 18
const animInvalidShakes = 3
function animateInvalidWord(frame = 0) {
    let x = Math.sin(frame / (animInvalidFrames / animInvalidShakes) * 2 * Math.PI) * boxS / 16
    d3.selectAll(".invalid").attr("transform", "translate(" + x + ",0)")
    if (frame < animInvalidFrames) {
        setTimeout(() => animateInvalidWord(frame + 1), frameMs)
    }
}

// Help and Stats button handlers
var onHelp = false
function clickHelp() {
    if (!onHelp) {
        clearStats()
        clearList()
        onHelp = true
        help.append("rect")
            .attr("x", boxP)
            .attr("y", boxP)
            .attr("width", boxS * 5 + boxP * 4)
            .attr("height", boxS * 5 + boxP * 4)
            .attr("rx", boxBorderW)
            .attr("ry", boxBorderW)
            .attr("stroke-width", boxBorderW)
            .classed("bigBox", true)
        let unit = boxS / 4
        let start = width / 2 - unit * 3.5
        let logo = ["PROBE", "ORBIT", "KINGS", "EIGHT", "RANGE", "DONKS", "LIMPS", "EVENT"]
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 5; j++) {
                let l = help.append("text")
                    .attr("x", start + unit * i)
                    .attr("y", boxS * 0.5 + unit * j)
                    .text(logo[i].substring(j, j + 1))
                l.classed(["spade", "heart", "diamond", "club"][i % 4], true)
                if (j !== 0) {
                    l.classed("dark", true)
                }
            }
        }
        let suits = ["spade", "diamond", "club", "heart"]
        for (let i = 0; i < 4; i++) {
            let suit = suits[i]
            let gBox = help.append("g")
                .attr("transform", "translate(" + (boxS * 0.69) + "," + (boxS * (1.65 + i * 0.9) + ")"))
                .attr("id", "g" + suit)

            gBox.append("rect")
                .attr("width", keyWidth)
                .attr("height", keyHeight)
                .attr("rx", keyWidth / 8)
                .attr("ry", keyWidth / 8)
                .attr("class", "key " + suit)
                .attr("id", "key" + suit)

            let gKey = gBox.append("g")
                .attr("transform", "translate(" + keyWidth / 2 + "," + keyHeight / 2 + ")")
                .classed("suitG", true)

            switch (i) {
                case 0:
                    for (j of [-1, 1]) {
                        gKey.append("circle")
                        .attr("cx", -keyS / 6 * j)
                        .attr("cy", keyS / 6)
                        .attr("r", keyS / 6)
                        .classed("suitShape", true)
                        .classed(suit, true)
                    }
                    gKey.append("polygon")
                        .attr("points", `${hK[0][0]}, ${-hK[0][1]} ${hK[1][0]}, ${-hK[1][1]} ${hK[2][0]}, ${-hK[2][1]} ${hK[3][0]}, ${-hK[3][1]}`)
                        .classed("suitShape", true)
                        .classed(suit, true)
                    drawStemKey(gKey, suit)
                    gBox.append("text")
                        .attr("x", boxS * 1.5)
                        .attr("y", boxS / 2)
                        .text("= not in word")
                    break
                case 1:
                    gKey.append("polygon")
                        .attr("points", `${dK[0][0]}, ${dK[0][1]} ${dK[1][0]}, ${dK[1][1]} ${dK[2][0]}, ${dK[2][1]} ${dK[3][0]}, ${dK[3][1]}`)
                        .classed("suitShape", true)
                        .classed(suit, true)
                    gBox.append("text")
                        .attr("x", boxS * 2.57)
                        .attr("y", boxS / 2)
                        .text("= in word but wrong position")
                    break
                case 2:
                    gKey.append("circle")
                        .attr("r", keyS / 8)
                        .classed("suitShape", true)
                        .classed(suit, true)
                    for (j of cK) {
                        gKey.append("circle")
                            .attr("cx", j[0])
                            .attr("cy", j[1])
                            .attr("r", keyS / 6)
                            .classed("suitShape", true)
                            .classed(suit, true)
                    }
                    drawStemKey(gKey, suit)
                    gBox.append("text")
                        .attr("x", boxS * 1.81)
                        .attr("y", boxS / 2)
                        .text("= correct position")
                    break
                case 3:
                    for (j of [-1, 1]) {
                        gKey.append("circle")
                            .attr("cx", -keyS / 6 * j)
                            .attr("cy", -keyS / 6)
                            .attr("r", keyS / 6)
                            .classed("suitShape", true)
                            .classed(suit, true)
                    }
                    gKey.append("polygon")
                        .attr("points", `${hK[0][0]}, ${hK[0][1]} ${hK[1][0]}, ${hK[1][1]} ${hK[2][0]}, ${hK[2][1]} ${hK[3][0]}, ${hK[3][1]}`)
                        .classed("suitShape", true)
                        .classed(suit, true)
                    gBox.append("text")
                        .attr("x", boxS * 1.6)
                        .attr("y", boxS / 2)
                        .text("= correct word")
                    break
            }
        }
        help.append("text")
            .attr("x", width / 2)
            .attr("y", boxS * 5.6)
            .text("Created by Mathew Seng")
    }
}

function clearHelp() {
    help.selectAll("*").remove()
    onHelp = false
}

var onStats = false
function clickStats() {
    if (!onStats) {
        clearHelp()
        clearList()
        onStats = true
        stats.append("rect")
            .attr("x", boxP)
            .attr("y", boxP)
            .attr("width", boxS * 5 + boxP * 4)
            .attr("height", boxS * 5 + boxP * 4)
            .attr("rx", boxBorderW)
            .attr("ry", boxBorderW)
            .attr("stroke-width", boxBorderW)
            .classed("bigBox", true)
        stats.append("text")
            .attr("x", width / 2)
            .attr("y", boxS / 2)
            .text("Statistics")
    }
}

function clearStats() {
    stats.selectAll("*").remove()
    onStats = false
}

var onList = false
const wordsVPad = 5 / Math.ceil(pokerWords.length / 10)
function clickList() {
    if (!onList) {
        clearHelp()
        clearStats()
        onList = true
        list.append("rect")
            .attr("x", boxP)
            .attr("y", boxP)
            .attr("width", boxS * 5 + boxP * 4)
            .attr("height", boxS * 5 + boxP * 4)
            .attr("rx", boxBorderW)
            .attr("ry", boxBorderW)
            .attr("stroke-width", boxBorderW)
            .classed("bigBox", true)
        list.append("text")
            .attr("x", width / 2)
            .attr("y", boxS / 2)
            .text("Pokerdle Word List")
        let wordsArr = []
        let wordsPerLine = 10
        for (let i = 0; i < pokerWords.length; i++) {
            if (i % wordsPerLine === 0) {
                wordsArr.push([])
            }
            wordsArr[Math.floor(i / wordsPerLine)].push(pokerWords[i])
        }
        for (let i = 0; i < wordsArr.length; i++) {
            for (let j = 0; j < wordsArr[i].length; j++) {
                let x = width / 2 + (j - (wordsPerLine / 2 - 0.5)) * width / (wordsPerLine + 1)
                let y = boxS * (0.8 + i * wordsVPad)
                list.append("text")
                    .attr("x", x)
                    .attr("y", y)
                    .style("font-size", (stdTextSize / 2) + "em")
                    .text(wordsArr[i][j])
            }
        }
    }
    let eyeButton = svg.append("g")
        .attr("id", "eyeButton")
        .attr("transform", "translate(" + (width - keyPadding * 2 - keyWidth * 11/6) + "," + (keyWidth * 0.8) + ")")
    applyButtonFunc(eyeButton.append("circle")
        .attr("rx", keyWidth / 16)
        .attr("ry", keyWidth / 16)
        .classed("eye", true)
        , clickEye
    )
}

function clickEye() {
    console.log("eye")
}

function clearList() {
    list.selectAll("*").remove()
    onList = false
}

document.body.addEventListener("click", clickBody, true)
function clickBody() {
    clearHelp()
    clearStats()
    clearList()
}
