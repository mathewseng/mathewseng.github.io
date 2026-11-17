import { SHARPS, FLATS, noteName } from './engine.mjs';

// Diatonic staff placement, not a chromatic y-offset: C# and Db occupy
// different staff positions even though their sounding MIDI pitch is equal.
export function staffLayout(midi, flats = false) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new Error('Invalid MIDI pitch.');
  let written = midi, octavesUp = 0;
  while (written > 84) { written -= 12; octavesUp++; }
  const spelling = (flats ? FLATS : SHARPS)[written % 12];
  const octave = Math.floor(written / 12) - 1;
  const clef = written < 60 ? 'bass' : 'treble';
  const index = octave * 7 + 'CDEFGAB'.indexOf(spelling[0]);
  const bottomIndex = clef === 'treble' ? 30 : 18; // E4 / G2
  const y = 100 - (index - bottomIndex) * 6;
  const ledgers = [];
  for (let line = 112; line <= y; line += 12) ledgers.push(line);
  for (let line = 40; line >= y; line -= 12) ledgers.push(line);
  return { clef, y, ledgers, accidental: spelling.slice(1), label: noteName(midi, flats), octavesUp };
}
export function staffSvg(midi, flats = false) {
  const layout = staffLayout(midi, flats);
  const stemUp = layout.y >= 76;
  const octaveMark = layout.octavesUp ? `${7 * layout.octavesUp + 1}${layout.octavesUp === 1 ? 'va' : 'ma'}` : '';
  return `<svg class="note-staff" viewBox="0 0 220 158" role="img" aria-label="${layout.label} on ${layout.clef} clef${octaveMark ? `, ${octaveMark}` : ''}">
    ${[52, 64, 76, 88, 100].map(y => `<line class="staff-line" x1="14" y1="${y}" x2="207" y2="${y}"/>`).join('')}
    <text class="staff-clef" x="17" y="${layout.clef === 'treble' ? 88 : 64}">${layout.clef === 'treble' ? '&#xE050;' : '&#xE062;'}</text>
    ${layout.ledgers.map(y => `<line class="staff-ledger" x1="111" y1="${y}" x2="143" y2="${y}"/>`).join('')}
    ${layout.accidental ? `<text class="staff-accidental" x="99" y="${layout.y}">${layout.accidental === '♯' ? '&#xE262;' : '&#xE260;'}</text>` : ''}
    <ellipse class="staff-note" cx="127" cy="${layout.y}" rx="8" ry="5.5" transform="rotate(-20 127 ${layout.y})"/>
    <line class="staff-stem" x1="${stemUp ? 134 : 120}" y1="${layout.y}" x2="${stemUp ? 134 : 120}" y2="${layout.y + (stemUp ? -35 : 35)}"/>
    ${octaveMark ? `<text class="staff-octave" x="118" y="16">${octaveMark}</text>` : ''}
  </svg>`;
}
