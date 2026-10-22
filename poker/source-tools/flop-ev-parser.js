/*
Instructions:

Open GTOWizard, go to Aggreagated Flop Reports and select action / position
Zoom out your browser as much as you can
Open the JavaScript console
    Mac: Command + Option + J
    Windows: Ctrl + Shift + J
Go to the beginning of the chart of flops and copy, paste, and run this code in the console
Go to the end of the chart and run the code again
Change the minEV and maxEV variables
    Find minEV and maxEV by sorting by EV
    minPercent and maxPercent will be found by parsing the highest and lowest EV flops
Return to the beginning and run the code again (must do this after minPercent and maxPercent are found)
Scroll left so that you can still the flops at the end of the previous code run and run the code again
    Use UP then Enter in the console to run the code quickly
Repeat until Total Count = 1755
Run the code a final time and click on the document within 3 seconds of running to copy to clipboard
    (Copy will not work if the document is not focused on)
Paste the copied text into Google Sheets or an Excel Spreadsheet
*/

// CHANGE THESE TWO VARIABLES
var minEV = 1.61
var maxEV = 3.62
// var minPercent = 44.477
// var maxPercent = 100
if (minPercent === undefined) {
    var minPercent = 100
}
if (maxPercent === undefined) {
    var maxPercent = 0
}
var totalFlops = document.getElementsByClassName("vue-recycle-scroller__item-wrapper")[0].children.length
var count = 0;
var lastFlop = ""
if (EVDict === undefined) {
    var EVDict = {}
}
for (let i = 0; i < totalFlops; i++) {
    let flopString = ""
    for (let j = 0; j < 3; j++) {
        let flopTextDiv = document.getElementsByClassName("vue-recycle-scroller__item-wrapper")[0].children[i].children[0].children[1].children[j]
        let suit = flopTextDiv.classList[0].substring(14)
        let rank = flopTextDiv.innerHTML
        flopString += rank + suit
    }
    let flopPercent = document.getElementsByClassName("vue-recycle-scroller__item-wrapper")[0].children[i].children[0].children[0].children[0].style.height
    let output = flopString + " - Height: " + flopPercent
    flopPercent = parseFloat(flopPercent.substring(0, flopPercent.length - 1))
    if (flopPercent < minPercent) {
        minPercent = flopPercent
    }
    if (flopPercent > maxPercent) {
        maxPercent = flopPercent
    }
    flopEV = Math.round((minEV + (maxEV - minEV) * (flopPercent - minPercent) / (maxPercent - minPercent - 0.05)) * 100 + 0.28) / 100
    EVDict[flopString] = flopEV
    output += ", EV: " + flopEV
    lastFlop = flopString
    count++
}
console.log("Current Parse Count: " + count)
console.log("Last Flop: " + lastFlop)
console.log(EVDict)
console.log("Total Count: " + Object.keys(EVDict).length)
console.log("minPercent: " + minPercent)
console.log("maxPercent: " + maxPercent)

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
    window.focus();
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

newRow = "	"
newCol = "\n"
copyText = ""
for (i in EVDict) {
    copyText += i + newRow + EVDict[i] + newCol
}
setTimeout(async() => await copyTextToClipboard(copyText), 3000)