const notes = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const noteKeys = ["Q", "2", "W", "3", "E", "R", "5", "T", "6", "Y", "7", "U"];
const noteKeyCodes = [81, 50, 87, 51, 69, 82, 53, 84, 54, 89, 55, 85];
const middleNote = 54;
const keyWidth = 24 * 4;
var displayKeyboardKeys = true;
const tabNamesArray = ["singleNoteTraining", "intervalTraining", "melodyTraining", "rhythmTraining"];
var selectedTab = 0;
for (tab of tabNamesArray) {
    if (tab !== tabNamesArray[0]) {
        $("#" + tab).hide();
    }
}
const slideDistance = window.innerWidth * 2
const slideSpeed = 750;
var scores = [0, 0, 0];
var highScores = [0, 0, 0];

const sampler = new Tone.Sampler({
    urls: {
        "A0": "A0.mp3",
        "C1": "C1.mp3",
        "D#1": "Ds1.mp3",
        "F#1": "Fs1.mp3",
        "A1": "A1.mp3",
        "C2": "C2.mp3",
        "D#2": "Ds2.mp3",
        "F#2": "Fs2.mp3",
        "A2": "A2.mp3",
        "C3": "C3.mp3",
        "D#3": "Ds3.mp3",
        "F#3": "Fs3.mp3",
        "A3": "A3.mp3",
        "C4": "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        "A4": "A4.mp3",
        "C5": "C5.mp3",
        "D#5": "Ds5.mp3",
        "F#5": "Fs5.mp3",
        "A5": "A5.mp3",
        "C6": "C6.mp3",
        "D#6": "Ds6.mp3",
        "F#6": "Fs6.mp3",
        "A6": "A6.mp3",
        "C7": "C7.mp3",
        "D#7": "Ds7.mp3",
        "F#7": "Fs7.mp3",
        "A7": "A7.mp3",
        "C8": "C8.mp3"
    },
    release: 1,
    baseUrl: "https://tonejs.github.io/audio/salamander/",
}).toDestination();

function MIDIToNote(index, truncate) {
    if (truncate) {
        return truncateNote(notes[index % 12] + parseInt(index / 12));
    }
    return notes[index % 12] + parseInt(index / 12);
}

function truncateNote(note) {
    return note.slice(0, -1);
}

function selectTab(direction) {
    document.body.style.backgroundColor = "black";
    if (direction === "left") {
        selectedTab += tabNamesArray.length - 1;
        selectedTab %= tabNamesArray.length;
        for (let i = 0; i < tabNamesArray.length; i++) {
            if (selectedTab === i) {
                $("#" + tabNamesArray[i]).show("slide", {direction: "left", distance: slideDistance}, slideSpeed);
            } else {
                $("#" + tabNamesArray[i]).hide("slide", {direction: "right", distance: slideDistance}, slideSpeed);
            }
        }
    } else {
        selectedTab++;
        selectedTab %= tabNamesArray.length;
        for (let i = 0; i < tabNamesArray.length; i++) {
            if (selectedTab === i) {
                $("#" + tabNamesArray[i]).show("slide", {direction: "right", distance: slideDistance}, slideSpeed);
            } else {
                $("#" + tabNamesArray[i]).hide("slide", {direction: "left", distance: slideDistance}, slideSpeed);
            }
        }
    }
}

function toggleKeyboardDisplay() {
    displayKeyboardKeys = !displayKeyboardKeys;
    drawPiano();
}

document.addEventListener("keydown", (event) => {
    switch (event.keyCode) {
        // "SPACE"
        case 32:
            if (selectedTab === 0) {
                playNextSingleNote(); event.preventDefault();
            } else if (selectedTab === 1) {
                playNextInterval(); event.preventDefault();
            } else if (selectedTab === 3) {
                rhythmStartEndChoice();
            }
            break;
        // "SHIFT"
        case 16: toggleKeyboardDisplay(); break;
        // "="
        case 187: toggleExtendedRange(); break;
        // "LEFT ARROW"
        case 37: selectTab("left"); break;
        // "RIGHT ARROW"
        case 39: selectTab("right"); break;
        // "O"
        case 79:
            singleNoteCounter = 0;
            playNextSingleNote();
            scores[0] = 0;
            updateScores(0);
            break;
        // "P"
        case 80: replayBothNotes(); break;
        // Piano keys
        case noteKeyCodes[0]: selectSingleNote(0); break;
        case noteKeyCodes[1]: selectSingleNote(1); break;
        case noteKeyCodes[2]: selectSingleNote(2); break;
        case noteKeyCodes[3]: selectSingleNote(3); break;
        case noteKeyCodes[4]: selectSingleNote(4); break;
        case noteKeyCodes[5]: selectSingleNote(5); break;
        case noteKeyCodes[6]: selectSingleNote(6); break;
        case noteKeyCodes[7]: selectSingleNote(7); break;
        case noteKeyCodes[8]: selectSingleNote(8); break;
        case noteKeyCodes[9]: selectSingleNote(9); break;
        case noteKeyCodes[10]: selectSingleNote(10); break;
        case noteKeyCodes[11]: selectSingleNote(11); break;
    }
});

function drawKey(note, x, y, width, height, fill) {
    svgSingleNote.append("rect")
        .attr("note", note)
        .attr("x", x)
        .attr("y", y)
        .attr("width", width)
        .attr("height", height)
        .attr("fill", fill)
        .attr("stroke", "black")
        .attr("stroke-width", keyWidth / 18)
        .on("click", element => {
            selectSingleNote(element.srcElement.getAttribute("note"));
        });
}

function drawKeyText(x, y, text, blackKey) {
    svgSingleNote.append("text")
        .attr("x", x)
        .attr("y", y)
        .style("font-size", keyWidth * 0.4)
        .style("fill", blackKey ? "white" : "black")
        .style("text-anchor", "middle")
        .text(text);
}

function getColor(note, blackKey) {
    if (selectedSingleNotes[note] === "correctlySelected") {
        return "green";
    } else if (selectedSingleNotes[note] === "correct") {
        return "yellowgreen";
    } else if (selectedSingleNotes[note] === "incorrect") {
        return "red";
    } else if (blackKey) {
        return "#131313";
    } else {
        return "white";
    }
}

function drawPiano() {
    drawKey("C", 0, 0, keyWidth, keyWidth * 5, getColor("C"));
    drawKey("D", keyWidth, 0, keyWidth, keyWidth * 5, getColor("D"));
    drawKey("E", keyWidth * 2, 0, keyWidth, keyWidth * 5, getColor("E"));
    drawKey("F", keyWidth * 3, 0, keyWidth, keyWidth * 5, getColor("F"));
    drawKey("G", keyWidth * 4, 0, keyWidth, keyWidth * 5, getColor("G"));
    drawKey("A", keyWidth * 5, 0, keyWidth, keyWidth * 5, getColor("A"));
    drawKey("B", keyWidth * 6, 0, keyWidth, keyWidth * 5, getColor("B"));
    drawKey("Db", keyWidth * 15/24, 0, keyWidth * 14/24, keyWidth * 3, getColor("Db", true));
    drawKey("Eb", keyWidth * 43/24, 0, keyWidth * 14/24, keyWidth * 3, getColor("Eb", true));
    drawKey("Gb", keyWidth * 85/24, 0, keyWidth * 14/24, keyWidth * 3, getColor("Gb", true));
    drawKey("Ab", keyWidth * 113/24, 0, keyWidth * 14/24, keyWidth * 3, getColor("Ab", true));
    drawKey("Bb", keyWidth * 141/24, 0, keyWidth * 14/24, keyWidth * 3, getColor("Bb", true));
    if (displayKeyboardKeys) {
        drawKeyText(keyWidth * 0.5, keyWidth * 4.5, noteKeys[0]);
        drawKeyText(keyWidth * 1.5, keyWidth * 4.5, noteKeys[2]);
        drawKeyText(keyWidth * 2.5, keyWidth * 4.5, noteKeys[4]);
        drawKeyText(keyWidth * 3.5, keyWidth * 4.5, noteKeys[5]);
        drawKeyText(keyWidth * 4.5, keyWidth * 4.5, noteKeys[7]);
        drawKeyText(keyWidth * 5.5, keyWidth * 4.5, noteKeys[9]);
        drawKeyText(keyWidth * 6.5, keyWidth * 4.5, noteKeys[11]);
        drawKeyText(keyWidth * 22/24, keyWidth * 2.8, noteKeys[1], true);
        drawKeyText(keyWidth * 50/24, keyWidth * 2.8, noteKeys[3], true);
        drawKeyText(keyWidth * 92/24, keyWidth * 2.8, noteKeys[6], true);
        drawKeyText(keyWidth * 120/24, keyWidth * 2.8, noteKeys[8], true);
        drawKeyText(keyWidth * 148/24, keyWidth * 2.8, noteKeys[10], true);
    }
}

function updateScores() {
    for (let i = 0; i < scores.length; i++) {
        if (scores[i] > highScores[i]) {
            highScores[i] = scores[i];
        }
    }
    d3.select("#scoreText").html("<b>Score</b>: " + scores[selectedTab] + "<br><b>High Score</b>: " + highScores[selectedTab]);
}

// Expose the original keyboard actions on touch screens as well.
function playExercise() {
    if (selectedTab === 0) playNextSingleNote();
    else if (selectedTab === 1) playNextInterval();
    else if (selectedTab === 3) rhythmStartEndChoice();
}

// Browsers require a user gesture before audio can play.
document.addEventListener('pointerdown', () => Tone.start(), { once: true, capture: true });
document.addEventListener('keydown', () => Tone.start(), { once: true, capture: true });
