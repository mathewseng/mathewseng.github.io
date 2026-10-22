var currentInterval = 0;
var extendedRange = false;

function revealCorrectIntervalText() {
    document.getElementById("intervalText").innerHTML = MIDIToNote(currentInterval);
}

function toggleExtendedRange() {
    extendedRange = !extendedRange;
}

function playNextInterval(extendedRange) {
    let baseNote = 36 + Math.floor(Math.random() * 31);
    if (extendedRange === false) {
        var interval = Math.floor(Math.random() * 12 + 1);
    } else {
        var interval = Math.floor(Math.random() * 24 + 1);
    }
    Tone.loaded().then(() => {
        const now = Tone.now();
        sampler.triggerAttackRelease(MIDIToNote(baseNote), 1, now);
        sampler.triggerAttackRelease(MIDIToNote(baseNote + interval), 1, now);
    });
}

function selectInterval(note) {
    if (singleNoteCounter !== 0) {
        if (typeof(note) === "number") {
            note = notes[note % 12];
        }
        revealCorrectIntervalText();
        deselectIntervals();
        guessInterval(note);
        Tone.loaded().then(() => {
            let noteMIDI = notes.indexOf(note);
            while (Math.abs(currentInterval - noteMIDI) > 6) {
                noteMIDI += 12;
            }
            sampler.triggerAttackRelease(MIDIToNote(noteMIDI), 1);
        });
    }
}

function deselectIntervals() {
    for (let i = 0; i < 12; i++) {
        selectedSingleNotes[notes[i]] = "";
    }
}

function guessInterval(note) {
    if (note === MIDIToNote(currentInterval, true)) {
        selectedSingleNotes[note] = "correctlySelected";
    } else {
        selectedSingleNotes[note] = "incorrect";
        selectedSingleNotes[MIDIToNote(currentInterval, true)] = "correct";
    }
    drawPiano();
}

function replayInterval() {
    if (singleNoteCounter >= 2) {
        const now = Tone.now();
        sampler.triggerAttackRelease(MIDIToNote(previousSingleNote), 1, now);
        sampler.triggerAttackRelease(MIDIToNote(currentInterval), 1, now + 1);
    }
}