var bounceDuration = 750;

function bounceAnimation(elapsed) {
    let progress = elapsed / bounceDuration;
    let scalingFunction = -2 * Math.cos(14.14 * Math.pow(progress, 3)) / (8.5 * Math.pow(progress + 0.7, 6) + 1) + 1;
    let bounceDeformation = Math.sin(scalingFunction * 2 * Math.PI) / 8;
    bluRX = bluRad * (1 + bounceDeformation);
    bluRY = bluRad * (1 - bounceDeformation);
    drawBlu();
}

let bounceStart, bouncePreviousTimeStamp;

// Current timestamp is passed in by window.requestAnimationFrame()
function bounce(timestamp) {
    if (bounceStart === undefined)
        bounceStart = timestamp;
    const elapsed = timestamp - bounceStart;

    bounceAnimation(elapsed);

    if (elapsed < bounceDuration) { // Stop the animation after bounceDuration milliseconds
        bouncePreviousTimeStamp = timestamp;
        window.requestAnimationFrame(bounce);
    } else {
        bounceAnimation(bounceDuration);
    }
}