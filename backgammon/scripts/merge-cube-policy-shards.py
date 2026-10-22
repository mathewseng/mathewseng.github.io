#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Require every fixed shard before exposing the combined sample to analysis."""
import argparse,hashlib,json
from pathlib import Path
FAMILY=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('artifacts',type=Path);p.add_argument('--run-id',required=True);p.add_argument('--out',type=Path,default=FAMILY/'test-results/cube-policy-study-v2');args=p.parse_args()
plan=json.loads((FAMILY/'docs/cube-policy-study-v2-inputs.json').read_bytes())
HASH=lambda b:hashlib.sha256(b).hexdigest()
shards=[];records=[]
for shard in range(plan['shards']):
 root=args.artifacts/f'cube-policy-v2-shard-{shard}'
 complete=json.loads((root/'complete.json').read_bytes())
 if complete['signature']!=plan['signature'] or complete['shard']!=shard or complete['shards']!=plan['shards']:raise ValueError('Incomplete or changed shard')
 if json.loads((root/'inputs.json').read_bytes())!=plan:raise ValueError('Inputs changed')
 validation=json.loads((root/'platform-validation.json').read_bytes())
 if validation['binarySHA256']!=plan['build']['binarySHA256'] or not validation['allWithinTolerance'] or validation['cases']!=26:raise ValueError('Unvalidated worker')
 raw=(root/'batches.jsonl').read_bytes()
 if not raw.endswith(b'\n'):raise ValueError('Partial checkpoint')
 rows=[json.loads(line) for line in raw.splitlines()]
 expected=sum(batch%plan['shards']==shard for batch in range(plan['trials']//plan['batchSize']))*len(plan['policies'])*2
 if len(rows)!=expected or complete['records']!=expected or any(r['batch']%plan['shards']!=shard for r in rows):raise ValueError('Wrong shard batch count')
 shards.append({'shard':shard,'records':len(rows),'rawSHA256':HASH(raw),'validation':validation,'completedAt':complete['completedAt']});records+=rows
if len(records)!=5120 or len({r['key'] for r in records})!=5120:raise ValueError('Missing or duplicated experiment records')
records.sort(key=lambda r:(r['batch'],r['policy'],r['role']))
raw=(''.join(json.dumps(r,separators=(',',':'))+'\n' for r in records)).encode()
args.out.mkdir(parents=True,exist_ok=True)
(args.out/'inputs.json').write_text(json.dumps(plan,indent=2)+'\n')
(args.out/'batches.jsonl').write_bytes(raw)
complete={'signature':plan['signature'],'records':len(records),'runId':args.run_id,'shards':shards,'rawSHA256':HASH(raw)}
(args.out/'complete.json').write_text(json.dumps(complete,indent=2)+'\n')
print('All 20 shards complete: 5,120 unique batches, 163,840 trials; ready for fixed-sample validation')
