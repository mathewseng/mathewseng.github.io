# EWI fingerings

A static practice tool for **Akai EWI4000s, standard EWI (Ei) mode** at `/music/ewi-fingerings/`.
Key Explorer opens by default. On phones, Fingerings stacks the horizontal diagrams one per row.

- `fingerings.mjs`: 85 reference K1–K13 bit patterns, ordered from written B♭3 through D5. `1` means skin contact. Data was checked against all nine pages of [OneWatt's 2009 chart](https://www.patchmanmusic.com/EWIFingeringOneWatts.pdf). The fifth D transcription was corrected and the missing ninth A alternate restored. The source’s second low-C diagram conflicts with the documented pitch rules: this library keeps K10 held for that C. All 85 stored entries are checked against the pitch model. The Melody tab uses eligible entries from this chart.
- `key-rules.mjs`: standard Ei pitch model for all 8,192 touch combinations. DynaSample’s EWI Basics (page 4) documents the conditional K2/K3/K8 logic and K5/K7 shared raise. K1 and K4 each contribute a fixed −2 semitones. Adding them can also change K3 and K8 respectively, which the live net pitch change includes. The shared +1 is counted under K5 when both K5 and K7 are held. Tests exhaustively validate the expected effects and cross-check all 85 reference fingerings.
- `notation.mjs`: enharmonic staff placement, treble/bass clefs, ledger lines and octave marks. Clefs and accidentals use a 5 KB, four-glyph Bravura subset renamed EWI Notation under the SIL OFL; source and license are in `assets/notation-license.txt`.
- `ranking.mjs`: enumerates all 5,120 eligible sensor patterns. Ranked suggestions pair K2 with K1 and omit K3 for that fingering. It indexes these patterns by modeled pitch. The sort favors fewer side touches, then a lower shared-finger penalty, then descending binary values for the main and side groups. K2 is in the main group and counts toward total keys down. The K1 + K2 roll on its own has no shared-finger penalty, so it ranks first for B♭ when the register is available.
- `engine.mjs`: register-aware candidates, parsing, key changes and dynamic programming over a whole phrase. Akai main fingerings receive a configurable familiarity preference. A state is `(pattern, register)`, not just pitch class; overlapping low/high extensions can avoid a thumb change. Locks fix an individual choice and recompute the rest. Each key change costs 1; additional thumb, pinky and unfamiliarity costs are visible in the UI. It is a movement heuristic, not a model of timing, fingering glitches or anatomy.
- `app.js`: explorer, 13-key inspector, melody editor, optional Web Audio reference tones and guarded local persistence. It uses no third-party runtime libraries or external network requests. Font and colour tokens come from the shared site shell.
- `note-moves.mjs`: scores all 306 ordered pairs of notes from B♭3 through E♭5 at a fixed thumb position. It counts changed front keys and shows up to six of the simplest tied paths, ordered by combined side touches, comfort penalty, and chart rank.
- `key-artwork.mjs`: shared SVG outlines and key positions measured from the Top Panel drawing on printed page 5 of Akai's reference manual. The numbered diagram on page 37 identifies K1–K13. Fingerings, Note Moves and Melody rotate the same layout for their horizontal diagrams.
- `scales.mjs`: the planner starts with C major. The scale picker groups all seven church modes together and puts Chromatic under Common. Named scales are available in all twelve roots alongside custom semitone patterns. Scales load as editable melodies.

The comparison chart uses compact horizontal key diagrams with each fingering’s rank and held-key count. Groups are ordered by the pitch their front keys play at the neutral thumb position, highest octave first. In each thumb register, the chart shows all fingerings without side touches. If the register requires side keys, it shows up to three of the best-ranked fingerings that use the fewest side touches. Remaining patterns are paginated inside a disclosure. The chart only shows a thumb offset when it differs from the first fingering. Listening and adding a note use the last note’s octave in a typed phrase, with octave 4 as the default. Adding a chart fingering locks those exact front keys at the appended step. Recalculating or playing keeps locks on unchanged steps. On desktop, the selected fingering preview sits beside the chart. On phones it expands above the chart. Flats are the default and the chosen spelling is saved. Gold fills mark touched keys and dark slate outlines mark released keys.

The Key Explorer places 13 keys in playing position, with round-key labels on the left and side-key and bis labels on the right. A thumb stepper changes the letter name, MIDI pitch and staff. K2 lowers the pitch by one semitone on its own. It drops out when K1 and K3 are both held. Descriptions put the usual effect first, followed by exceptions and live examples. Blue means usually −2 semitones, violet −1, and green +1. Dashed outlines and dependency labels mark conditional or linked keys. The Pitch drops table pairs K2 with K1 and lists combinations in order of each group’s effect. Selecting a total loads its keys into Key Explorer.

Melody shows one row per note from highest to lowest pitch, with its playback step, front-key diagram and thumb register. Select a row to see its fingering choices below the list. The panel shows the current fingering and every option within two movement points of the best. Scores re-optimize the whole phrase with that option fixed and all other locks applied. Playback follows the entered phrase order.

## Register convention

Middle C is C4 / MIDI 60. Written chart pitches are B♭3 (58) through D5 (74), and a register shift adds 12 semitones. The UI shows relative thumb positions −2 through +4 from Akai's chart. This implementation conservatively supports chart candidates within MIDI 34–111; it does not claim to cover every hardware endpoint. Patch octave shifts and transpose can change the sounding pitch. Confirm the neutral register with a tuner on the actual instrument.

The 4000s and 5000 manuals document the same 13-key standard chart. The playing guide is centered on the 4000s; it calls out model differences for the Octave/Interval button. Sax, flute, oboe, EVI and reversed EVI fingerings are outside this chart. Other models have their own controls and ranges.

## Sources

- [Ingo Scherzinger / DynaSample, EWI Basics](https://dynasample.com/downloads/EWI_Basics.pdf), page 4: conditional keys and shared raise input.
- [OneWatt alternate fingering chart](https://www.patchmanmusic.com/EWIFingeringOneWatts.pdf), pages 1–9. The original PDF carries its personal-use notice; this site links to it and renders its own schematic from factual key states.
- [Akai EWI4000s reference manual](https://cdn.inmusicbrands.com/akai/ewi-4000/ewi4000s_refmanual_revd_00.pdf_2b1b7872139bd77b89740a52cbb86d99.pdf), printed pages 5–17 and 37–38.
- [Akai EWI5000 user guide](https://cdn.inmusicbrands.com/akai/ewi5000/EWI5000-UserGuide-v1.0.pdf_6b0a349fd5e4a543bc738d9634196b60.pdf), printed pages 5–10, 35–36 and 38–39.

## Checks

```sh
node --test music/ewi-fingerings/tests/*.test.mjs
node music/ewi-fingerings/tests/browser.cjs
node music/ewi-fingerings/tests/handoff.cjs
SHELL_PAGES=/music/ewi-fingerings/ node scripts/shell-browser.cjs --site .
```

Browser checks serve the repository on an ephemeral local port with the existing quiet Playwright helper; no build is needed. Screenshots go to `/tmp/ewi-redesign/`.
