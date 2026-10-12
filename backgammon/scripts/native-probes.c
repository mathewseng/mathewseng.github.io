/* SPDX-License-Identifier: GPL-3.0-or-later
 * Test-only bindings; never included in a production executable. */
#include "backgammon.h"
#include "eval.h"
#include "xgid.h"
#include "positionid.h"
#include "stringbuffer.h"
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

const char *bg_probe_moves(const char *xgid, int partial) {
    matchstate ms;
    movelist moves;
    if (parseXgid(&ms, xgid) < 0 || !CheckPosition(ms.anBoard) ||
        ms.anDice[0] < 1 || ms.anDice[0] > 6 || ms.anDice[1] < 1 || ms.anDice[1] > 6)
        return strdup("{\"error\":\"Invalid probe position\"}");
    GenerateMoves(&moves, ms.anBoard, ms.anDice[0], ms.anDice[1], partial);
    StringBuffer b; sbInit(&b);
    sbAppendf(&b, "{\"maxMoves\":%u,\"maxPips\":%u,\"moves\":[", moves.cMaxMoves, moves.cMaxPips);
    for (unsigned int i = 0; i < moves.cMoves; i++) {
        if (i) sbAppend(&b, ",");
        sbAppend(&b, "[");
        for (unsigned int j = 0; j < 7; j++) sbAppendf(&b, "%s%u", j ? "," : "", moves.amMoves[i].key.data[j]);
        int ended = 0;
        for (unsigned int j = 0; j < 8; j++) {
            int point = ended ? -1 : moves.amMoves[i].anMove[j];
            if (!(j & 1) && point < 0) ended = 1;
            sbAppendf(&b, ",%d", point);
        }
        sbAppend(&b, "]");
    }
    sbAppend(&b, "]}"); return sbFinalize(&b);
}

static uint32_t next_probe(uint32_t *state) {
    *state ^= *state << 13; *state ^= *state >> 17; *state ^= *state << 5;
    return *state;
}
static float probe_input(uint32_t *seed) {
    unsigned int value = next_probe(seed) % 10;
    return value < 6 ? 0.0f : value < 9 ? 1.0f : (next_probe(seed) % 1000) / 333.0f;
}
const char *bg_probe_network(int index, unsigned int seed, int count) {
    const neuralnet *nets[] = { &nnRace, &nnCrashed, &nnContact, &nnpRace, &nnpCrashed, &nnpContact };
    if (index < 0 || index > 5 || count < 1 || count > 128 || seed == 0)
        return strdup("{\"error\":\"Invalid probe options\"}");
    const neuralnet *net = nets[index];
    float *input = g_alloca(net->cInput * sizeof(float));
    float *copy = g_alloca(net->cInput * sizeof(float));
    float *full = g_alloca(net->cOutput * sizeof(float));
    float *incremental = g_alloca(net->cOutput * sizeof(float));
    NNState state;
    state.state = NNSTATE_INCREMENTAL;
    state.savedBase = g_alloca(net->cHidden * sizeof(float));
    state.savedIBase = g_alloca(net->cInput * sizeof(float));
    for (unsigned int i = 0; i < net->cInput; i++) input[i] = probe_input(&seed);
    StringBuffer b; sbInit(&b);
    sbAppendf(&b, "{\"inputs\":%u,\"hidden\":%u,\"outputs\":%u,\"rows\":[", net->cInput, net->cHidden, net->cOutput);
    for (int step = 0; step < count; step++) {
        if (step) {
            for (int change = 0; change < 8; change++) {
                unsigned int at = next_probe(&seed) % net->cInput;
                input[at] = probe_input(&seed);
            }
            sbAppend(&b, ",");
        }
        memcpy(copy, input, net->cInput * sizeof(float));
        NeuralNetEvaluate(net, copy, full, NULL);
        memcpy(copy, input, net->cInput * sizeof(float));
        NeuralNetEvaluate(net, copy, incremental, &state);
        sbAppend(&b, "[");
        for (unsigned int j = 0; j < net->cOutput; j++) sbAppendf(&b, "%s%.9g", j ? "," : "", full[j]);
        for (unsigned int j = 0; j < net->cOutput; j++) sbAppendf(&b, ",%.9g", incremental[j]);
        sbAppend(&b, "]");
    }
    sbAppend(&b, "]}"); return sbFinalize(&b);
}
