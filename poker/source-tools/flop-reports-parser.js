// Go to bottom for instructions and notes

async function delay(ms = 200) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function minDelay() {
    delay(1000 / 60);
}

async function openFilter() {
    if (document.getElementsByClassName('reports-flop-filter').length === 0) {
        [...document.getElementsByClassName('gtabs_tab')].filter(div => div.innerHTML === ' Filters ')[0].click();
        await delay();
    }
}

const codeToFlopType = {
    'r': [0, 1],
    't': [0, 2],
    'f': [0, 3],
    'u': [1, 1],
    'p': [1, 2],
    '3': [1, 3],
    'd': [2, 1],
    'c': [2, 3]
}
async function flopType(type) {
    let panel = document.getElementsByClassName('reports-flop-filter')[0];
    let row = codeToFlopType[type][0];
    let col = codeToFlopType[type][1];
    panel.children[row].children[1].children[0].click();
    await minDelay();
    panel.children[row].children[1].children[col].click();
    if (type === 'd') {
        await minDelay();
        panel.children[row].children[1].children[2].click();
    }
}

const rankGroupIndices = {
    'A': [1],
    'H': [2, 3, 4, 5],
    'M': [6, 7, 8, 9],
    'L': [10, 11, 12, 13],
    'K': [2],
    'Q': [3],
    'B': [4, 5],
    'X': [6, 7, 8, 9, 10, 11, 12, 13],
}
// ranks is in the format 'HML', 'AL', 'M', 'AKQ', 'KBX', etc.
async function flopRanks(ranks) {
    let panel = document.getElementsByClassName('reports-flop-filter')[0];
    switch (ranks.length) {
        case 1: // Tripled
            for (index of rankGroupIndices[ranks[0]]) {
                await minDelay();
                panel.children[4].children[1].children[index].click();
                panel.children[5].children[1].children[index].click();
                panel.children[6].children[1].children[index].click();
            }
            panel.children[1].children[1].children[3].click();
            break;
        case 2: // Paired
            // Paired rank is higher than unpaired rank
            if (rankGroupIndices[ranks[0]][0] < rankGroupIndices[ranks[1]][0]) {
                for (index of rankGroupIndices[ranks[0]]) {
                    await minDelay();
                    panel.children[4].children[1].children[index].click();
                    panel.children[5].children[1].children[index].click();
                }
                for (index of rankGroupIndices[ranks[1]]) {
                    await minDelay();
                    panel.children[6].children[1].children[index].click();
                }
            } else { // Paired rank is lower than unpaired rank
                for (index of rankGroupIndices[ranks[1]]) {
                    await minDelay();
                    panel.children[4].children[1].children[index].click();
                }
                for (index of rankGroupIndices[ranks[0]]) {
                    await minDelay();
                    panel.children[5].children[1].children[index].click();
                    panel.children[6].children[1].children[index].click();
                }
            }
            panel.children[1].children[1].children[2].click();
            break;
        case 3: // Unpaired
            for (index of rankGroupIndices[ranks[0]]) {
                await minDelay();
                panel.children[4].children[1].children[index].click();
            }
            for (index of rankGroupIndices[ranks[1]]) {
                await minDelay();
                panel.children[5].children[1].children[index].click();
            }
            for (index of rankGroupIndices[ranks[2]]) {
                await minDelay();
                panel.children[6].children[1].children[index].click();
            }
            panel.children[1].children[1].children[1].click();
            break;
    }
}

// bucket is a string in the form 'HMLt', 'ALr', 'HHMct', 'M', 'KXr', 'KQBf', etc.
async function filter(bucket, mode = 1, num, totalNum) {
    await openFilter();
    // Click Any on all rows to reset
    let panel = document.getElementsByClassName('reports-flop-filter')[0];
    for (let i = 0; i < 7; i++) {
        panel.children[i].children[1].children[0].click();
    }
    await minDelay();
    // Click on ranks and types to create filter
    const [, ranks, types] = bucket.match(/([A-Z]+)(.*)/);
    flopRanks(ranks);
    for (let i = 0; i < types.length; i++) {
        flopType(types[i]);
    }
    await delay();
    while (document.getElementsByClassName('lds-ring').length !== 0) {
        await delay(50);
    }
    await delay(500);
    let actions = getActions(mode);
    if (num === undefined) {
        console.log(bucket + ': ' + actions);
    } else {
        console.log('(' + num + '/' + totalNum + ') ' + bucket + ': ' + actions);
    }
    return actions;
}

const sizes = [125, 75, 50, 33, 25, 20, 10];
// returns closest size to num
function getClosestSize(num) {
    if (num > 133) {
        return num;
    }
    let closest = sizes[0];
    for (let i = 1; i < sizes.length; i++) {
        if (Math.abs(num - sizes[i]) < Math.abs(num - closest)) {
            closest = sizes[i];
        }
    }
    return closest;
}


// modes: 'array', 'all', 1, or 2
function getActions(mode = 1) {
    let actionsDiv = document.getElementsByClassName('sab')[0];
    numActions = actionsDiv.children.length;
    let actions = [];
    for (let i = 0; i < numActions; i++) {
        let action;
        if (actionsDiv.children[i].children[1].children[0].children[0].children.length === 0) {
            action = 'X';
        } else {
            //action = parseFloat(actionsDiv.children[i].children[1].children[0].children[0].children[0].innerHTML.replace(/\(/g, ''));
            action = getClosestSize(parseFloat(actionsDiv.children[i].children[1].children[0].children[0].children[0].innerHTML.replace(/\(/g, '')));
        }
        let actionFreq = parseFloat(document.getElementsByClassName('sab')[0].children[i].children[1].children[0].children[1].innerHTML);
        actions.push([action, actionFreq]);
    }
    if (mode === 'array') {
        return actions;
    } else if (mode === 'all') {
        let str = '';
        for (let i = 0; i < actions.length; i++) {
            str += actions[i][1] + '/';
        }
        str = str.slice(0, -1);
        str += ' ';
        for (let i = 0; i < actions.length; i++) {
            str += actions[i][0] + '/';
        }
        str = str.slice(0, -1);
        return str;
    }
    return simpleSize(actions, mode);
}


function combine(actions, size) {
  let totalFreq = 0;
  for (let i = 0; i < actions.length; i++) {
    const ratio = Math.pow(actions[i][0] / size, 1/2);
    totalFreq += ratio * actions[i][1];
  }
  return Math.min(Math.round(totalFreq / 5) * 5, 100);
}

const threshold = 0.5;
function simpleSize(actions, numSizes = 1) {
    actions.pop();
    let bestSize = actions[0][0];
    let highestFreq = actions[0][1];
    for (let i = 1; i < actions.length; i++) {
        if (actions[i][1] > highestFreq) {
            bestSize = actions[i][0];
            highestFreq = actions[i][1];
        }
    }
    let bestFreq = combine(actions, bestSize);
    if (bestFreq < 5) {
        return '100% x';
    }
    const sizes = actions.filter(action => action[1] >= threshold * highestFreq).map(action => action[0]);
    // if 1 size
    if (numSizes === 1 || sizes.length === 1) {
        return bestFreq + '% b' + bestSize;
    } else { // if 2 size
        const minSize = Math.min(...sizes);
        const maxSize = Math.max(...sizes);
        function minMaxActions(actions, sizeOne, sizeTwo) {
            return actions.map(action => {
                if (action[0] === sizeOne) {
                    return action;
                } else if (action[0] === sizeTwo) {
                    return [action[0], 0];
                } else {
                    return [action[0], action[1] / 2];
                }
            });
        }
        const minActions = minMaxActions(actions, minSize, maxSize);
        const maxActions = minMaxActions(actions, maxSize, minSize);
        const minFreq = combine(minActions, minSize);
        const maxFreq = combine(maxActions, maxSize);
        return minFreq + '/' + maxFreq + '% b' + minSize + '/' + maxSize;
    }
}

const AHMLbuckets = [
    'A',
    'H',
    'M',
    'L',
    'AHr', 'AHt',
    'AMr', 'AMt',
    'ALr', 'ALt',
    'HAr', 'HAt',
    'HHr', 'HHt',
    'HMr', 'HMt',
    'HLr', 'HLt',
    'MAr', 'MAt',
    'MHr', 'MHt',
    'MMr', 'MMt',
    'MLr', 'MLt',
    'LAr', 'LAt',
    'LHr', 'LHt',
    'LMr', 'LMt',
    'LLr', 'LLt',
    'AHHr', 'AHHt', 'AHHf',
    'AHMr', 'AHMt', 'AHMf',
    'AHLr', 'AHLt', 'AHLf',
    'AMMr', 'AMMt', 'AMMf',
    'AMLr', 'AMLt', 'AMLf',
    'ALLr', 'ALLt', 'ALLf',
    'HHHr', 'HHHt', 'HHHf',
    'HHMcr', 'HHMct', 'HHMcf',
    'HHMdr', 'HHMdt', 'HHMdf',
    'HHLr', 'HHLt', 'HHLf',
    'HMMcr', 'HMMct', 'HMMcf',
    'HMMdr', 'HMMdt', 'HMMdf',
    'HMLr', 'HMLt', 'HMLf',
    'HLLr', 'HLLt', 'HLLf',
    'MMMr', 'MMMt', 'MMMf',
    'MMLcr', 'MMLct', 'MMLcf',
    'MMLdr', 'MMLdt', 'MMLdf',
    'MLLcr', 'MLLct', 'MLLcf',
    'MLLdr', 'MLLdt', 'MLLdf',
    'LLLr', 'LLLt', 'LLLf'
];

const AKQBXbuckets = [
    'A',
    'K',
    'Q',
    'B',
    'X',
    'AKr', 'AKt',
    'AQt', 'AQt',
    'ABr', 'ABt',
    'AXr', 'AXt',
    'KAr', 'KAt',
    'KQr', 'KQt',
    'KBr', 'KBt',
    'KXr', 'KXt',
    'QAr', 'QAt',
    'QKr', 'QKt',
    'QBr', 'QBt',
    'QXr', 'QXt',
    'BAr', 'BAt',
    'BKr', 'BKt',
    'BQr', 'BQt',
    'BXr', 'BXt',
    'XAr', 'XAt',
    'XKr', 'XKt',
    'XQr', 'XQt',
    'XBr', 'XBt',
    'AKQr', 'AKQt', 'AKQf',
    'AKBr', 'AKBt', 'AKBf',
    'AKXr', 'AKXt', 'AKXf',
    'AQBr', 'AQBt', 'AQBf',
    'AQXr', 'AQXt', 'AQXf',
    'ABBr', 'ABBt', 'ABXf',
    'ABXr', 'ABXt', 'ABXf',
    'AXXr', 'AXXt', 'AXXf',
    'KQBr', 'KQBt', 'KQBf',
    'KQXr', 'KQXt', 'KQXf',
    'KBBr', 'KBBt', 'KBBf',
    'KBXr', 'KBXt', 'KBXf',
    'KXXr', 'KXXt', 'KXXf',
    'QBBr', 'QBBt', 'QBBf',
    'QBXr', 'QBXt', 'QBXf',
    'QXXr', 'QXXt', 'QXXf',
    'BBXcr', 'BBXct', 'BBXcf',
    'BBXdr', 'BBXdt', 'BBXdf',
    'BXXcr', 'BXXct', 'BXXcf',
    'BXXdr', 'BXXdt', 'BXXdf',
    'XXXcr', 'XXXct', 'XXXcf',
    'XXXdr', 'XXXdt', 'XXXdf'
];

async function all(useAKQBXbuckets = false, mode = 1) {
    let buckets = useAKQBXbuckets ? AKQBXbuckets : AHMLbuckets;
    let totalNum = buckets.length;
    let actions = [];
    for (let i = 0; i < buckets.length; i++) {
        actions.push(await filter(buckets[i], mode, i+1, totalNum));
    }
    console.log(actions);
    let text = '';
    for (let i = 0; i < actions.length; i++) {
        text += actions[i] + '\n';
    }
    copyToClipboard(text);
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

/*
INSTRUCTIONS:
1. Ctrl/Cmd + A + C to select all and copy code
2. Open Flop Aggregate Reports in GTOWizard
3. Open the JavaScript console (Ctrl/Cmd + Shift/Option + J)
4. Paste this code there and press Enter
5. Make sure flop action percentages are visible
6. Use all() to get all simplified freqs for AHML buckets
6a. Use all(true) to get AKQBX buckets
6b. Use all(false/true, 2) to get 2 size freqs
6c. Should take around 1.5-3 mins depending on loading times
*/

/*
NOTES:
1. Use filter() to get simplified freqs for a specific bucket
*/
