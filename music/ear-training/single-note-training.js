var currentSingleNote = middleNote;
var previousSingleNote = currentSingleNote;
var singleNoteCounter = 0;
var selectedSingleNotes = {};
var svgSingleNote = d3.select("#singleNoteTraining")
    .append("svg")
    .attr("viewBox", `0 0 ${keyWidth * 7} ${keyWidth * 5}`)
    .attr("width", keyWidth * 7)
    .attr("height", keyWidth * 5);

function revealCorrectNoteText() {
    document.getElementById("noteText").innerHTML = MIDIToNote(currentSingleNote);
}
var firstGuess = true;

function playNextSingleNote() {
    firstGuess = true;
    singleNoteCounter++;
    previousSingleNote = currentSingleNote;
    while (currentSingleNote === previousSingleNote) {
        currentSingleNote += Math.floor(Math.random() * 25 - 12);
        if (currentSingleNote <= middleNote - 18) {
            currentSingleNote += 12;
        } else if (currentSingleNote >= middleNote + 18) {
            currentSingleNote -= 12;
        }
    }
    if (singleNoteCounter === 1) {
        selectSingleNote(MIDIToNote(currentSingleNote, true));
    } else {
        Tone.loaded().then(() => {
            sampler.triggerAttackRelease(MIDIToNote(currentSingleNote), 1);
        });
    }
}

function selectSingleNote(note) {
    if (singleNoteCounter !== 0) {
        if (typeof(note) === "number") {
            note = notes[note % 12];
        }
        revealCorrectNoteText();
        deselectSingleKeys();
        guessSingleNote(note);
        Tone.loaded().then(() => {
            let noteMIDI = notes.indexOf(note);
            while (Math.abs(currentSingleNote - noteMIDI) > 6) {
                noteMIDI += 12;
            }
            sampler.triggerAttackRelease(MIDIToNote(noteMIDI), 1);
        });
    }
}

function deselectSingleKeys() {
    for (let i = 0; i < 12; i++) {
        selectedSingleNotes[notes[i]] = "";
    }
}

function guessSingleNote(note) {
    if (note === MIDIToNote(currentSingleNote, true)) {
        selectedSingleNotes[note] = "correctlySelected";
        if (firstGuess && singleNoteCounter !== 1) {
            scores[0]++;
            updateScores();
            firstGuess = false;
        }
    } else {
        selectedSingleNotes[note] = "incorrect";
        selectedSingleNotes[MIDIToNote(currentSingleNote, true)] = "correct";
        scores[0] = 0;
        //updateScores();
        firstGuess = false;
    }
    drawPiano();
}

function replayBothNotes() {
    if (singleNoteCounter >= 2) {
        const now = Tone.now();
        sampler.triggerAttackRelease(MIDIToNote(previousSingleNote), 1, now);
        sampler.triggerAttackRelease(MIDIToNote(currentSingleNote), 1, now + 1);
    }
}

drawPiano();