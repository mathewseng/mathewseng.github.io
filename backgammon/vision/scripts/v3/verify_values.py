"""Verify the value timeline against its original audio and game-frame index."""
import argparse,collections,gzip,json,subprocess
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR

OUT=ARTIFACT_DIR / 'v3'
BASE=OUT.parent/'v2'

def probe(path):
    command=['ffprobe','-v','error','-show_entries','stream=codec_type,codec_name,width,height,nb_frames,duration',
             '-of','json',str(path)]
    return json.loads(subprocess.check_output(command))['streams']

def audio_hash(path):
    command=['ffmpeg','-nostdin','-v','error','-i',str(path),'-map','0:a:0','-c','copy',
      '-f','streamhash','-hash','sha256','-']
    return subprocess.check_output(command).decode().strip()

def verify(game):
    context=OUT/f'game-{game["number"]:02}-current.jsonl.gz'
    previous=-1
    frames=collections.Counter()
    segments=iter(game['segments']); section=next(segments)
    with gzip.open(context,'rt') as stream:
        for line in stream:
            item=json.loads(line)
            f=item['frame'];assert previous+1==f
            previous=f
            while section['firstGameFrame']+section['lastExclusive']-section['firstFrame']<=f:section=next(segments)
            assert (section['clip'],section['firstFrame']+f-section['firstGameFrame'])==(
                item['clip'],item['sourceFrame'])
            a,b=item['roll'],item['cube']
            if a['dice']:
                assert len(a['dice'])==2 and all(x is None or 1<=x<=6 for x in a['dice'])
            if b['status']=='offer':
                assert b['offer']==b['stake']*2
            frames[a['status']]+=1
    assert previous+1==game['frames']
    old=BASE/'games'/f'game-{game["number"]:02}-analysis.mp4'
    new=OUT/'games'/old.name
    first,second=probe(old),probe(new)
    assert len(second)==2
    assert first[0]['nb_frames']==second[0]['nb_frames']
    assert (second[0]['width'],second[0]['height'])==(1920,1080)
    assert second[0]['codec_name']=='h264' and second[1]['codec_name']=='aac'
    assert audio_hash(old)==audio_hash(new)
    print(json.dumps({'game':game['number'],'videoFrames':int(second[0]['nb_frames']),
       'footageFrames':game['frames'],'completeRollFrames':sum(frames[s] for s in
         ['vision-track','carried','inferred','reviewed']),'audioUnchanged':True}),flush=True)
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('games',type=int,nargs='*',default=[1,2,3,4,5])
    args=p.parse_args()
    for g in json.loads((BASE/'timeline.json').read_text())['games']:
        if g['number'] in args.games:verify(g)
