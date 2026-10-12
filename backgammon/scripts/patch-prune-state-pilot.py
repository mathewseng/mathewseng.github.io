# SPDX-License-Identifier: GPL-3.0-or-later
"""Reuse a local, class-consistent base in the native pruning neural network."""
from pathlib import Path
import sys

p = Path(sys.argv[1]) / "src/eval.c"
s = p.read_text()
needle = "    unsigned int prune_moves;\n\n    GenerateMoves"
assert s.count(needle) == 1
s = s.replace(needle, """    unsigned int prune_moves;
#if !defined(USE_SIMD_INSTRUCTIONS)
    NNState pruningState;
    int pruningBaseSaved = FALSE;
#endif

    GenerateMoves""")
old = """                if (nnStates)
                    nnStates[pc - CLASS_RACE].state = (i == 0) ? NNSTATE_INCREMENTAL : NNSTATE_DONE;
                NeuralNetEvaluate(n, arInput, arOutput, nnStates);"""
assert s.count(old) == 1
s = s.replace(old, """                /* Web searches can arrive without an outer NNState. Keep a
                 * private base for this pruning list instead of disabling
                 * incremental evaluation, or using another class's state.
                 * The loop exits if its network class changes. Cache hits do
                 * not establish a base: save the first actual evaluation. */
                if (!pruningBaseSaved) {
                    pruningState.savedBase = g_alloca(n->cHidden * sizeof(float));
                    pruningState.savedIBase = g_alloca(n->cInput * sizeof(float));
                    pruningState.state = NNSTATE_INCREMENTAL;
                }
                NeuralNetEvaluate(n, arInput, arOutput, &pruningState);
                pruningBaseSaved = TRUE;""")
p.write_text(s)
