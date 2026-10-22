const tabNamesArray = ["pitchTest", "rhythmTest"];
const testNames = ["Pitch", "Rhythm"]
var selectedTab = 0;
for (tab of tabNamesArray) {
    if (tab !== tabNamesArray[0]) {
        $("#" + tab).hide();
    }
}
const slideDistance = window.innerWidth * 2
const slideSpeed = 750;
var scores = [
    [0, 0, 0, 0, [0, 0], [0, 0], [0, 0], [0, 0]],
    [0, 0, 0, 0, [0, 0], [0, 0], [0, 0], [0, 0]]
];
const instructionMessage = "Press space or click anywhere that's not a button to listen<br>Turn your volume to a comfortable level<br>Make sure your phone isn't on silent<br>Results are copied to clipboard after every test"
var testsText = ""
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
    updateScores()
}

document.addEventListener("keydown", (event) => {
    switch (event.keyCode) {
        // "SPACE"
        case 32:
            event.preventDefault();
            play()
            break;
        // "LEFT ARROW"
        case 37: selectTab("left"); break;
        // "RIGHT ARROW"
        case 39: selectTab("right"); break;
    }
});

$(document).on("click", function (event) {
    play()
});
$("button").on("click", function (event) {
    event.stopPropagation();
});

document.addEventListener("touchstart", handleTouchStart, false);
document.addEventListener("touchmove", handleTouchMove, false);

var xDown = null;
var yDown = null;

function getTouches(evt) {
  return evt.touches ||             // browser API
         evt.originalEvent.touches; // jQuery
}

function handleTouchStart(evt) {
    const firstTouch = getTouches(evt)[0];
    xDown = firstTouch.clientX;
    yDown = firstTouch.clientY;
};

function handleTouchMove(evt) {
    if ( ! xDown || ! yDown ) {
        return;
    }

    var xUp = evt.touches[0].clientX;
    var yUp = evt.touches[0].clientY;

    var xDiff = xDown - xUp;
    var yDiff = yDown - yUp;

    if ( Math.abs( xDiff ) > Math.abs( yDiff ) ) {/*most significant*/
        if ( xDiff > 0 ) {
            selectTab("right")
        } else {
            selectTab("left")
        }
    } else {
        if ( yDiff > 0 ) {
            /* down swipe */
        } else {
            /* up swipe */
        }
    }
    /* reset values */
    xDown = null;
    yDown = null;
};

function play() {
    if (selectedTab === 0) {
        pitchTest();
    } else if (selectedTab === 1) {
        rhythmTest();
    }
}

function updateScores(t = "") {
    for (let i = 0; i < scores.length; i++) {
        if (scores[i][2] > scores[i][3]) {
            scores[i][3] = scores[i][2];
        }
    }
    testsText += t
    copyTextToClipboard("p" + scores[0][0] + "/" + scores[0][1] + "|r" + scores[1][0] + "/" + scores[1][1] + testsText)
    d3.select("#scoreText").html("<b>" + testNames[selectedTab] + "</b><br><b>Total</b>: " + scores[selectedTab][0] + "/" + scores[selectedTab][1] + "<br><b>Score</b>: " + scores[selectedTab][2] + "<br><b>High Score</b>: " + scores[selectedTab][3] + "<br><b>Difficulty 1</b>: " + scores[selectedTab][4][0] + " / " + scores[selectedTab][4][1] + "<br><b>Difficulty 2</b>: " + scores[selectedTab][5][0] + " / " + scores[selectedTab][5][1] + "<br><b>Difficulty 3</b>: " + scores[selectedTab][6][0] + " / " + scores[selectedTab][6][1] + "<br><b>Difficulty 4</b>: " + scores[selectedTab][7][0] + " / " + scores[selectedTab][7][1])
}


Array.prototype.max = function() {
    return Math.max.apply(null, this);
};

Array.prototype.min = function() {
    return Math.min.apply(null, this);
};

function setDifficulty() {
    let tests = [scores[selectedTab][4][1], scores[selectedTab][5][1], scores[selectedTab][6][1], scores[selectedTab][7][1]]
    let choices = []
    for (let i = 0; i < 4; i++) {
        if (tests[i] === Math.min(tests[0], tests[1], tests[2], tests[3])) {
            choices.push(i)
        }
    }
    difficulty = choices[Math.floor(Math.random() * choices.length)]
}

function fallbackCopyTextToClipboard(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;

    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      var successful = document.execCommand('copy');
      var msg = successful ? 'successful' : 'unsuccessful';
      console.log('Fallback: Copying text command was ' + msg);
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }

    document.body.removeChild(textArea);
}
function copyTextToClipboard(text) {
    if (!navigator.clipboard) {
      fallbackCopyTextToClipboard(text);
      return;
    }
    navigator.clipboard.writeText(text).then(function() {
      console.log('Async: Copying to clipboard was successful!');
    }, function(err) {
      console.error('Async: Could not copy text: ', err);
    });
}
// Browsers require a user gesture before audio can play.
document.addEventListener('pointerdown', () => Tone.start(), { once: true, capture: true });
document.addEventListener('keydown', () => Tone.start(), { once: true, capture: true });
