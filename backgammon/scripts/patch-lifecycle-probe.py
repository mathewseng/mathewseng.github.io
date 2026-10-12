# SPDX-License-Identifier: GPL-3.0-or-later
"""Instrument a bg6 test build, never a production executable."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
p = root / "src/lib/neuralnet.c"
s = p.read_text()
needle = "static int PackOutputWeights(neuralnet *pnn)"
assert s.count(needle) == 1
s = s.replace(needle, "static int webProbeFailPacking;\n" + needle)
needle = "pnn->arOutputWeight4 = sse_malloc(groups * pnn->cHidden * 4 * sizeof(float));"
assert s.count(needle) == 1
s = s.replace(needle, "pnn->arOutputWeight4 = webProbeFailPacking ? NULL : sse_malloc(groups * pnn->cHidden * 4 * sizeof(float));")
s += "\n" + Path(__file__).with_name("native-lifecycle-probe.c").read_text()
p.write_text(s)
p = root / "Makefile.emcc"
s = p.read_text()
needle = '"_bg_rollout",'
assert s.count(needle) == 1
p.write_text(s.replace(needle, needle + ' "_bg_probe_lifecycle",'))
