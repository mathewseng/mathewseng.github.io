"""Pip values reviewed on temporal die close-ups. Omitted faces stay unresolved."""
import json
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR

OUT=ARTIFACT_DIR / 'v3'
GROUPS={
  1:[0,8,9,10,11,13,14,18,22,36,38,39,43,44,52,57,58,60,61,63,64,65,77,79,80,81,82,83,84,101,
      102,116,117,118,120,151,166,167,198,200,232,234],
  2:[6,15,27,28,29,31,32,33,41,42,45,47,48,53,54,66,67,68,69,73,74,75,85,87,
      107,108,111,130,134,137,143,148,162],
  3:[1,2,3,4,5,12,16,17,19,20,23,24,25,26,34,35,37,40,49,50,51,55,56,59,71,72,76,78,86,92,93,94,
      105,106,112,114,158,160,161,204,205,206,207,208,209,210,241],
  4:[21,30,96,103,110,113,115,119,123,124,125,126,127,129,131,135,136,138,140,141,146,147,
      153,154,156,157,159,163,164,165,168,169,176,177,180,181,182,191,192,195,196,199,201,202,
      212,214,216,217,219,221,223,224,225,226,227,228,229,230,231,233,239,242],
  5:[132,133,150,152,173,174,175],
  6:[88,89,91,97,98,99,100,104,109,121,128,139,144,171,172,183,189,190,193,194,197,203,211,213,215,
      220,222,235,236,237,238],
}
# Entire contiguous source groups are withheld; nearby tracks from the same roll stay together.
TEST={2,3,8,9,18,19,20,21,31,32,38,39,51,52,57,58,68,69,70,71}
TUNE={13,14,27,28,35,36,43,44,60,61}
refs=json.loads((OUT/'track-index.json').read_text())
data=[]
for value,ids in GROUPS.items():
    for i in ids:
        r=refs[i]
        data.append({**r,'value':value,'split':'test' if r['clip'] in TEST else 'validation' if r['clip'] in TUNE else 'train'})
assert len({x['index'] for x in data})==len(data)
(OUT/'temporal-dice-labels.json').write_text(json.dumps(data,indent=2)+'\n')
print({s:sum(x['split']==s for x in data) for s in ('train','validation','test')})
