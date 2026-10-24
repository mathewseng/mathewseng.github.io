"""Reproduce a complete independent opening search with a pinned native engine.

The reference candidates are intentionally unused during search. Source/weights
must be installed from the pins in docs/LEARNED-EVALUATORS.md. Timing collected
here is exploratory, including cross-position engine cache reuse.
"""
import argparse,dataclasses,hashlib,json,platform,subprocess,time
from pathlib import Path
from types import SimpleNamespace
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--engine',choices=['puretd','sage','gnu'],required=True)
p.add_argument('--inputs',required=True);p.add_argument('--out',required=True)
p.add_argument('--level',type=int,required=True);p.add_argument('--threads',type=int,default=1)
p.add_argument('--beavers',action='store_true');p.add_argument('--backend',default='ref')
p.add_argument('--model');p.add_argument('--gnu-driver');p.add_argument('--gnu-root')
args=p.parse_args();data=Path(args.inputs).read_bytes();inputs=json.loads(data)
metadata={'schema':1,'engine':args.engine,'level':args.level,'inputSHA256':hashlib.sha256(data).hexdigest(),
 'platform':platform.platform(),'threads':args.threads,'jacoby':True,'beavers':args.beavers,'raccoons':False,
 'method':'Independent complete opening corpus. Reference candidates are unused during search. No fitting. Timing includes cache reuse and is not a controlled speed comparison.'}
if args.engine=='puretd':
 from c_api.puretd_py import Engine
 from backgammon_engine import BoardState
 assert args.model and args.level in [0,1] and not args.beavers
 engine=Engine(args.model,backend=args.backend);cube=SimpleNamespace(cube_owner=0,cube_value=1,jacoby=True)
 metadata.update(sourceCommit='18b0a80d258e388a2ed04b0f9d81993fb6723e1b',backend=args.backend,description=engine.describe,
  modelSHA256=hashlib.sha256(Path(args.model).read_bytes()).hexdigest())
elif args.engine=='sage':
 from bgsage import BgBotAnalyzer
 engine=BgBotAnalyzer(eval_level=f'{args.level}ply',parallel_threads=args.threads)
 metadata.update(sourceCommit='139427d826dd67798226e7d23c003c90315306ba',maxCube=1024)
else:
 assert args.gnu_driver and args.gnu_root
 engine=subprocess.Popen([str(Path(args.gnu_driver).resolve())],cwd=args.gnu_root,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 while engine.stdout.readline().strip()!='READY':
  if engine.poll() is not None:raise RuntimeError(engine.stderr.read())
 metadata.update(binarySHA256=hashlib.sha256(Path(args.gnu_driver).read_bytes()).hexdigest(),rootPolicy='All legal root moves; normal internal pruning')
with Path(args.out).open('x') as out:
 out.write(json.dumps({'metadata':metadata})+'\n');out.flush()
 for i,c in enumerate(inputs['cases']):
  start=time.perf_counter()
  if args.engine=='puretd':
   board=list(map(int,c['board'].split(',')));state=BoardState(board[:24],board[24:26],board[26:],0)
   values,states=engine.score_moves(state,list(map(int,c['roll'])),cube,args.level)
   assert all(s.turn==1 for s in states)
   moves=[{'key':','.join(map(str,s.points+s.bar+s.off)),'equity':float(v)} for s,v in zip(states,values)]
  elif args.engine=='sage':
   result=engine.checker_play(c['sageBoard'],*map(int,c['roll']),jacoby=True,beaver=args.beavers,max_cube_value=1024)
   moves=[dataclasses.asdict(m) for m in result.moves];keys={tuple(m['sageBoard']):m['board'] for m in c['legal']}
   for m in moves:m['key']=keys[tuple(m['board'])]
   assert moves[0]['eval_level']==f'{args.level}-ply'
  else:
   moves=[]
   for m in c['legal']:
    engine.stdin.write('\t'.join([c['original'],m['after'],str(args.level),str(int(args.beavers))])+'\n');engine.stdin.flush()
    value=json.loads(engine.stdout.readline());assert 'error' not in value
    moves.append({'key':m['board'],**value})
  assert len(moves)==len(c['legal']) and {m['key'] for m in moves}=={m['board'] for m in c['legal']},c['title']
  if args.engine!='sage':moves.sort(key=lambda m:-m['equity'])
  out.write(json.dumps({'id':c['title'],'url':c['url'],'elapsedSeconds':time.perf_counter()-start,'moves':moves})+'\n');out.flush()
  if i%25==0:print(i+1,c['title'],flush=True)
if args.engine=='gnu':engine.stdin.close();assert engine.wait()==0
print('COMPLETE',len(inputs['cases']),flush=True)
