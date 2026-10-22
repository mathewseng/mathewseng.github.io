var fps = 0;
var msLastFrame = 0;
var frames = 0;
var framesInLastSecond = [];
var scale = 1;
var startingZoom = 5;
var finalZoom = 0.5;
var zoom = startingZoom;
var introZoomProgress = -1;
var bluRad = 32 * zoom;
var bluSize = 2 * bluRad;
var gameWidth = 32 * 40;
var gameHeight = 32 * 21;
var bluStartingX = bluSize;
var bluStartingY = bluSize * 1.5;
var bluX = bluStartingX;
var bluY = bluStartingY;
var bluRX = bluRad;
var bluRY = bluRad;
var space = false;
var up = false;
var down = false;
var left = false;
var right = false;
var shift = false;
var enter = false;
var esc = false;
var z = false;
var x = false;
var click = false;
var deviceOrientationGranted = false;
var levelNum = 1;
var gameStarted = false;
var alpha = 0;
var beta = 0;
var gamma = 0;
var gravityX = 0;
var gravityY = 0;
var gravityZ = 0;

var svg = d3.select("body")
    .append("svg")
    .attr("width", gameWidth)
    .attr("height", gameHeight)
    .style("position", "absolute");

var availableHeight = Math.max(200, window.innerHeight - document.querySelector(".legacy-header").getBoundingClientRect().height);
var mobile = /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(navigator.userAgent) || /Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(navigator.userAgent);
/*if (typeof(DeviceMotionEvent) !== "undefined" && typeof(DeviceMotionEvent.requestPermission) === "function") {
    deviceOrientationGranted = DeviceMotionEvent.requestPermission().then(response => {return response == "granted";});
    if (deviceOrientationGranted) {
        requestDeviceOrientation();
    }
}*/
if (mobile && !deviceOrientationGranted) {
    d3.select("body")
        .append("button")
        .attr("id", "deviceOrientationButton")
        .attr("onclick", "requestDeviceOrientation()")
        .html("Access Device Orientation")
        .style("float", "left")
        .style("position", "absolute");
}

if (mobile) {
    let mobileWidth = window.innerWidth;
    let mobileHeight = window.innerWidth * (window.innerWidth / availableHeight);
    if (mobileWidth / gameWidth < mobileHeight / gameHeight) {
        scale = mobileWidth / gameWidth;
    } else {
        scale = mobileHeight / gameHeight;
    }
} else {
    if (window.innerWidth / gameWidth < availableHeight / gameHeight) {
        scale = window.innerWidth / gameWidth;
    } else {
        scale = availableHeight / gameHeight;
    }
}
svg.style("transform", "scale(" + scale + ")");
svg.style("transform-origin", "top left");

svg.append("text")
    .attr("class", "text introText")
    .attr("x", 100)
    .attr("y", 500)
    .style("font-size", 200)
    .text("Blu's");
svg.append("text")
    .attr("class", "text introText")
    .attr("x", 100)
    .attr("y", 650)
    .style("font-size", 200)
    .text("Adventure");

svg.append("text")
    .attr("id", "msLastFrameText")
    .attr("class", "text")
    .attr("x", 2)
    .attr("y", 14)
    .text("Last Frame: " + msLastFrame + " ms");
svg.append("text")
    .attr("id", "fpsText")
    .attr("class", "text")
    .attr("x", 2)
    .attr("y", 28)
    .text("FPS: " + fps);

function updateFPS(elapsed, frameTime) {
    frames++;
    for (let i = 0; i < framesInLastSecond.length; i++) {
        framesInLastSecond[i] += frameTime;
        if (framesInLastSecond[i] > 1000) {
            framesInLastSecond.splice(i, 1);
            i--;
        }
    }
    framesInLastSecond.push(0);
    msLastFrame = Math.round(frameTime);
    fps = elapsed < 1 ? frames / elapsed : framesInLastSecond.length;
    d3.select("#msLastFrameText").text("Last Frame: " + msLastFrame + " ms");
    d3.select("#fpsText").text("FPS: " + fps);
}

function flipY(y) {
    return gameHeight - y;
}

function updateZoom(z, level = true) {
    let ratio = z / zoom;
    zoom = z;
    bluRad = 32 * zoom;
    bluSize = 2 * bluRad;
    bluStartingX *= ratio;
    bluStartingY *= ratio;
    bluX *= ratio;
    bluY *= ratio;
    bluRX *= ratio;
    bluRY *= ratio;
    bluJumpPower = bluJumpPowerDefault * zoom;
    bluSpeed = bluSpeedDefault * zoom;
    gravity = zoom;
    if (level) createLevel(levelNum);
}

function introZoom(frameTime) {
    let zoomDuration = 3;
    let buffer = 999;
    let fadeDuration = 1.5;
    if (introZoomProgress === -1) {
        bluRad = 32 * finalZoom;
        createLevel(levelNum);
        introZoomProgress = 0;
    } else if (introZoomProgress === 0) {
        if (fps >= 30) {
            introZoomProgress += frameTime / 1000;
        }
    } else if (introZoomProgress < zoomDuration) {
        introZoomProgress += frameTime / 1000;
        if (introZoomProgress > 0) {
            updateZoom(startingZoom + (finalZoom - startingZoom) * 1.0135673 * (1 / (1 + Math.pow(Math.E, -10 * (introZoomProgress / zoomDuration - 0.5))) - 0.00669285), false);
            d3.selectAll(".introText")
                .style("opacity", (zoomDuration - introZoomProgress) / zoomDuration);
        }
    } else if (introZoomProgress < zoomDuration + buffer) {
        updateZoom(finalZoom, false);
        d3.selectAll(".introText").remove();
        gameStarted = true;
        introZoomProgress = zoomDuration + buffer;
    } else if (introZoomProgress < zoomDuration + buffer + fadeDuration) {
        introZoomProgress += frameTime / 1000;
        updateLevelOpacity((introZoomProgress - zoomDuration - buffer) / fadeDuration);
    } else {
        updateLevelOpacity(1);
    }
}

// Key Event listeners
window.addEventListener("keydown", function (event) {
    if (event.defaultPrevented) {
        return; // Do nothing if the event was already processed
    }

    switch (event.key) {
        case " ":
            console.log("space");
            space = true;
            break;
        case "Down": // IE/Edge specific value
        case "ArrowDown":
        case "s":
            console.log("down");
            down = true;
            break;
        case "Up": // IE/Edge specific value
        case "ArrowUp":
        case "w":
            console.log("up");
            up = true;
            break;
        case "Left": // IE/Edge specific value
        case "ArrowLeft":
        case "a":
            console.log("left");
            left = true;
            break;
        case "Right": // IE/Edge specific value
        case "ArrowRight":
        case "d":
            console.log("right");
            right = true;
            break;
        case "Shift":
            console.log("shift");
            shift = true;
            break;
        case "Esc": // IE/Edge specific value
        case "Escape":
            console.log("escape");
            esc = true;
            drawLevelEditorGrid(true);
            break;
        case "z":
            console.log("z");
            z = true;
            break;
        case "x":
            console.log("x");
            x = true;
            break;
        default:
            return; // Quit when this doesn't handle the key event.
    }
    // Cancel the default action to avoid it being handled twice
    event.preventDefault();
}, true);

window.addEventListener("keyup", function (event) {
    if (event.defaultPrevented) {
        return; // Do nothing if the event was already processed
    }

    switch (event.key) {
        case " ":
            space = false;
            break;
        case "Down": // IE/Edge specific value
        case "ArrowDown":
        case "s":
            down = false;
            break;
        case "Up": // IE/Edge specific value
        case "ArrowUp":
        case "w":
            up = false;
            break;
        case "Left": // IE/Edge specific value
        case "ArrowLeft":
        case "a":
            left = false;
            break;
        case "Right": // IE/Edge specific value
        case "ArrowRight":
        case "d":
            right = false;
            break;
        case "Shift":
            shift = false;
            break;
        case "Esc": // IE/Edge specific value
        case "Escape":
            esc = false;
            drawLevelEditorGrid(false);
            break;
        case "z":
            z = false;
            break;
        case "x":
            x = false;
            break;
        default:
            return; // Quit when this doesn't handle the key event.
    }
    // Cancel the default action to avoid it being handled twice
    event.preventDefault();
}, true);

var latestTap;
function mobileTap() {
    click = true;
    // Test for double tap
    var now = new Date().getTime();
    var timeSince = now - latestTap;
    if ((timeSince < 250) && (timeSince > 50)) {
        if (zoom < 4) {
            updateZoom(zoom * 2);
        } else {
            updateZoom(0.5);
        }
    }
    latestTap = new Date().getTime();
}

document.getElementById("html").addEventListener("touchstart", mobileTap);

function requestDeviceOrientation() {
    DeviceMotionEvent.requestPermission().then(response => {
        if (response == "granted") {
            // Add a listener to get device orientation in the alpha-beta-gamma axes (units in degrees)
            window.addEventListener("deviceorientation", (event) => {
                alpha = event.alpha;
                beta = event.beta;
                gamma = event.gamma;
            });
            // Add a listener to get device gravity direction
            window.addEventListener("devicemotion", (event) => {
                gravityX = event.accelerationIncludingGravity.x;
                gravityY = event.accelerationIncludingGravity.y;
                gravityZ = event.accelerationIncludingGravity.z;
            });
            deviceOrientationGranted = true;
            d3.select("#deviceOrientationButton").remove();
        }
    });
}
