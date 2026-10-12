# SPDX-License-Identifier: GPL-3.0-or-later
"""Research-only indexed duplicate lookup. Preserve native move order/path."""
from pathlib import Path
import sys

p = Path(sys.argv[1]) / 'src/eval.c'
s = p.read_text()
needle = 'static void\nSaveMoves(movelist *pml'
assert s.count(needle) == 1
s = s.replace(needle, '''/* The web build runs one search per WASM worker. GenerateMoves already
 * borrows a single move buffer; this index has the same non-reentrant lifetime.
 * Epochs avoid clearing 8192 slots for every dice outcome. Full position keys
 * are still compared, so hash collisions cannot discard a distinct move. */
#define WEB_MOVE_SLOTS 8192
static unsigned int webMoveEpoch;
static unsigned int webMoveEpochs[WEB_MOVE_SLOTS];
static unsigned int webMoveIndices[WEB_MOVE_SLOTS];
static void WebMoveIndexReset(void)
{
    if (++webMoveEpoch == 0) {
        memset(webMoveEpochs, 0, sizeof(webMoveEpochs));
        webMoveEpoch = 1;
    }
}
static unsigned int WebMoveSlot(const positionkey *key, const movelist *pml)
{
    unsigned int hash = 2166136261u;
    for (unsigned int k = 0; k < 7; k++) hash = (hash ^ key->data[k]) * 16777619u;
    hash ^= hash >> 16;
    unsigned int slot = hash & (WEB_MOVE_SLOTS - 1);
    while (webMoveEpochs[slot] == webMoveEpoch &&
           !EqualKeys(*key, pml->amMoves[webMoveIndices[slot]].key))
        slot = (slot + 1) & (WEB_MOVE_SLOTS - 1);
    return slot;
}

''' + needle)
needle = '''        if (cMoves > pml->cMaxMoves || cPip > pml->cMaxPips)
            pml->cMoves = 0;'''
assert s.count(needle) == 1
s = s.replace(needle, '''        if (cMoves > pml->cMaxMoves || cPip > pml->cMaxPips) {
            pml->cMoves = 0;
            WebMoveIndexReset();
        }''')
needle = '''    for (i = 0; i < pml->cMoves; i++) {

        pm = &(pml->amMoves[i]);

        if (EqualKeys(key, pm->key)) {'''
assert s.count(needle) == 1
s = s.replace(needle, '''    const unsigned int slot = WebMoveSlot(&key, pml);
    if (webMoveEpochs[slot] == webMoveEpoch) {
        pm = &(pml->amMoves[webMoveIndices[slot]]);
        {''')
needle = '''    pm = pml->amMoves + pml->cMoves;

    for (i = 0; i < cMoves * 2; i++)'''
assert s.count(needle) == 1
s = s.replace(needle, '''    webMoveEpochs[slot] = webMoveEpoch;
    webMoveIndices[slot] = pml->cMoves;
    pm = pml->amMoves + pml->cMoves;

    for (i = 0; i < cMoves * 2; i++)''')
needle = '''    pml->amMoves = MT_Get_aMoves();
    GenerateMovesSub'''
assert s.count(needle) == 1
s = s.replace(needle, '''    pml->amMoves = MT_Get_aMoves();
    WebMoveIndexReset();
    GenerateMovesSub''')
p.write_text(s)
