/*
TODO:
- Ranges
    - 100 BB, BvB full tree DONE
    - 100 BB, 3rd level or full tree?
    - 10 BB, full tree
    - Short stack depths, full tree
- Change cells from full height to range height or have an option for that?
- Some weird bugs when clicking around the game tree selector
*/

// Create elements in svg
const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
const mobileClickMs = 300
const stackedLayout = window.innerWidth < 900
var width = stackedLayout ? 600 + window.innerWidth : window.innerWidth
var height = stackedLayout ? 600 : Math.max(600, Math.min(window.innerHeight - document.querySelector(".legacy-header").getBoundingClientRect().height - 12, width * 0.65))
const root = document.querySelector(':root')
const stdTextSize = Math.max(12, height / 50)
root.style.setProperty('--textSize', stdTextSize + 'px')
root.style.setProperty('--bigTextSize', stdTextSize * 3.75 + 'px')
root.addEventListener('dblclick', function(e) {
    e.preventDefault()
})
const svg = d3.select('#legacy-stage').append('svg')
    .attr('width', width)
    .attr('height', height)
const background = svg.append('rect')
    .attr('width', width)
    .attr('height', height)
    .on('click', () => {
        let roll = Math.floor(Math.random() * 100)
        if (roll < 10) {
            roll = '0' + roll
        }
        displayActionFreqs()
        colorGradient(rollText.text(roll), roll)
    })

const actionColors = {
    'R-3': ['a35', 'a30', 'a25', 'a20', 'a17', 'a14', 'a12', 'a10'],
    'R-2': ['rB6', 'r7', 'r9_5', 'r10'], // Not sure why r9_5 isn't working (for HU 60 BB 3bet)
    'R-1': ['o2', 'o2_1', 'o2_2', 'o2_3', 'o2_5', 'o3', 'o3_5', 'o4', 'r4', 'r4_5', 'r5', 'r6', 'r6_5'],
    'R-0': ['r2_5', 'r3', 'r3_5']
}

function condenseClasses(r) {
    let output = ''
    for (c of actionColors['R-' + r]) {
        output += '.' + c + ', '
    }
    return output.substring(0, output.length - 2)
}

const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']

const cellB = 2
const cellS = Math.floor((height - 14 * cellB) / 13)
const cellsW = cellS * 13 + cellB * 14

function iterCells(func) {
    for (let i = 0; i < 13; i++) {
        for (let j = 0; j < 13; j++) {
            func(i, j)
        }
    }
}

const cells = svg.append('g').attr('id', 'cells')
iterCells((i, j) => {
    let g = cells.append('g')
        .attr('transform', 'translate(' + (cellB + (cellS + cellB) * j) + ',' + (cellB + (cellS + cellB) * i) + ')')
        .classed('cellG', true)
        .attr('id', 'cellG' + i + '-' + j)
    let hand = ranks[i] + ranks[j]
    if (i < j) {
        hand += 's'
    } else if (i > j) {
        hand = hand.substring(1) + hand.substring(0, 1) + 'o'
    }
    g.append('text')
        .attr('x', cellS / 32)
        .attr('y', cellS / 4)
        .classed('textLeft', true)
        .text(hand)
})

const cellLines = svg.append('g').attr('id', 'cellLines')
for (let i = 0; i < 14; i++) {
    cellLines.append('rect')
        .attr('x', (cellS + cellB) * i)
        .attr('width', cellB)
        .attr('height', height)
        .classed('cellB', true)
    cellLines.append('rect')
        .attr('y', (cellS + cellB) * i)
        .attr('width', height)
        .attr('height', cellB)
        .classed('cellB', true)
}

function formatId(s) {
    return (isNaN(s.substring(0, 1)) ? '' : '_') + s.replace(/\s/g, '').replace('.', '_')
}

const gameTypeG = svg.append('g').attr('id', 'gameType')
const gameTypes = ['6Max Cash', 'HU', 'HU SnG', '4Max MTT']
const stackDepthG = svg.append('g').attr('id', 'stackDepth')
var stackDepths = ['200', '150', '100', '80', '60', '40', '20']
const positionsG = svg.append('g').attr('id', 'position')
var positions = ['BU', 'BB']
const actionsGs = [svg.append('g').attr('id', 'action0'), svg.append('g').attr('id', 'action1'), svg.append('g').attr('id', 'action2'), svg.append('g').attr('id', 'action3'), svg.append('g').attr('id', 'action4'), svg.append('g').attr('id', 'action5')]
var actions = {}
var rangeInfo = {
    'gameType': 'HU',
    'stackDepth': '_100',
    'action': [],
    'position': positions[0]
}

const buttonP = cellsW / 50
const buttonH = Math.max(44, cellsW / 20)
const buttonGW = width - cellsW - buttonP * 2

function applyHover(sel, click = () => {}, over = () => {}, out = () => {}) {
    sel
        .attr('role', 'button')
        .attr('tabindex', 0)
        .attr('aria-label', function() { return this.textContent || 'Select range'; })
        .on('keydown', function(event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); click(this); } })
        .on('mouseover', function() {
            over(this)
            d3.selectAll(this.children).classed('hover', true)
        })
        .on('mouseout', function() {
            out(this)
            d3.selectAll(this.children).classed('hover', false)
        })
        .on('click', function() {
            click(this)
            if (mobile) {
                setTimeout(() => {
                    d3.selectAll(this.children).classed('hover', false)
                }, mobileClickMs);
            }
        })
}
applyHover(d3.selectAll('.cellG'), (g) => clickHand(g), (g) => hoverHand(g), displayRangeFreqs)

function select(g) {
    if (g === null) return
    //if (d3.select(g.parentNode).attr('id').substring(0, 6) !== 'action') {
        d3.select(g.parentNode).selectAll('*').selectAll('*').classed('selected', false)
    //}
    d3.selectAll(g.children).classed('selected', true)
}

var prevRangeInfo = {}
// Deep copy rangeInfo
prevRangeInfo = JSON.parse(JSON.stringify(rangeInfo))
// Ex: createButtons(stackDepthG, stackDepths, 'stackDepth', 1)
// bg: buttonG
// bs: button ids
// id: 'gameType', 'stackDepth', 'position', or 'action'
// row: y offset of buttons
// tree (for 'position' and 'action'): game tree
// actLevel (for 'action'): row of actions
function createButtons(bg, bs, id, row, tree, actLevel) {
    isAction = id.substring(0, 6) === 'action'
    const columns = id === 'stackDepth' ? Math.min(bs.length, Math.max(1, Math.floor(buttonGW / 44))) : bs.length
    for (let i = 0; i < bs.length; i++) {
        let act = JSON.parse(JSON.stringify(rangeInfo['action']))
        if (isAction) {
            if (bs[i] === '') {
                continue
            }
            if (act[act.length - 1] !== bs[i]) {
                act.push(bs[i])
            }
        }
        let g = bg.append('g')
            .attr('transform', 'translate(' + (cellsW + buttonP) + ',' + (buttonP + buttonH * (row + Math.floor(i / columns))) + ')')
            .classed('buttonG', true)
            .attr('id', formatId(bs[i]))
        if (isAction) {
            g.attr('action', act)
        }
        let w = buttonGW / columns
        let x = w * (i % columns)
        g.append('rect')
            .attr('x', x)
            .attr('width', w)
            .attr('height', buttonH)
            .classed('button', true)
        g.append('text')
            .attr('x', x + w / 2)
            .attr('y', buttonH * 0.65)
            .text(isAction ? parseAction(bs[i].substring(2)) : bs[i])
    }
    applyHover(d3.select('#' + id).selectAll('g'), (g) => {
        const actionPath = d3.select(g).attr('action');
        if (actionPath !== null) {
            const nextPath = actionPath.split(',').filter(Boolean);
            rangeInfo['position'] = d3.select(g).attr('id').substring(0, 2);
            rangeInfo['action'] = d3.select(g).select('rect').classed('selected') ? nextPath.slice(0, -1) : nextPath;
        } else {
            rangeInfo[id] = d3.select(g).attr('id');
            if (id === 'gameType' || id === 'stackDepth') rangeInfo['action'] = [];
        }
        updateButtons(true);
        updateRange();
        displayRangeFreqs();
        prevRangeInfo = JSON.parse(JSON.stringify(rangeInfo));
    });
    if (!isAction) {
        select(document.getElementById(rangeInfo[id]))
    }
    updateRange()
}

function displayRangeFreqs() {
    if (currentRange === undefined) {
        return
    }
    let sumFreqs = {}
    for (act of Object.keys(currentRange[0][0])) {
        sumFreqs[act] = 0
    }
    iterCells((i, j) => {
        for (act of Object.keys(currentRange[i][j])) {
            sumFreqs[act] += currentRange[i][j][act] / (13 * 13)
        }
    })
    acts = sortActions(Object.keys(sumFreqs))
    actStrArr = []
    for (act of acts) {
        actStrArr.push(parseAction(act) + ': ' + (Math.round(sumFreqs[act] * 100) / 100).toFixed(2))
    }
    displayActionFreqs(actStrArr)
}

var prevGameType = rangeInfo['gameType']
var prevAction = rangeInfo['action']
function updateButtons(bypass) {
    d3.select('#stackDepth').selectAll('*').remove()
    d3.select('#position').selectAll('*').remove()
    for (let i = 0; i <= 5; i++) {
        d3.select('#action' + i).selectAll('*').remove()
    }
    switch (rangeInfo['gameType']) {
        case '_6MaxCash':
            stackDepths = ['200', '150', '100', '75', '50', '40', '20']
            positions = ['LJ', 'HJ', 'CO', 'BU', 'SB', 'BB']
            break
        case 'HU':
            stackDepths = ['200', '150', '100', '80', '60', '40', '20']
            positions = ['BU', 'BB']
            break
        case 'HUSnG':
            stackDepths = ['25', '22.5', '20', '18', '16', '15', '14', '13', '12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2']
            positions = ['BU', 'BB']
            break
        case '_4MaxMTT':
            stackDepths = ['100', '80', '60', '50', '40', '35', '30', '25', '20', '17', '14', '12', '10']
            positions = ['CO', 'BU', 'SB', 'BB']
            break
    }
    const availableDepths = Object.keys(getTree()).sort((a, b) => Number(b) - Number(a));
    stackDepths = availableDepths;
    const selectedDepth = rangeInfo['stackDepth'].substring(1).replace('_', '.');
    if (!availableDepths.includes(selectedDepth)) rangeInfo['stackDepth'] = formatId(availableDepths[0] || '100');
    if (!positions.includes(rangeInfo['position'])) rangeInfo['position'] = positions[0];
    if (bypass) {
        d3.select('#gameType').selectAll('*').remove()
        createButtons(gameTypeG, gameTypes, 'gameType', 0)
    }
    createButtons(stackDepthG, stackDepths, 'stackDepth', 1)
    const extraStackRows = Math.max(0, Math.ceil(stackDepths.length / Math.max(1, Math.floor(buttonGW / 44))) - 1);
    createButtons(positionsG, positions, 'position', 2.5 + extraStackRows)

    let acts = parseTree(rangeInfo['action'])
    console.log(acts)
    for (let row = 0; row < Math.min(acts.length, actionsGs.length); row++) {
        createButtons(actionsGs[row], acts[row], 'action' + row, 3.5 + extraStackRows + row)
    }
    for (a of rangeInfo['action']) {
        d3.select('#' + a).selectAll('*').classed('selected', true)
        console.log('selected ' + a)
    }
}
updateButtons(true)

const rollText = svg.append('text')
    .attr('x', cellsW + buttonP)
    .attr('y', height - buttonP * 1.5)
    .classed('textLeft', true)
    .classed('bigText', true)
    .attr('id', 'rollText')

const actionFreqs = svg.append('g').attr('id', 'actionFreqs')
displayRangeFreqs()

function parseGTOString(r) {
    if (!r || !Object.keys(r).length || Object.values(r).some(value => typeof value !== 'string' || !value.trim())) {
        console.log('Range not defined')
        return
    }
    let output = []
    for (let i = 0; i < 13; i++) {
        let row = []
        for (let j = 0; j < 13; j++) {
            row.push({})
        }
        output.push(row)
    }
    for (act in r) {
        let hands = r[act].split(',')
        let freq = 100
        for (hand of hands) {
            if (hand.substring(0, 1) === '[') {
                freq = parseFloat(hand.split(']')[0].substring(1))
                hand = hand.split(']')[1]
            }
            if (hand.split('[').length === 2) {
                hand = hand.split('[')[0]
            }
            let id = handToId(hand)
            if (id[0] >= 0 && id[1] >= 0) output[id[0]][id[1]][act] = freq
        }
    }
    iterCells((i, j) => {
        let total = 0
        for (act in r) {
            let freq = output[i][j][act]
            if (freq === undefined) {
                output[i][j][act] = 0
            } else {
                total += freq
            }
        }
        output[i][j]['f'] = 100 - total
    })
    let hasFold = false
    iterCells((i, j) => {
        if (output[i][j]['f'] > 0.5) {
            hasFold = true
        }
    })
    if (!hasFold) {
        iterCells((i, j) => {
            delete output[i][j]['f']
        })
    }
    return output
}

function handToId(hand) {
    let id = [ranks.indexOf(hand.substring(0, 1)), ranks.indexOf(hand.substring(1, 2))]
    if (hand.substring(2, 3) === 'o') {
        let temp = id[0]
        id[0] = id[1]
        id[1] = temp
    }
    return id
}

function sortActions(acts) {
    let allIn = ''
    let raises = []
    let open = ''
    let call = false
    let check = false
    let fold = false
    let special = {}
    for (act of acts) {
        let first = act.substring(0, 1)
        if (first === 'a') {
            allIn = act
        } else if (first === 'r') {
            if (act.substring(1, 2) === 'B') {
                act = act.replace('B', '')
                special[act] = 'B'
            }
            raises.push(act)
        } else if (first === 'o') {
            open = act
        } else if (first === 'c') {
            call = true
        } else if (first === 'x') {
            check = true
        } else if (first === 'f') {
            fold = true
        }
    }
    let output = []
    if (allIn !== '') {
        output.push(allIn)
    }
    let raiseAmounts = []
    for (raise of raises) {
        raiseAmounts.push(parseFloat(raise.substring(1).replace('_', '.')))
    }
    raiseAmounts.sort((a,b) => {return b - a})
    for (raiseAmount of raiseAmounts) {
        let raiseStr = 'r' + raiseAmount.toString().replace('.', '_')
        if (special[raiseStr] !== undefined) {
            raiseStr = 'r' + special[raiseStr] + raiseStr.substring(1)
        }
        output.push(raiseStr)
    }
    if (open !== '') {
        output.push(open)
    }
    if (call) {
        output.push('c')
    }
    if (check) {
        output.push('x')
    }
    if (fold) {
        output.push('f')
    }
    return output
}

var currentRange;
function displayRange(r) {
    if (r === undefined) {
        console.log('Range not defined')
        return
    }
    currentRange = r
    let acts = Object.keys(r[0][0])
    acts = sortActions(acts)
    iterCells((i, j) => {
        let cellG = d3.select('#cellG' + i + '-' + j)
        let totalFreq = 0
        for (act of acts) {
            cellG.append('rect')
                .attr('x', cellS * totalFreq / 100)
                .attr('width', cellS * r[i][j][act] / 100)
                .attr('height', cellS)
                .classed(act, true)
                .classed('cell', true)
            totalFreq += r[i][j][act]
        }
        cellG.select('text').raise()
    })
    d3.selectAll(condenseClasses(3)).classed('R-3', true)
    d3.selectAll(condenseClasses(2)).classed('R-2', true)
    d3.selectAll(condenseClasses(1)).classed('R-1', true)
    d3.selectAll(condenseClasses(0)).classed('R-0', true)
    // Misc. classes not predefined
    d3.selectAll('.cell[class*="r"]:not(.R-1):not(.R-2):not(.R-3)').classed('R-1', true)
    d3.selectAll('.cell[class*="a"]').classed('R-3', true)
}

function updateRange() {
    currentRange = undefined;
    d3.selectAll('.cell').remove();
    d3.select('#actionFreqs').selectAll('*').remove();
    d3.select('#rollText').text('');
    const notice = document.getElementById('range-status');
    notice.textContent = 'This selection has no complete range in the original archive. Choose another stack, position, or action.';
    let gT = rangeInfo['gameType']
    let sD = Number(rangeInfo['stackDepth'].substring(1).replace('_', '.'))
    let pos = rangeInfo['position']
    let act = JSON.parse(JSON.stringify(rangeInfo['action']))
    // Remove last act if it has same pos as pos so correct range can be displayed
    if (rangeInfo['action'].length > 0 && rangeInfo['action'][rangeInfo['action'].length - 1].substring(0, 2) === pos) {
        act.pop()
    }
    d3.selectAll('.cell').remove()
    let acts = getTree()[sD]
    if (acts === undefined) {
        console.log('Stack depth range not defined')
        return
    }
    for (a of act) {
        if (!acts || !acts[a]) return;
        acts = acts[a]
    }
    if (!acts) return;
    let actArr = Object.keys(acts)
    let curActs = []
    for (a of actArr) {
        if (a.substring(0, 2) === pos) {
            curActs.push(a)
        }
    }
    console.log(curActs)
    let freqs = {}
    for (a of curActs) {
        freqs[a.substring(2)] = acts[a]['']
    }
    // acts should be a dictionary of action freqs
    const parsed = parseGTOString(freqs);
    displayRange(parsed);
    if (parsed) notice.textContent = 'Showing the available archived range. Other branches may be incomplete.';
}

function parseAction(act, removeSpecial) {
    switch (act.substring(0, 1)) {
        case 'f':
            act = 'Fold'
            break
        case 'x':
            act = 'Check'
            break
        case 'c':
            act = 'Call'
            break
        case 'o':
            act = 'Open ' + act.substring(1)
            break
        case 'r':
            act = 'Raise ' + act.substring(1)
            break
        case 'a':
            act = 'All In ' + act.substring(1)
            break
    }
    if (removeSpecial) act = act.replace('B', '')
    return act.replace('_', '.')
}

function clickHand(g) {
    if (!currentRange) return;
    let rowCol = d3.select(g).attr('id').substring(5).split('-')
    let row = rowCol[0]
    let col = rowCol[1]
    let freqs = currentRange[row][col]
    let acts = sortActions(Object.keys(freqs))
    let roll = Math.random() * 100
    let rollCounter = roll
    let act;
    for (a of acts) {
        act = a
        if (rollCounter < freqs[a]) {
            break
        }
        rollCounter -= freqs[a]
    }
    act = parseAction(act, true)
    roll = Math.floor(roll)
    if (roll < 10) {
        roll = '0' + roll
    }
    displayActionFreqs()
    colorGradient(rollText.text(roll + ': ' + act), roll)
}

function hoverHand(g) {
    if (!currentRange) return;
    let rowCol = d3.select(g).attr('id').substring(5).split('-')
    let row = rowCol[0]
    let col = rowCol[1]
    let freqs = currentRange[row][col]
    let acts = Object.keys(freqs)
    acts = sortActions(acts)
    let actStrings = []
    for (a of acts) {
        actStrings.push(parseAction(a) + ': ' + freqs[a].toFixed(2))
    }
    displayActionFreqs(actStrings)
}

function colorGradient(t, n) {
    return t.style('fill', 'hsl(' + n * 1.2 + ' 100% 50%)')
}

function displayActionFreqs(acts) {
    rollText.text('')
    d3.selectAll('.actionFreq').remove()
    if (acts === undefined) {
        return
    }
    let y = height - cellS / 2
    for (act of acts) {
        let a = act.split(': ')[0]
        let num = act.split(': ')[1]
        let g = actionFreqs.append('g').classed('actionFreq', true)
        applyTextColor(g.append('text')
            .attr('x', cellsW + buttonP)
            .attr('y', y)
            .classed('textLeft', true)
            .classed('bigText', true)
            .text(a.replace('B', '')), a)
        g.append('rect')
            .attr('x', cellsW + buttonP)
            .attr('y', y - cellS * 0.75)
            .attr('width', width - cellsW - cellS * 3)
            .attr('height', cellS)
            .style('fill', 'hsla(0, 0%, 100%, 0)')
            .on('mouseover', function() {
                highlight(this)
            })
            .on('mouseout', function() {
                highlight(this, true)
            })
        colorGradient(g.append('text')
            .attr('x', width - buttonP)
            .attr('y', y)
            .classed('textRight', true)
            .classed('bigText', true)
            .text(num), num)
        y -= cellS
    }
}

const colorClasses = ['f', 'x', 'c', 'R-0', 'R-1', 'R-2', 'R-3']
function highlight(rect, out = false) {
    if (out) {
        d3.selectAll('*').classed('hidden', false)
        return
    }
    hiClass = d3.select(rect.parentNode.children[0]).attr('class').split(' ')[2]
    for (c of colorClasses) {
        if (c !== hiClass) {
            d3.selectAll('.' + c).classed('hidden', true)
        }
    }
    iterCells((i, j) => {
        let g = d3.select('#cellG' + i + '-' + j)
        if (g.select('.' + hiClass).attr('width') === '0') {
            g.select('text').classed('hidden', true)
        }
    })
}

function applyTextColor(t, a) {
    let color = ''
    switch (a) {
        case 'Fold':
            color = 'f'
            break
        case 'Check':
            color = 'x'
            break
        case 'Call':
            color = 'c'
            break
        default:
            let firstWord = a.split(' ')[0]
            if (firstWord === 'All') {
                color = 'R-3'
            } else if (firstWord === 'Open') {
                color = 'R-1'
            } else { // firstWord === 'Raise'
                let colorFound = false
                let r = 'r' + a.split(' ')[1].replace('.', '_')
                for (let i = 0; i < 3; i++) {
                    if (actionColors['R-' + i].includes(r)) {
                        color = 'R-' + i
                        colorFound = true
                    }
                }
                if (!colorFound) {
                    color = 'R-1'
                }
            }
    }
    t.classed(color, true)
}

// act is an array of actions, Ex: ['BUo2_3', 'SBc', 'BBxx']
function parseTree(act) {
    let tree = getTree()[Number(rangeInfo['stackDepth'].substring(1).replace('_', '.'))]
    if (!tree) return [];
    let acts = []
    // Initalize acts to an array of # of positions arrays
    for (let i = 0; i < positions.length; i++) {
        acts.push([])
    }
    // Traverse tree to node of action
    for (let i = 0; i < act.length; i++) {
        if (!tree || !tree[act[i]]) return [];
        tree = tree[act[i]]
    }
    // Get available actions
    let keys = Object.keys(tree)
    keys = act.concat(keys)
    // Place actions on correct positions
    for (let i = 0; i < keys.length; i++) {
        let p = positions.indexOf(keys[i].substring(0, 2))
        if (p === -1) { // if key === '', aka GTO string range
            //currentRange = tree['']
            continue
        }
        acts[p].push(keys[i])
    }
    let maxLen = 0
    for (pos of acts) {
        if (pos.length > maxLen) {
            maxLen = pos.length
        }
    }
    for (let i = 0; i < maxLen; i++) {
        for (let j = 0; j < positions.length; j++) {
            if (acts[j][i] === undefined) {
                acts[j].push('')
            }
        }
    }
    // Transpose array
    acts = acts[0].map((_, colIndex) => acts.map(row => row[colIndex]))
    return acts
}

function getTree(gT = rangeInfo['gameType']) {
    switch (gT) {
        case '_6MaxCash':
            return Cash6
        case 'HU':
            return HU
        case 'HUSnG':
            return HUSnG
        case '_4MaxMTT':
            return MTT4
        default:
            return {}
    }
}
// Stack the existing control groups above the matrix on narrow screens.
// Group references stay intact, so the original range-tree interactions still work.
if (stackedLayout) {
    const stage = document.getElementById('legacy-stage');
    const controls = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    controls.classList.add('range-controls');
    controls.setAttribute('width', width - cellsW);
    controls.setAttribute('height', height);
    controls.setAttribute('viewBox', cellsW + ' 0 ' + (width - cellsW) + ' ' + height);
    controls.setAttribute('aria-label', 'Game, stack depth, position, and action controls');
    [gameTypeG, stackDepthG, positionsG, ...actionsGs, rollText, actionFreqs].forEach(group => controls.appendChild(group.node()));
    stage.insertBefore(controls, svg.node());
    const chartScroll = document.createElement('div');
    chartScroll.className = 'range-matrix-scroll';
    chartScroll.setAttribute('aria-label', 'Starting-hand range matrix; scroll horizontally to see all hands');
    chartScroll.tabIndex = 0;
    stage.appendChild(chartScroll);
    svg.attr('width', cellsW);
    background.attr('width', cellsW);
    chartScroll.appendChild(svg.node());
}
