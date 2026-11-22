#!/usr/bin/env python3
"""Posters, thumbnails and the game list for the session page.

usage: finalize_page.py <analysis-dir> <render-dir> <page-dir> <release-tag> <game...>
"""
import json, re, subprocess, sys
from pathlib import Path
from PIL import Image

an, rd, page, tag = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4]
games = list(map(int, sys.argv[5:]))
NAME = {'white': 'White', 'dark': 'Black'}
(page / 'posters').mkdir(parents=True, exist_ok=True)
items = []
for g in games:
    rng = json.loads((rd / f'game-{g:02d}.range.json').read_text())
    A = json.loads((an / f'game-{g:02d}.json').read_text())
    video = rd / f'game-{g:02d}-analysis.mp4'
    t = rng['frames'] / 25 * 0.4
    tmp = page / 'posters' / f'_frame.png'
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', f'{t:.2f}', '-i', str(video), '-frames:v', '1', str(tmp)], check=True)
    im = Image.open(tmp).convert('RGB')
    im.resize((1440, 810), Image.LANCZOS).save(page / 'posters' / f'game-{g:02d}.jpg', quality=82, optimize=True)
    im.crop((32, 88, 960, 784)).resize((144, 108), Image.LANCZOS).save(page / 'posters' / f'game-{g:02d}-thumb.jpg', quality=80, optimize=True)
    tmp.unlink()
    secs = round(rng['frames'] / 25)
    r = A.get('result')
    if r:
        pts = f"{r['points']} point{'s' if r['points'] != 1 else ''}"
        how = {'pass': f"after {NAME['dark' if r['winner'] == 'white' else 'white']} passes the cube", 'gammon': 'with a gammon', 'bear-off': 'by bearing off'}[r['reason']]
        note = f"{NAME[r['winner']]} wins {pts} {how}."
    else:
        note = 'The recording ends before the game finishes.'
    items.append((g, secs, note))
lis = []
for i, (g, secs, note) in enumerate(items):
    cur = ' aria-current="true"' if i == 0 else ''
    lis.append(f'''              <li>
                <a href="?game={g}" data-game="{g}" data-note="{note}"{cur}>
                  <img src="posters/game-{g:02d}-thumb.jpg" width="56" height="42" alt="" />
                  <span>Game {g}</span><time datetime="PT{secs // 60}M{secs % 60}S">{secs // 60}:{secs % 60:02d}</time>
                </a>
              </li>''')
html = (page / 'index.html').read_text()
html = re.sub(r'<ol>.*?</ol>', '<ol>\n' + '\n'.join(lis) + '\n            </ol>', html, count=1, flags=re.S)
html = re.sub(r'<p id="game-note">.*?</p>', f'<p id="game-note">{items[0][2]}</p>', html, count=1)
html = re.sub(r'View all five MP4s on GitHub', f'View all {len(items)} MP4s on GitHub', html)
html = html.replace('poster="posters/game-01.jpg"', 'poster="posters/game-01.jpg"')
(page / 'index.html').write_text(html)
print(items)
