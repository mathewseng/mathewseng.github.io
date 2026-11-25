#!/usr/bin/env python3
"""Start a dated session page from the Nov 21 page and link it from every vision page.

The new page keeps the Nov 21 layout; its heading, description, release tag and
first-game sources are set here, and finalize_page.py fills the game list.
Every session page (the Nov 17 page at vision/ and each dated folder) gets the
same session links, in date order.
A second recording on one day takes a suffix: YYYY-MM-DD-pm is linked as "Nov 24 PM", after the day's
first page.
usage: new_session_page.py <vision-dir> <YYYY-MM-DD[-suffix]> <release-tag> <heading> <description>
"""
import re, sys
from datetime import date
from pathlib import Path

vision, day, tag, heading, description = Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
short = lambda d: date.fromisoformat(d[:10]).strftime('%b %-d') + (' ' + d[11:].upper() if len(d) > 10 else '')
page = vision / day
html = (vision / '2026-11-21' / 'index.html').read_text()
html = re.sub(r'<meta name="description" content="[^"]*" />', f'<meta name="description" content="{description}" />', html, count=1)
html = html.replace('<title>Backgammon Vision · Nov 21</title>', f'<title>Backgammon Vision · {short(day)}</title>')
html = html.replace('<span class="crumb-current" aria-current="page">Nov 21</span>', f'<span class="crumb-current" aria-current="page">{short(day)}</span>')
html = re.sub(r'(<header class="vision-heading">\s*<div>\s*<h1>Backgammon Vision</h1>\s*)<p>.*?</p>', lambda m: m.group(1) + f'<p>{heading}</p>', html, count=1, flags=re.S)
html = re.sub(r'office3-backgammon-20261121-v\d+', tag, html)
page.mkdir(parents=True, exist_ok=True)
(page / 'index.html').write_text(html)

days = sorted(['2026-11-17'] + [p.name for p in vision.iterdir() if re.fullmatch(r'\d{4}-\d\d-\d\d(-[a-z0-9]+)?', p.name) and (p / 'index.html').exists()])
for d in days:
    path = vision / 'index.html' if d == '2026-11-17' else vision / d / 'index.html'
    links = []
    for o in days:
        if o == d: href = './'
        elif d == '2026-11-17': href = f'{o}/'
        elif o == '2026-11-17': href = '../'
        else: href = f'../{o}/'
        cur = ' aria-current="page"' if o == d else ''
        links.append(f'                <a href="{href}"{cur}><time datetime="{o[:10]}">{short(o)}</time></a>')
    text = path.read_text()
    text = re.sub(r'(<nav class="vision-sessions" aria-label="Recording sessions">\n).*?(\n\s*</nav>)', lambda m: m.group(1) + '\n'.join(links) + m.group(2), text, count=1, flags=re.S)
    path.write_text(text)
print('sessions', days)
