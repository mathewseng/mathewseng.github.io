# SPDX-License-Identifier: GPL-3.0-or-later
"""Add differential-test bindings to an experimental build only."""
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1])
shutil.copyfile(Path(__file__).with_name("native-probes.c"), root / "src/native-probes.c")
p = root / "Makefile.emcc"
s = p.read_text()
needle = '"_bg_rollout",'
assert s.count(needle) == 1
p.write_text(s.replace(needle, needle + ' "_bg_probe_moves", "_bg_probe_network", "_bg_probe_epoch", "_bg_probe_collisions",'))
p = root / "src/eval.c"
s = p.read_text()
if "static unsigned int webMoveEpoch;" in s:
    s = s.replace("static unsigned int webMoveEpoch;", "static unsigned int webMoveEpoch;\nstatic unsigned int webProbeCollisions;")
    needle = "        slot = (slot + 1) & (WEB_MOVE_SLOTS - 1);"
    assert s.count(needle) == 1
    s = s.replace(needle, "        { webProbeCollisions++; slot = (slot + 1) & (WEB_MOVE_SLOTS - 1); }")
    s += "\nvoid bg_probe_epoch(unsigned int epoch) { webMoveEpoch = epoch; }\nunsigned int bg_probe_collisions(void) { return webProbeCollisions; }\n"
else:
    s += "\nvoid bg_probe_epoch(unsigned int epoch) { (void)epoch; }\nunsigned int bg_probe_collisions(void) { return 0; }\n"
p.write_text(s)
