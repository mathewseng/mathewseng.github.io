"""Verify each game's timestamps, tracks, action coverage and running loss."""
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import argparse, json, math, subprocess

ROOT=ARTIFACT_DIR / 'v2'
FPS=25
PAGE_FRAMES=100
PER_PAGE=24

def as_cards(game):
    return sum(max(0,math.ceil(len(a['actions'])/PER_PAGE)-1) for a in game['analyses']) + sum(
        math.ceil(len(side['actions'])/PER_PAGE) for a in game['conditional'] for side in a['byPlayer'])

def check_decision(d):
    rows=d['actions']
    assert d['legalCandidates']==len(rows)>0
    assert sum(a['isBest'] for a in rows)==1
    assert len({a['key'] for a in rows})==len(rows)
    assert all(math.isfinite(a['equity3']) for a in rows)
    assert [a['equity3'] for a in rows]==sorted((a['equity3'] for a in rows),reverse=True)
    for row in rows:
        assert math.isclose(sum(row['outcomeProbabilities3'].values()),1,abs_tol=1e-6)
        if 'equity4' in row:
            assert math.isfinite(row['equity4'])
            assert math.isclose(sum(row['outcomeProbabilities4'].values()),1,abs_tol=1e-6)
    assert d['preset']=={'allActions':3,'finalists':4}
    assert d['best']['equity']==max(a.get('equity4',-math.inf) for a in rows)
    if d['played']:
        assert sum(a['isPlayed'] for a in rows)==1
        assert math.isclose(d['evLoss'],max(0,d['best']['equity']-d['played']['equity']),abs_tol=1e-8)
    else:
        assert d['evLoss'] is None

def verify(number):
    game=json.loads((ROOT/f'game-{number}-analysis.json').read_text())
    for a in game['analyses']:check_decision(a)
    for a in game['conditional']:
        assert {s['player'] for s in a['byPlayer']}=={'white','dark'}
        for side in a['byPlayer']:check_decision(side)
    for s in game['positions']:
        assert math.isclose(sum(p['equity'] for p in s['players']),0,abs_tol=1e-7)
        assert math.isclose(sum(sum(p['chances']) for p in s['players']),1,abs_tol=1e-7)
    for side,a in game['cumulative'].items():
        losses=[e['loss'] for e in game['lossEvents'] if e['player']==side]
        assert a['graded']==len(losses) and math.isclose(a['loss'],sum(losses))
    for cube in game['reviewedCubeOffers']:
        assert cube['preset']['plies']==4
        assert math.isclose(sum(cube['outcomeProbabilities'].values()),1,abs_tol=1e-7)
    file=ROOT/'games'/f'game-{number:02}-analysis.mp4'
    info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries',
        'stream=codec_name,codec_type,width,height,nb_frames,duration,r_frame_rate','-of','json',str(file)]))
    video,audio=info['streams']
    frames=game['frames']+as_cards(game)*PAGE_FRAMES
    assert video['codec_name']=='h264' and video['codec_type']=='video'
    assert (video['width'],video['height'])==(1920,1080) and int(video['nb_frames'])==frames
    assert video['r_frame_rate']=='25/1'
    assert audio['codec_name']=='aac' and audio['codec_type']=='audio'
    assert abs(float(audio['duration'])-frames/FPS)<.06
    return dict(game=number, footageFrames=game['frames'], mp4Frames=frames,
        durationSeconds=frames/FPS, bytes=file.stat().st_size, reviewedActions=sum(len(a['actions']) for a in game['analyses']),
        checkerDecisions=len(game['analyses']),
        checkerGrades=sum(a['evLoss'] is not None for a in game['analyses']), conditional=len(game['conditional']),
        unresolved=len(game['unresolved']), reviewedCubeOffers=len({a['id'] for a in game['reviewedCubeOffers']}),
        cumulative=game['cumulative'],reviewCards=as_cards(game),file=file.name)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('games',type=int,nargs='*',default=list(range(1,6)))
    args=parser.parse_args()
    result=[verify(i) for i in args.games]
    if args.games==list(range(1,6)):
        assert sum(v['footageFrames'] for v in result)==113235
        (ROOT/'video-validation.json').write_text(json.dumps(result,indent=2)+'\n')
    for row in result:print(json.dumps(row),flush=True)
