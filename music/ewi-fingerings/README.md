# EWI fingerings

A static practice tool for **Akai EWI4000s, standard EWI (Ei) mode** at `/music/ewi-fingerings/`.

- `fingerings.mjs`: 85 documented K1–K13 bit patterns, ordered from written B♭3 through D5. `1` means skin contact. Data was checked against all nine pages of [OneWatt's 2009 chart](https://www.patchmanmusic.com/EWIFingeringOneWatts.pdf). Two old transcription errors were corrected (the second low C and fifth D); the missing ninth A alternate was restored. This selection does not exhaust every redundant combination the hardware accepts.
- `engine.mjs`: register-aware candidates, parsing, key changes and dynamic programming over a whole phrase. Akai main fingerings receive a configurable familiarity preference. A state is `(pattern, register)`, not just pitch class; overlapping low/high extensions can avoid a thumb change. Locks fix an individual choice and recompute the rest. Each key change costs 1; additional thumb, pinky and unfamiliarity costs are visible in the UI. It is a movement heuristic, not a model of timing, fingering glitches or anatomy.
- `app.js`: explorer, 13-key inspector, melody editor, optional Web Audio reference tones and guarded local persistence. It uses no third-party runtime libraries or network requests. Font and colour tokens come from the shared site shell.

## Register convention

Middle C is C4 / MIDI 60. Written chart pitches are B♭3 (58) through D5 (74), and a register shift adds 12 semitones. The UI shows relative thumb positions −2 through +4 from Akai's chart. This implementation conservatively supports chart candidates within MIDI 34–111; it does not claim to cover every hardware endpoint. Patch octave shifts and transpose can change the sounding pitch. Confirm the neutral register with a tuner on the actual instrument.

The 4000s and 5000 manuals document the same 13-key standard chart. The playing guide is centered on the 4000s; it calls out model differences for the Octave/Interval button. Sax, flute, oboe, EVI and reversed EVI fingerings are outside this chart. Other models have their own controls and ranges.

## Sources

- [OneWatt alternate fingering chart](https://www.patchmanmusic.com/EWIFingeringOneWatts.pdf), pages 1–9. The original PDF carries its personal-use notice; this site links to it and renders its own schematic from factual key states.
- [Akai EWI4000s reference manual](https://cdn.inmusicbrands.com/akai/ewi-4000/ewi4000s_refmanual_revd_00.pdf_2b1b7872139bd77b89740a52cbb86d99.pdf), printed pages 5–17 and 37–38.
- [Akai EWI5000 user guide](https://cdn.inmusicbrands.com/akai/ewi5000/EWI5000-UserGuide-v1.0.pdf_6b0a349fd5e4a543bc738d9634196b60.pdf), printed pages 5–10, 35–36 and 38–39.

## Checks

```sh
node --test music/ewi-fingerings/tests/engine.test.mjs
node music/ewi-fingerings/tests/browser.cjs
SHELL_PAGES=/music/ewi-fingerings/ node scripts/shell-browser.cjs --site .
```

Browser checks serve the repository on an ephemeral local port with the existing quiet Playwright helper; no build is needed. Screenshots go to `/tmp/ewi-redesign/`.
