"""Cut representative decisions from verified, timed overlay exports."""
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import subprocess

root=ARTIFACT_DIR
selections=(
    ('185629',50.7,4.25),
    ('190829',29.8,4.0),
    ('194129',11.45,3.85),
    ('200129',52.58,7.25),
    ('200229',.0,3.72),
)
target=root/'backgammon-analysis-highlights.mp4'
cmd=['ffmpeg','-nostdin','-v','error','-y']
for stamp,start,duration in selections:
    name=f'office-3-wide_20261117-{stamp}.mp4'
    cmd+=['-ss',str(start),'-t',str(duration),'-i',str(root/'overlays'/name)]
tracks=''.join(f'[{i}:v:0][{i}:a:0]' for i in range(len(selections)))
cmd+=['-filter_complex',f'{tracks}concat=n={len(selections)}:v=1:a=1[v][a]',
      '-map','[v]','-map','[a]','-c:v','libx264','-threads','4','-preset','fast','-crf','18',
      '-c:a','aac','-b:a','160k','-movflags','+faststart',str(target)]
subprocess.run(cmd,check=True)
subprocess.run(['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_type,codec_name',
                '-of','compact',str(target)],check=True)
