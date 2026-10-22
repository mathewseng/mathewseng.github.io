var a = 110
var pitchTempo = 0.5
var pitchOffsets = [50, 25, 10, 5]
var pitchOffset = 0
var pitchDir = 0
var freq1 = 440
var freq2 = 440
var interval = 0
var intRatio = 1
var pitchPlayed = false

function pitchTest() {
    if (pitchOffset === 0) {
        newPitches()
    }
    pitchPlayed = true
    displayCents(true)
    Tone.loaded().then(() => {
        let now = Tone.now()
        sampler.triggerAttackRelease(freq1, 1)
        sampler.triggerAttackRelease(freq1 * intRatio, 1, now + pitchTempo)
        sampler.triggerAttackRelease(freq2, 1, now + pitchTempo * 3)
        sampler.triggerAttackRelease(freq2 * intRatio * Math.pow(2, pitchOffset / 1200 * pitchDir), 1, now + pitchTempo * 4)
    })
    d3.selectAll(".pitch").attr("class", "pitch")
}

function newPitches() {
    pitchPlayed = false
    setDifficulty()
    pitchOffset = pitchOffsets[difficulty]
    pitchDir = Math.floor(Math.random() * 3 - 1)
    freq1 = Math.pow(2, 1 + Math.random()) * a
    freq2 = Math.pow(2, 1 + Math.random()) * a
    interval = Math.floor(Math.random() * 25 - 12)
    intRatio = Math.pow(2, 1 + interval / 12)
}

function guessPitch(guess) {
    if (pitchPlayed) {
        scores[0][1]++
        scores[0][difficulty + 4][1]++
        if (guess === pitchDir) {
            scores[0][0]++
            scores[0][2]++
            d3.select("#pitch" + (pitchDir + 1)).attr("class", "pitch correctlySelected")
            scores[0][difficulty + 4][0]++
        } else {
            scores[0][2] = 0
            d3.select("#pitch" + (pitchDir + 1)).attr("class", "pitch correct")
            d3.select("#pitch" + (guess + 1)).attr("class", "pitch incorrect")
        }
        updateScores("|p" + difficulty + (guess + 1) + (pitchDir + 1) + "," + Math.round(freq1) + "," + Math.round(freq2) + "," + interval)
        if (pitchDir === 0) {
            displayCents(false, true)
        } else {
            displayCents()
        }
        newPitches()
    } else {
        d3.select("#cents").html(instructionMessage)
    }
}

function displayCents(hide = false, same = false) {
    if (hide) {
        d3.select("#cents").html("")
    } else if (same) {
        d3.select("#cents").html("Potential Cents: " + pitchOffset)
    } else {
        d3.select("#cents").html("Cents: " + pitchOffset)
    }
}