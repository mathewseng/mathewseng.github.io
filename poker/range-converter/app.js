/* Preserve the original simplified-range conversion with input validation. */
const input = document.getElementById('input');
const status = document.getElementById('conversion-status');
const outputs = { A: 'allIn', Y: 'yellow', R: 'raise', C: 'call', F: 'fold' };

function convertRanges(value) {
    const groups = Object.fromEntries(Object.keys(outputs).map(letter => [letter, new Map()]));
    const tokens = value.trim().replace(/([AKQJT2-9]{2}[so]?)\s+([ARYCF]+(?:90[ARYCF])?|NONE)\b/gi, '$1-$2').split(/[\s,]+/).filter(Boolean);
    const invalid = [];
    let converted = 0;
    for (const token of tokens) {
        const match = token.match(/^([AKQJT2-9])([AKQJT2-9])([so]?)-([ARYCF]+(?:90[ARYCF])?|NONE)$/i);
        if (!match) { invalid.push(token); continue; }
        const first = match[1].toUpperCase();
        const second = match[2].toUpperCase();
        const suitedness = match[3].toLowerCase();
        const code = match[4].toUpperCase();
        if ((first === second && suitedness) || (first !== second && !suitedness)) { invalid.push(token); continue; }
        const ranks = 'AKQJT98765432';
        const hand = (ranks.indexOf(first) <= ranks.indexOf(second) ? first + second : second + first) + suitedness;
        if (code === 'NONE') continue;
        const frequencies = {};
        if (/^[ARYCF]90[ARYCF]$/.test(code)) {
            frequencies[code[0]] = 90;
            frequencies[code[3]] = (frequencies[code[3]] || 0) + 10;
        } else if (/^[ARYCF]+$/.test(code) && [1, 2, 4].includes(code.length)) {
            for (const letter of code) frequencies[letter] = (frequencies[letter] || 0) + 100 / code.length;
        } else { invalid.push(token); continue; }
        converted++;
        for (const [letter, frequency] of Object.entries(frequencies)) {
            if (!groups[letter].has(frequency)) groups[letter].set(frequency, new Set());
            groups[letter].get(frequency).add(hand);
        }
    }
    for (const [letter, id] of Object.entries(outputs)) {
        document.getElementById(id).textContent = [...groups[letter]].sort((a, b) => b[0] - a[0]).map(([frequency, hands]) => {
            const range = [...hands].sort().join(',');
            return frequency === 100 ? range : `[${frequency}]${range}[/${frequency}]`;
        }).join(',');
    }
    status.textContent = invalid.length
        ? `${converted} hands converted. Check ${invalid.length} unrecognized ${invalid.length === 1 ? 'entry' : 'entries'}: ${invalid.slice(0, 3).join(', ')}`
        : converted ? `${converted} ${converted === 1 ? 'hand' : 'hands'} converted.` : 'Paste ranges above to begin.';
}
input.addEventListener('input', () => convertRanges(input.value));
document.getElementById('load-example').addEventListener('click', () => {
    input.value = 'AA-ARRR AKs-R90C AKo-RRCC 72o-FFFF';
    convertRanges(input.value);
});
document.querySelectorAll('.copy-btn').forEach(button => {
    button.addEventListener('click', async () => {
        const text = document.getElementById(button.dataset.output).textContent;
        if (!text) { status.textContent = 'There is no range to copy for this action yet.'; return; }
        try {
            await navigator.clipboard.writeText(text);
            status.textContent = `${button.dataset.label} range copied.`;
        } catch {
            status.textContent = 'Clipboard access is unavailable. Select the range text to copy it.';
        }
    });
});
