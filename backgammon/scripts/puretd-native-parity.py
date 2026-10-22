"""Generate an independent native oracle; run with the pinned upstream on PYTHONPATH."""
import argparse, hashlib, json, time
from pathlib import Path
from types import SimpleNamespace
from c_api.puretd_py import Engine
from backgammon_engine import BoardState
p=argparse.ArgumentParser()
p.add_argument('--inputs',required=True);p.add_argument('--model',required=True)
p.add_argument('--out',required=True);p.add_argument('--backend',default='ref')
args=p.parse_args();data=json.loads(Path(args.inputs).read_text())
engine=Engine(args.model,backend=args.backend)
meta={'schema':1,'inputSHA256':hashlib.sha256(Path(args.inputs).read_bytes()).hexdigest(),
      'modelSHA256':hashlib.sha256(Path(args.model).read_bytes()).hexdigest(),'backend':args.backend,
      'description':engine.describe,'method':'Native unmodified C API, full legal root. Forced passes use the opponent pre-roll value and legal cube decision at the requested depth.'}
with Path(args.out).open('x') as out:
 out.write(json.dumps({'metadata':meta})+'\n')
 for i,c in enumerate(data['general']):
  s=c['state'];state=BoardState(s['points'],s['bar'],s['off'],s['turn'])
  cube=SimpleNamespace(cube_owner=0 if s['cube']['owner'] is None else s['cube']['owner']+1,cube_value=s['cube']['value'],jacoby=True)
  results=[]
  for plies in [0,1]:
   start=time.perf_counter();scores,states=engine.score_moves(state,s['dice'],cube,plies)
   if not len(scores):
    assert len(c['legal'])==1 and not c['legal'][0]['steps']
    next_state=BoardState(s['points'],s['bar'],s['off'],1-s['turn'])
    can=cube.cube_owner in [0,next_state.turn+1]
    if not plies: value=engine.value(next_state,cube,is_cube_action=can)
    elif can:
     double,ce=engine.offer_double(next_state,cube,plies)
     value=min(ce.v_double_take,1) if double else ce.v_no_double
    else: value=engine.value_1ply(next_state,cube)
    moves=[{'key':c['legal'][0]['key'],'equity':-float(value)}]
   else:
    assert all(s1.turn==1-state.turn for s1 in states)
    moves=[{'key':','.join(map(str,s1.points+s1.bar+s1.off)),'equity':float(v)} for s1,v in zip(states,scores)]
   assert {m['key'] for m in moves}=={m['key'] for m in c['legal']},c['id']
   moves.sort(key=lambda m:-m['equity'])
   results.append({'plies':plies,'elapsedSeconds':time.perf_counter()-start,'moves':moves})
  out.write(json.dumps({'id':c['id'],'results':results})+'\n');out.flush()
  if i%20==0:print(i+1,c['id'],flush=True)
 print('COMPLETE',len(data['general']),flush=True)
