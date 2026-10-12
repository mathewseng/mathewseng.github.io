/* SPDX-License-Identifier: GPL-3.0-or-later
 * Appended to neuralnet.c in test builds only. Tests real allocation fallback,
 * binary serialization, evaluation and idempotent destruction of each net. */
#include <malloc.h>
#include "stringbuffer.h"

const char *bg_probe_lifecycle(int failPacking, int cycles)
{
    const neuralnet *nets[] = { &nnRace, &nnCrashed, &nnContact, &nnpRace, &nnpCrashed, &nnpContact };
    if ((failPacking != 0 && failPacking != 1) || cycles < 1 || cycles > 128)
        return strdup("{\"error\":\"Invalid lifecycle options\"}");
    unsigned int loaded = 0, unpacked = 0;
    int heapDelta = 0;
    for (unsigned int netIndex = 0; netIndex < 6; netIndex++) {
        const neuralnet *net = nets[netIndex];
        FILE *snapshot = tmpfile(), *roundtrip = tmpfile();
        if (!snapshot || !roundtrip) return strdup("{\"error\":\"Could not create snapshot\"}");
        if (NeuralNetSaveBinary(net, snapshot)) return strdup("{\"error\":\"Save failed\"}");
        long bytes = ftell(snapshot);
        float *input = g_alloca(net->cInput * sizeof(float));
        float *expected = g_alloca(net->cOutput * sizeof(float));
        float *actual = g_alloca(net->cOutput * sizeof(float));
        for (unsigned int i = 0; i < net->cInput; i++) input[i] = (i % 7) / 3.0f;
        NeuralNetEvaluate(net, input, expected, NULL);
        /* Warm the FILE buffers before measuring network allocations. */
        rewind(snapshot); fgetc(snapshot);
        NeuralNetSaveBinary(net, roundtrip); fflush(roundtrip);
        rewind(roundtrip); fgetc(roundtrip);
        const int before = mallinfo().uordblks;
        for (int cycle = 0; cycle < cycles; cycle++) {
            neuralnet copy = {0};
            rewind(snapshot);
            webProbeFailPacking = failPacking;
            int result = NeuralNetLoadBinary(&copy, snapshot);
            webProbeFailPacking = 0;
            if (result) return strdup("{\"error\":\"Load failed\"}");
#ifdef __wasm_simd128__
            if (!!copy.arOutputWeight4 == !!failPacking)
                return strdup("{\"error\":\"Packing fault did not take expected path\"}");
            unpacked += !copy.arOutputWeight4;
#endif
            NeuralNetEvaluate(&copy, input, actual, NULL);
            if (memcmp(expected, actual, net->cOutput * sizeof(float)))
                return strdup("{\"error\":\"Allocation fallback changed output\"}");
            rewind(roundtrip);
            if (NeuralNetSaveBinary(&copy, roundtrip) || ftell(roundtrip) != bytes)
                return strdup("{\"error\":\"Serialized size changed\"}");
            rewind(snapshot); rewind(roundtrip);
            for (long i = 0; i < bytes; i++) if (fgetc(snapshot) != fgetc(roundtrip))
                return strdup("{\"error\":\"Serialized weights changed\"}");
            NeuralNetDestroy(&copy);
            NeuralNetDestroy(&copy);
            loaded++;
        }
        heapDelta += mallinfo().uordblks - before;
        fclose(snapshot); fclose(roundtrip);
    }
    StringBuffer b; sbInit(&b);
    sbAppendf(&b, "{\"loaded\":%u,\"unpacked\":%u,\"heapDelta\":%d}", loaded, unpacked, heapDelta);
    return sbFinalize(&b);
}
