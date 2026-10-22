const mobile = /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(navigator.userAgent) || /Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(navigator.userAgent);
const width = window.innerWidth;
const height = Math.max(480, window.innerHeight - document.querySelector(".legacy-header").getBoundingClientRect().height - 12);
var started = false;
var muted = true;

var streetTimes = [10, 15, 20, 25, 30];
var timeLeft = 0;
var prevTimeLeft = 0;
var street = 0;
var timeBankPressed = false;
var timeBanksUsed = 0;

var unit = width / 37;
var bWidth = unit * 8;
var bHeight = unit * 4;
var textSize = unit * 2.5;

var svg = d3.select("#legacy-stage").append("svg")
    .attr("width", width)
    .attr("height", Math.max(400, height - Math.max(44, unit) * 2 - 16))
    .attr("y", unit)

function clickButton(s, id) {
    if (s === 4) {
        timeBanksUsed++;
        timeLeft += streetTimes[s];
        timeBankPressed = true;
        //let color = timeBanksUsed === 1 ? "#666" : timeBanksUsed === 2 ? "#999" : timeBanksUsed === 3 ? "#ccc" : "#fff";
        //d3.select("#" + id + "Button").style("fill", color);
        d3.select("#TimeBankText").text("Time Bank (" + timeBanksUsed + ")");
    } else {
        street = s;
        timeBankPressed = false;
        d3.select("#TimeBankText").text("Time Bank");
        d3.selectAll(".button").style("fill", "#333");
        d3.select("#" + id + "Button").style("fill", "#666");
    }
}

function buildButton(s, text, bWidth, bHeight, x, y) {
    var id = text.replace(/ /g, "");
    d3.select("#legacy-stage").append("input")
        .attr("id", id)
        .attr("class", "input")
        .style("width", bWidth + "px")
        .style("height", Math.max(44, unit) + "px")
        .style("margin-left", unit + "px")
        .style("font-size", Math.max(14, unit * 0.9) + "px")
        .attr("value", streetTimes[s]);
    document.getElementById(id).addEventListener("input", (e) => {streetTimes[s] = Math.max(1, Math.min(3600, Number(e.target.value) || 1));});
    svg.append("rect")
        .attr("id", id + "Button")
        .attr("class", "button")
        .attr("width", bWidth)
        .attr("height", bHeight)
        .attr("x", x)
        .attr("y", y)
        .on("click", () => clickButton(s, id));
    document.getElementById(id + "Button").addEventListener("touchstart", () => {clickButton(s, id)});
    svg.append("text")
        .attr("id", id + "Text")
        .attr("class", "text")
        .attr("x", x + bWidth / 2)
        .attr("y", y + bHeight / 2 + textSize / 3)
        .attr("font-size", textSize)
        .text(text)
        .on("click", () => clickButton(s, id));
    //document.getElementById(id + "Text").addEventListener("touchstart", () => {clickButton(s, id)});
}
buildButton(0, "Preflop", bWidth, bHeight, unit, 0);
buildButton(1, "Flop", bWidth, bHeight, unit * 10, 0);
buildButton(2, "Turn", bWidth, bHeight, unit * 19, 0);
buildButton(3, "River", bWidth, bHeight, unit * 28, 0);
buildButton(4, "Time Bank", unit * 35, bHeight, unit, Math.max(400, height - Math.max(44, unit) * 2 - 16) - bHeight);
$("svg").each(function() {
    $(this).insertAfter($(this).parent().find("#River"));
});
var mainText = svg.append("text")
    .attr("class", "text")
    .attr("x", width / 2)
    .attr("y", height / 2 + width / 16)
    .attr("font-size", width > height * 5/3 ? width / 4 : width / 3)
    .text("Start");

var latestTap;
var startTouchX;
var startTouchY;
//document.getElementById("html").addEventListener("touchstart", reset);
//document.getElementById("html").addEventListener("touchmove", swipe);
function getTouches(evt) {
    return evt.touches ||          // browser API
        evt.originalEvent.touches; // jQuery
}
/*function swipe(evt) {
    if (Math.sqrt(Math.pow(startTouchX - evt.touches[0].clientX, 2) + Math.pow(startTouchY - evt.touches[0].clientY, 2)) > 500) {
        restart();
        startTouchX = null;
        startTouchY = null;
    }
}*/

function restart() {
    timeLeft = 0;
    started = false;
    timeBanksUsed = 0;
    timeBankPressed = false;
    d3.select("#TimeBankText").text("Time Bank");
}

function reset(evt=null) {
    /*if (evt) {
        const firstTouch = getTouches(evt)[0];
        startTouchX = firstTouch.clientX;
        startTouchY = firstTouch.clientY;
    } else if (mobile) {
        return;
    }*/
    started = true;
    // Test for double tap
    var now = new Date().getTime();
    var timeSince = now - latestTap;
    if (timeSince < 300) {
        restart();
    }
    latestTap = new Date().getTime();
    if (!timeBankPressed) {
        timeLeft = streetTimes[street];
        timeBanksUsed = 0;
        //d3.select("#TimeBankButton").style("fill", "#333");
        d3.select("#TimeBankText").text("Time Bank");
    }
    timeBankPressed = false;
    // Load/Test Tone.js
    Tone.loaded().then(() => {
        const now = Tone.now()

        Tone.start();
        //console.log(Tone.context.state);
        // For devices/browsers that start the audiocontext in suspended mode, this prompts the user to unmute sound.
        if (Tone.context.state !== "running" && muted) {
            d3.select("unmute")
                .attr("width", width)
                .attr("height", height)
            $("#unmute").show();
            document.querySelector("#unmute").addEventListener("click", function() {
                Tone.context.resume().then(() => {
                    $("#unmute").hide();
                    muted = false;
                });
            });
        }
    });
}

function updateText() {
    mainText.text((Math.round(timeLeft * 100) / 100).toFixed(2));
}

let timerStart, timerPreviousTimeStamp;
// Current timestamp is passed in by window.requestAnimationFrame()
function timer(timestamp) {
    if (timerStart === undefined)
        timerStart = timestamp;
    const elapsed = timestamp - timerStart;
    const frameTime = timestamp - timerPreviousTimeStamp;

    if (timerPreviousTimeStamp !== undefined && started) {
        if (timeLeft > 0) {
            updateText();
            timeLeft -= frameTime / 1000;
            d3.select("#legacy-stage").style("background", "hsl(" + 120 * timeLeft / streetTimes[street] + ", 100%, 33%)");
        } else {
            timeLeft = 0;
            updateText();
            d3.select("#legacy-stage").style("background", "black");
        }
        for (let i = 0; i <= 3; i++) {
            if (prevTimeLeft > i && timeLeft <= i) {
                if (i === 0) {
                    clickButton(4)
                    timeBankPressed = false;
                }
                Tone.loaded().then(() => {
                    sampler.triggerAttackRelease(i === 0 ? "C5" : "G4", 1);
                });
            }
        }
        prevTimeLeft = timeLeft;
    }
    if (!started) {
        d3.select("#legacy-stage").style("background", "black");
        mainText.text("Start");
    }
    timerPreviousTimeStamp = timestamp;
    window.requestAnimationFrame(timer);
}

window.requestAnimationFrame(timer);

const sampler = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.2, release: 0.1 } }).toDestination();
document.getElementById("legacy-stage").addEventListener("click", event => {
    if (!event.target.closest("input, a, button")) reset();
});
document.querySelectorAll(".input").forEach(input => {
    input.type = "number";
    input.min = "1";
    input.max = "3600";
    input.setAttribute("aria-label", input.id.replace(/([A-Z])/g, " $1").trim() + " seconds");
});
