const metronomeSampler = new Tone.Sampler({
	urls: {
		A1: "metronome-click.wav",
	},
    baseUrl: "./",
}).toDestination()

var rhythmTempo = 120
var rhythmOffsets = [100, 50, 25, 10]
var rhythmOffset = 0
var rhythmDir = 0
var rhythm = [true, false, true, false, true, false, true, false, true]
var rhythmPlayed = false

function rhythmTest() {
    if (rhythmOffset === 0) {
        newRhythm()
    }
    rhythmPlayed = true
    displayMs(true)
    Tone.loaded().then(() => {
        let now = Tone.now()
        for (let i = 0; i <= 8; i++) {
            if (rhythm[i]) {
                metronomeSampler.triggerAttackRelease("A1", 1, now + 60 / rhythmTempo / 2 * i)
                metronomeSampler.triggerAttackRelease("A1", 1, now + 60 / rhythmTempo / 2 * (i + 16) + (i === 8 ? rhythmOffset * rhythmDir / 1000 : 0))
            }
        }
    })
    d3.selectAll(".rhythm").attr("class", "rhythm")
}

function newRhythm() {
    rhythmPlayed = false
    setDifficulty()
    rhythmOffset = rhythmOffsets[difficulty]
    rhythmDir = Math.floor(Math.random() * 3 - 1)
    do {
        for (let i = 1; i < 8; i++) {
            rhythm[i] = Math.random() < 0.5
        }
    } while (!validRhythm())
}

function validRhythm() {
    let valid = true
    let silence = 0
    for (let i = 1; i < 8; i++) {
        if (rhythm[i]) {
            silence = 0
        } else {
            silence++
        }
        if (silence >= 3) {
            valid = false
        }
    }
    return valid
}

function guessRhythm(guess) {
    if (rhythmPlayed) {
        scores[1][1]++
        scores[1][difficulty + 4][1]++
        if (guess === rhythmDir) {
            scores[1][0]++
            scores[1][2]++
            d3.select("#rhythm" + (rhythmDir + 1)).attr("class", "rhythm correctlySelected")
            scores[1][difficulty + 3][0]++
        } else {
            scores[1][2] = 0
            d3.select("#rhythm" + (rhythmDir + 1)).attr("class", "rhythm correct")
            d3.select("#rhythm" + (guess + 1)).attr("class", "rhythm incorrect")
        }
        updateScores("|r" + difficulty + (guess + 1) + (rhythmDir + 1) + "," + rhythmToString())
        if (rhythmDir === 0) {
            displayMs(false, true)
        } else {
            displayMs()
        }
        newRhythm()
    } else {
        d3.select("#ms").html(instructionMessage)
    }
}

function displayMs(hide = false, same = false) {
    if (hide) {
        d3.select("#ms").html("")
    } else if (same) {
        d3.select("#ms").html("Potential ms: " + rhythmOffset)
    } else {
        d3.select("#ms").html("ms: " + rhythmOffset)
    }
}

function rhythmToString() {
    let s = ""
    for (let i = 1; i < 8; i++) {
        s += 0 + rhythm[i]
    }
    return s
}