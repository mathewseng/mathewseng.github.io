var rhythmTempo = 120;
var rhythmBeatGap = 4;
var rhythmBeatsPerMeasure = 4;
var rhythmSpacebarBoolean = true;
var rhythmLastBeatTime = 0;

const metronomeSampler = new Tone.Sampler({
	urls: {
		A1: "metronome-click.wav",
	},
    baseUrl: "./",
}).toDestination();

document.getElementById("rhythmTrainingBeatOffsetText").style.marginTop = (window.innerHeight / 3) + "px";

function rhythmStart() {
    document.getElementById("rhythmTrainingBeatOffsetText").innerHTML = "";
    document.body.style.backgroundColor = "black";
    Tone.loaded().then(() => {
        const now = Tone.now();
        rhythmLastBeatTime = now + (rhythmBeatsPerMeasure * (60 / rhythmTempo));
        for (let i = 0; i <= rhythmBeatsPerMeasure; i++) {
            metronomeSampler.triggerAttackRelease("A1", 1, now + (i * (60 / rhythmTempo)),
                i === 0 || i === rhythmBeatsPerMeasure ? 1 : 0.6);
        }
    });
}

function rhythmEnd() {
    let diff = Tone.now() - (rhythmLastBeatTime + rhythmBeatGap * (60 / rhythmTempo));
    let diffBeats = Math.round((diff / (60 / rhythmTempo)) * 100) / 100;
    let color = 120 / (Math.pow(2 * diffBeats, 2) + 1);
    document.getElementById("rhythmTrainingBeatOffsetText").innerHTML = "Off by " + diffBeats + " beats";
    document.body.style.backgroundColor = "hsl(" + color + ", 100%, 33%)";
}

function rhythmStartEndChoice() {
    if (rhythmSpacebarBoolean) {
        rhythmStart();
    } else {
        rhythmEnd();
    }
    rhythmSpacebarBoolean = !rhythmSpacebarBoolean;
}