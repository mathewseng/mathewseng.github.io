// Go to bottom for instructions and notes

// Defines array of index to hand pairs (Ex. 0: AA, 1: AKs, 13: AKo, 168: 22)
let specialSpace = " ";
let cards = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
let indexToHand = [];
for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
        if (i === j) {
            indexToHand.push(cards[i] + cards[j]);
        } else if (i < j) {
            indexToHand.push(cards[i] + cards[j] + "s");
        } else {
            indexToHand.push(cards[j] + cards[i] + "o");
        }
    }
}
// Extracts colors from hand
function extractUniqueHexColors(rgbs) {
    // Regular expression to match RGB color values
    const rgbRegExp = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g;

    // Function to convert an RGB color value to a HEX color value
    function rgbToHex(r, g, b) {
        return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
    }

    // Extract RGB color values from the rgbs string
    const rgbValues = [...rgbs.matchAll(rgbRegExp)].map(match => {
        return {r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3])};
    });

    // Convert RGB values to HEX values and filter out duplicates
    const uniqueHexValues = [...new Set(rgbValues.map(({r, g, b}) => rgbToHex(r, g, b)))];

    return uniqueHexValues;
}
// Extracts freqs for each action
function extractNonCumulativePercentages(percents) {
    if (percents === "") {
        return [0];
    }

    // Regular expression to match percentages
    const percentageRegExp = /(\d+(?:\.\d+)?)%/g;

    // Extract percentage values from the percents string
    const percentageValues = [...percents.matchAll(percentageRegExp)].map(match => parseFloat(match[1]));

    // Filter out only the first percentage of each group
    const cumulativePercentages = percentageValues.filter((_, index) => index % 2 === 0);

    // Calculate the non-cumulative percentages
    const nonCumulativePercentages = cumulativePercentages.reduce((acc, percentage, index) => {
        if (index === 0) {
            acc.push(Math.round(percentage * 10) / 10);
        } else {
            acc.push(Math.round((percentage - acc.reduce((a, b) => a + b, 0)) * 10) / 10);
        }
        return acc;
    }, []);
    // Add the range height as the first percentage
    nonCumulativePercentages.unshift(percentageValues[1] > 99.5 ? 100 : Math.round(percentageValues[1] * 10) / 10);

    return nonCumulativePercentages;
}

// Action names, colors, and freqs
let actionNames = ["C", "F", "R1", "R1_2", "R2", "R2_2", "R3", "R3_2", "R4", "R4_2"];
let actionColors = {};
for (act of actionNames) {
    actionColors[act] = getComputedStyle(document.documentElement).getPropertyValue("--clr-" + act).toLowerCase();
}
let actionFreqs = {};
function getFreqs() {
    actionFreqs = {};
    actionFreqs["Height"] = [];
    for (act of actionNames) {
        actionFreqs[act] = [];
    }
    // Push every hand's freqs for each action into their respective arrays
    for (let i = 0; i < 169; i++) {
        // Get CSS style from hand div
        let style = document.getElementsByClassName("ra_table")[0].children[i].style;
        // Format: '21.5% 100%, 86.5% 100%, 100% 100%'
        // -> [100, 21.5, 65, 13.5]
        let colorFreqs = extractNonCumulativePercentages(style.backgroundSize);
        // Format: 'linear-gradient(to right, rgb(216, 59, 59), rgb(216, 59, 59)), linear-gradient(to right, rgb(245, 83, 83), rgb(245, 83, 83)), linear-gradient(to right, rgb(90, 185, 102), rgb(90, 185, 102))'
        // -> ['#d83b3b', '#f55353', '#5ab966']
        let colors = extractUniqueHexColors(style.backgroundImage);

        actionFreqs["Height"].push(colorFreqs[0]);
        for (action of actionNames) {
            if (colorFreqs.length === 0) {
                actionFreqs[action].push(0);
                continue;
            }
            if (colors.indexOf(actionColors[action]) === -1) {
                actionFreqs[action].push(0);
            } else {
                actionFreqs[action].push(colorFreqs[colors.indexOf(actionColors[action]) + 1]);
            }
        }
    }
}

// Print GTO ranges for each action array
function printGTO() {
    for (const [name, freqs] of Object.entries(actionFreqs)) {
        // Array of each unique freqency percentage
        let actionUniqueFreqs = [0];
        for (let i = 0; i < 169; i++) {
            if (!actionUniqueFreqs.includes(freqs[i])) {
                actionUniqueFreqs.push(freqs[i]);
            }
        }
        // Sort descending
        actionUniqueFreqs.sort(function(a, b) {return b - a});
        let actionString = "";
        for (let freq of actionUniqueFreqs) {
            if (freq === 0) {
                continue;
            } else if (freq === 100) { // 100% frequency does not need [100]XX[/100]
                for (let i = 0; i < 169; i++) {
                    if (freqs[i] === freq) {
                        actionString += indexToHand[i] + ",";
                    }
                }
                actionString = actionString.substring(0, actionString.length - 1);
            } else { // 90% frequency -> [90]XX[/90]
                actionString += "[" + freq + "]";
                for (let i = 0; i < 169; i++) {
                    if (freqs[i] === freq) {
                        actionString += indexToHand[i] + ",";
                    }
                }
                actionString = actionString.substring(0, actionString.length - 1);
                actionString += "[/" + freq + "]";
            }
            actionString += ",";
        }
        actionString = actionString.substring(0, actionString.length - 1);
        // Only print if not empty
        if (actionString !== "") {
            console.log(name + ": " + actionString);
        }
    }
}

// Prints freqs from actionFreqs
function printFreqs() {
    for (const [name, freqs] of Object.entries(actionFreqs)) {
        let actionString = "";
        for (let i = 0; i < 169; i++) {
            actionString += " ".repeat(5 - freqs[i].toString().length) + freqs[i] + (i % 13 === 12 ? "\n" : "");
        }
        actionString = actionString.substring(0, actionString.length - 1);
        // Only print if not all 0s
        if (!/^[0\s]*$/.test(actionString)) {
            console.log(name + ":\n" + actionString);
        }
    }
}

let onlyInterval = null;
function copyToClipboard(text) {
    let copyInterval = setInterval(async function() {
        try {
            await window.navigator.clipboard.writeText(text);
            console.log("Copied to clipboard");
            clearInterval(copyInterval); // Clear interval if copy is successful
        } catch (err) {
            // If error, interval is not cleared and will try again
            console.log("PRESS TAB OR CLICK GTOWIZARD TO COPY");
            // Clear interval if new one is created
            if (onlyInterval !== copyInterval) {
                clearInterval(copyInterval);
            }
        }
    }, 100); // Try every 0.1 seconds
    onlyInterval = copyInterval;
}


// Converts freqs into buckets of 25% frequency and copies to clipboard for pasting in Google Sheets
const actions = ["A", "Y", "R", "C", "F"];
function printAndCopySimplifiedRange(copy = true) {
    let handBuckets = [];
    let actionToColorDict = {
        "A": "R4",
        "Y": "R2",
        "R": "R1",
        "C": "C",
        "F": "F"
    };

    // Update actionToColorDict based on the non-zero keys in actionFreqs
    let nonZeroKeys = Object.keys(actionFreqs).filter(key => actionFreqs[key].some(freq => freq !== 0));
    // If R4, R3, R2, R1, C
    if (nonZeroKeys.includes("R3")) {
        actionToColorDict["F"] = "R3";
    }
    // If R2, R1, C, F
    if (!nonZeroKeys.includes("R4") && !nonZeroKeys.includes("R3")) {
        actionToColorDict["A"] = "R2";
        actionToColorDict["Y"] = "R4";
    }
    // Convert actionFreqs to buckets
    for (let i = 0; i < 169; i++) {
        let bucket = "";
        // Set A, Y, R, C, F to the correct actionFreqs
        let A = actionFreqs[actionToColorDict["A"]][i];
        let Y = actionFreqs[actionToColorDict["Y"]][i];
        let R = actionFreqs[actionToColorDict["R"]][i];
        let C = actionFreqs[actionToColorDict["C"]][i];
        let F = actionFreqs[actionToColorDict["F"]][i];

        // Create P90Q buckets
        let found = false;

        // Create an array of objects representing each action and its frequency
        let actionFreqArray = actions.map(action => {
            return {action: action, freq: actionFreqs[actionToColorDict[action]][i]}
        });

        // Sort the array by frequency in descending order
        actionFreqArray.sort((a, b) => b.freq - a.freq);

        // Check if Q is the second most frequent action and 5 <= Q < 15
        if (actionFreqArray[1].freq >= 5 && actionFreqArray[1].freq < 15) {
            bucket = actionFreqArray[0].action + "90" + actionFreqArray[1].action;
            found = true;
        }

        if (!found) {
            if (A === 0 && Y === 0 && R === 0 && C === 0 && F === 0) {
                bucket = "NONE"; // Not In Range
            } else {
                // 1. Put values of A, Y, R, C, F in a dictionary
                let actionFreqDict = { A, Y, R, C, F };
                // 2. If lowest frequency action is >= 12.5 and < 37.5, then bucket += action letter
                // 3. If lowest frequency action is >= 37.5, then bucket += action letter * 2
                // 4. Remove lowest frequency action dictionary
                // 5. Repeat 2-4 until dictionary has one action left
                while (Object.keys(actionFreqDict).length > 1) {
                    let lowestAction = Object.keys(actionFreqDict).reduce((a, b) => actionFreqDict[a] < actionFreqDict[b] ? a : b);
                    let lowestFreq = actionFreqDict[lowestAction];
                    if (lowestFreq >= 12.5 && lowestFreq < 37.5) {
                        bucket += lowestAction[0];
                    } else if (lowestFreq >= 37.5) {
                        bucket += lowestAction[0] + lowestAction[0];
                    }
                    delete actionFreqDict[lowestAction];
                }
                // 6. Fill bucket with the remaining action letter until it has a length of 4
                let remainingAction = Object.keys(actionFreqDict)[0];
                while (bucket.length < 4) {
                    bucket += remainingAction[0];
                }
                // 7. Sort in correct action order
                bucket = [...bucket].sort((a, b) => "AYRCF".indexOf(a) - "AYRCF".indexOf(b)).join("");
            }
        }

        handBuckets.push(bucket);
    }
    console.log(handBuckets);
    let readableString = "\n";
    for (let i = 0; i < 169; i++) {
        readableString += indexToHand[i] + (indexToHand[i].length === 3 ? " " : "  ") + handBuckets[i] + " / ";
        if (i % 13 === 12) {
            readableString = readableString.substring(0, readableString.length - 3);
            readableString += "\n";
        }
    }
    console.log(readableString);
    // Convert handBuckets to rangeString
    let freqsStrings = calcTotalActionFreqs();
    let rangeString = "";
    // If dropdown is visible, add range title
    if (includeTitle && document.getElementsByClassName("hspotscont_inner_maximized").length > 0) {
        rangeString += "\t" + rangeTitle() + "\t".repeat(13) + "\n";
    }
    for (let i = 0; i < 169; i++) {
        let actionFreqString = " ";
        if (Math.floor(i / 13) < freqsStrings.length) {
            actionFreqString = freqsStrings[Math.floor(i / 13)];
            console.log(actionFreqString)
        }
        rangeString += (i % 13 === 0 ? "\"" + actionFreqString + "\"" + "\t" : "") + "\"" + indexToHand[i] + "     " + handBuckets[i] + "\"" + (i % 13 === 12 ? "\t" + "\n" : "\t");
    }
    // Print and copy to clipboard
    console.log(rangeString);
    // 0.5s delay to press Tab so document is focused and you can copy to clipboard
    if (copy) {
        copyToClipboard(rangeString);
    }
    return rangeString;
}

function calcTotalActionFreqs(print = false) {
    let totalActionFreqs = {};
    let totalFrequency = 0;

    for (const action in actionFreqs) {
        if (action === "Height") continue; // Skip Height

        let actionFrequency = 0;

        for (let i = 0; i < actionFreqs[action].length; i++) {
            let combos = indexToHand[i].substring(2) === "o" ? 12 : indexToHand[i].substring(2) === "s" ? 4 : 6;
            // Multiply the individual hand's freqs by its height
            actionFrequency += actionFreqs[action][i] * actionFreqs["Height"][i] * combos;
        }

        totalActionFreqs[action] = actionFrequency;
        totalFrequency += actionFrequency;
    }

    for (const action in totalActionFreqs) {
        let percentage = (totalActionFreqs[action] / totalFrequency) * 100;
        // Round to the nearest tenth
        percentage = Math.round(percentage * 10) / 10;
        totalActionFreqs[action] = percentage;
        if (print) {
            console.log(action + ": " + percentage + "%");
        }
    }
    const actionToKeyDict = {
        "A": "R4",
        "Y": "R2",
        "R": "R1",
        "C": "C",
        "F": "F"
    };

    if (totalActionFreqs["R3"] !== 0) {
        actionToKeyDict["F"] = "R3";
    }

    if (totalActionFreqs["R4"] === 0 && totalActionFreqs["R3"] === 0) {
        actionToKeyDict["A"] = "R2";
        actionToKeyDict["Y"] = "R4";
    }

    let freqsArray = [];
    for (let action of actions) {
        freqsArray.push([action, totalActionFreqs[actionToKeyDict[action]]]);
    }

    if (totalActionFreqs["R3"] !== 0) {
        freqsArray = [freqsArray[0], freqsArray[4], ...freqsArray.slice(1, 4), ...freqsArray.slice(5)];
    }
    freqsArray = freqsArray.filter(innerArray => innerArray[1] !== 0);

    let freqsStrings = [];
    for (let innerArray of freqsArray) {
        freqsStrings.push(innerArray[1] + specialSpace.repeat(actions.indexOf(innerArray[0]) + 1));
    }

    if (print) {
        console.log(totalActionFreqs);
        console.log(freqsArray);
        console.log(freqsStrings);
    }
    return freqsStrings;
}

const raiseNames = ["", "Open", "3b", "4b", "5b", "6b", "7b", "8b", "9b", "AI", "Iso", "Limp"];
function convertActionName(actionString, raiseNum, i, addRaise = false) {
    let action = actionString.split(" ").length <= 2 ? actionString.split(" ")[0] : actionString;
    let size = actionString.split(" ")[1];
    if (["Fold", "Check"].includes(action) || action.includes("AI") || (action === "Call" && i !== 0)) {
        return action;
    }
    if (action === "Call") {
        raiseNum = -1;
    }
    if (action === "Allin") {
        raiseNum = -3;
    }
    if (action === "Raise") {
        raiseNum += Math.sign(raiseNum + 0.5);
        if (raiseNum === -3) {
            raiseNum = 2;
        }
    }
    return raiseNames.slice(raiseNum)[0] + (size === "" ? "" : " " + size);
}

function rangeTitle() {
    // Maximize node selector bar
    let nodeSelectorBar = document.getElementsByClassName("evecrd_minimized")[0]
    if (nodeSelectorBar !== undefined) nodeSelectorBar.click();

    let title = "";
    let raiseNum = 0;
    let depth = [...document.getElementById("hspotscont_inner").children].findIndex(element => element.classList.contains("evecrd_active"));
    console.log(depth)
    for (let i = 0; i <= depth; i++) {
        let position = "";
        if (includePosition) {
            position = document.getElementById("hspotscont_inner").children[i].children[0].children[0].innerHTML.match(/(?<=\s).*?(?=\s)/)[0] + " ";
        }
        let actionElements = [...document.getElementsByClassName("evecrd_actions")[i].children].find(element => element.classList.contains("evecrd_action_active"))
        let actionString = "? ";
        // If last action
        if (i === depth) {
            actionString = [...document.getElementsByClassName("evecrd_actions")[i].children].map(element => convertActionName(element.children[0].innerHTML, raiseNum, null)).toString().replace(/,/g, " / ");
            if (depth > 0) {
                actionString = actionString.replace("Fold / Call", "?");
                actionString = actionString.replace("? / ", "");
                actionString = actionString.replace("Check / ", "");
            } else {
                actionString = actionString.replace("Fold / Call", "Limp");
            }
        } else {
            actionString = actionElements.children[0].innerHTML;
            actionString = convertActionName(actionString, raiseNum, i);
        }
        if (actionString === "Limp") {
            raiseNum = -1;
        } else if (actionString.includes("b") || actionString.includes("Open")) {
            raiseNum++;
        }
        title += position + actionString;
        if (i < depth) {
            title += " > ";
        }
    }
    console.log(title);
    return title;
}

function joinRangesForSheets(str1, str2) {
    let rows1 = str1.split("\n");
    let rows2 = str2.split("\n");

    let combinedRows = rows1.map((row, index) => row + (rows2[index] || ""));
    let combinedStr = combinedRows.join("\n");

    return combinedStr;
}

function copy() {
    let whitespace = "\" \"\n".repeat((rowOfRanges[currentRow].match(/\n/g) || []).length);
    copyToClipboard(rowOfRanges.map(row => joinRangesForSheets(row, whitespace)).join(""));
}

let rowOfRanges = [""];
let rangeTitles = "";
let currentRow = 0;
function concatRange() {
    try {
        let title = rangeTitle();
        getFreqs();
        if (rowOfRanges[currentRow] === "") {
            rowOfRanges[currentRow] = printAndCopySimplifiedRange(false);
            rangeTitles = title;
        } else {
            rowOfRanges[currentRow] = joinRangesForSheets(rowOfRanges[currentRow], printAndCopySimplifiedRange(false));
            rangeTitles += " --> " + title;
        }
        // Print and copy to clipboard
        console.log(rangeTitles);
        copy();
    } catch (e) {
        console.log("MAXIMIZE NODE SELECTOR BAR");
    }
}

function resetConcat() {
    rowOfRanges = [""];
    rangeTitles = "";
    currentRow = 0;
}

function emptyRange() {
    let emptyRange = ("\" \"\t".repeat(14) + "\n").repeat((rowOfRanges[0].match(/\n/g) || []).length);

    // Check if the current row is empty
    if (rowOfRanges[currentRow] === "") {
        rowOfRanges[currentRow] = emptyRange;
    } else {
        rowOfRanges[currentRow] = joinRangesForSheets(rowOfRanges[currentRow], emptyRange);
    }

    copy();
    if (rowOfRanges[currentRow] === "\n".repeat((rowOfRanges[0].match(/\n/g) || []).length)) {
        rangeTitles += " --> ";
    }
    rangeTitles += "EMPTY";
}

function newRow() {
    rangeTitles += "\n";
    currentRow++;
    rowOfRanges.push("\" \"\n".repeat((rowOfRanges[0].match(/\n/g) || []).length));
}

let nodeNum = 0;
function clickFirstNode() {
    //document.getElementById("hspotscont_inner").children[0].click();
    document.getElementsByClassName("mdi-restart")[0].click();
    nodeNum = 0;
}

function clickPreviousNode(nodesBack = 1) {
    if (nodeNum !== 0) {
        document.getElementById("hspotscont_inner").children[nodeNum - nodesBack].click();
        nodeNum -= nodesBack;
    } else {
        console.log("Already at first node");
    }
}

function clickNthAction(n) {
    document.getElementById("hspotscont_inner").children[nodeNum].children[0].children[1].children[n].click();
    nodeNum++;
}

function clickSolutionSelector() {
    document.getElementById("gmf_vertical").click();
}

function clickSolution(text) {
    Array.from(document.getElementsByClassName("gmfslctr_center")[0].querySelectorAll(".checkbox-btn")).filter(el => el.innerText === text)[0].click();
}

function tape(tape) {
    // Maximize node selector bar
    let nodeSelectorBar = document.getElementsByClassName("evecrd_minimized")[0]
    if (nodeSelectorBar !== undefined) nodeSelectorBar.click();

    // Split tape into individual commands
    let commands = tape.match(/'[^']*'|<+|[^ ]/g);
    console.log(commands)

    // Helper function to delay execution of function by 1s
    function delay(fn, delaySeconds = 1) {
        return new Promise(resolve => {
            fn();
            setTimeout(() => {
                resolve();
            }, delaySeconds * delayMs);
        });
    }

    // Map of commands to functions
    let commandMap = {
        "c": concatRange,
        "n": newRow,
        "e": emptyRange,
        "r": resetConcat,
        "f": clickFirstNode,
        "s": clickSolutionSelector,
    };

    // Iterate over each command in tape
    (async () => {
        for (let command of commands) {
            // If the command is a number, pass it as an argument to clickNthAction
            if (!isNaN(parseInt(command))) {
                await delay(() => clickNthAction(parseInt(command)));
            } else if (command.startsWith("'") && command.endsWith("'")) {
                // If command is a string, call clickSolution with the string
                let str = command.slice(1, -1);  // remove the enclosing quotes
                await delay(() => clickSolution(str));
            } else if (command.startsWith("<")) {
                // If command is a series of '<', call clickPreviousNode with the count
                let count = command.length;  // count the number of '<'
                await delay(() => clickPreviousNode(count));
            } else {
                // Retrieve function from commandMap and call it
                let fn = commandMap[command];
                if (fn === clickSolutionSelector) {
                    await delay(fn, 3);
                } else if (fn === clickFirstNode) {
                    await delay(fn, 2);
                } else if (fn) {
                    // Set delay to 0 for 'c', 'n', 'e', and 'r' commands
                    if (['c', 'n', 'e', 'r'].includes(command)) {
                        await delay(fn, 0);
                    } else {
                        await delay(fn);
                    }
                }
            }
        }
        console.log("%cDONE", "color: red; font-size:20px; font-weight:bold");
    })();
}

let includeTitle = true;
let includePosition = false;
/*
getFreqs();
printGTO();
printFreqs();
//printAndCopySimplifiedRange();
calcTotalActionFreqs(true);
rangeTitle();
concatRange();
*/

console.log("COMMANDS:");
console.log("includeTitle = true/false: include title above range, default true");
console.log("includePosition = true/false: include position in range title, default false");
console.log("c - concatRange(): add the current range");
console.log("e - emptyRange(): add an empty range");
console.log("n - newRow(): add a new row");
console.log("r - resetConcat(): reset the clipboard");
console.log("f - clickFirstNode(): click the first node");
console.log("< (n times) - clickPreviousNode(n): click the nth previous node");
console.log("# - clickNthAction(n): click the nth action (index starts at 0))");
console.log("s - clickSolutionSelector(): click the solution selector");
console.log("'text' - clickSolution(text): click the solution button with the given text");
console.log("tape(tape): read a tape of commands");

// Example tapes:
// Hu SnG 20BB
// tape("s'20'rfc2c2c2cn<<4c<3c2cnf1c1c2cn<<3cf3cf12c2c")
// Hu SnG 20BB + 22BB
// tape("s'20'rfc2c2c2cn<<4c<3c2cnf1c1c2cn<<3cf3cf12c2cns'22'fc2c2c2cn<<4c<3c2cnf1c1c2cn<<3cf3cf12c2c")

/*
INSTRUCTIONS:
1. Ctrl/Cmd + A + C to select all and copy code
2. Open range in GTOWizard
3. Open the JavaScript console (Ctrl/Cmd + Shift/Option + J)
4. Paste this code there and press Enter
5. Use tape('rc') to reset the clipboard and copy the current range
    5a. Make sure the node selector bar at the top is open, or 'r' will return to the first node
    5b. Create a custom tape to get the nodes you want
6. Press Tab or click on GTOWizard to copy to clipboard so you can paste it in Google Sheets
*/

/*
NOTES:
1. GTOWizard needs to be in focus for tape() to continue working
2. There's a bug right now that doesn't allow you to create an empty range as the first range
3. Most tapes should begin with 'rf' to reset the clipboard and select the first node
4. Tape strings can include spaces, which is helpful for readability and debugging
*/

// Change to longer if ranges aren't loading fast enough
const delayMs = 1200;

/*
TODO:
1. Have simplified range freqs under GTO freqs
*/
