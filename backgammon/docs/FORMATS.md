# Supported interchange

**XGID**: board characters, cube exponent, owner, player on roll, dice (`00`, two digits, or `D`), both scores, Crawford, match length, cube use. Tests roundtrip public upstream fixtures and reversed-player/match contexts. Positions use standard backgammon; Jacoby/beavers/unknown flags and unsupported maximum-cube fields are rejected. No GNU Position/Match ID claim is made.

**Application JSON**: Library backups use `{format:"backgammon-library",version:1,items,progress}`. Per-item match JSON has `kind:"match"`, canonical `initial`, ordered `{actor,action}` events, names, and metadata. Imported match actions are replayed through the rules engine. Recovery snapshots additionally carry room IDs/revisions/epochs and are not Library backup files. JSON is data only; nothing is evaluated as code.

**Jellyfish MAT text subset**: format follows GNUbg's public `ExportGameJF` routine, referenced at <https://github.com/mormegil-cz/gnubg/blob/master/export.c>. GNUbg's own manual cautions that Jellyfish MAT is not formally standardized: <https://www.gnu.org/software/gnubg/manual/gnubg.html>.

The tested parser expects `N point match`, `Game N`, a two-player `Name : score` line and fixed-column moves. Numbered rows begin with a three-character right-aligned move number and `) `. Player 0's action begins at column 6 (one-based), player 1 at column 34. For example (preserve spaces):

```text
 5 point match

 Game 1
 Ivory : 0                      Teal : 0
  1) 31: 8/5 6/5                 61: 13/7 8/7
  2)  Doubles => 2                Takes
```

Checker destinations, hits (`*`), bar/25, off/0, chained moves and repetition `(2)` through `(4)` are parsed into a candidate board and matched against **complete legal turns**. This prevents plausible-looking but illegal imported moves. Forced passes are accepted only when no legal play exists. Opening dice are assigned to the player identified by the first non-empty column; equal opening dice are rejected. The public format does not encode preceding tied opening rolls, so the importer cannot reconstruct those.

Doubles, Takes, Drops, game scores, subsequent games and ordinary `Wins N points` summaries are supported. A non-bearoff terminal summary is interpreted as accepted resignation only when its winner, points and turn context uniquely permit that transition. Unsupported columns, edited boards, unusual annotations, special rules, ambiguous endings or binary input are rejected with a line number. Incomplete but legal games can be reviewed; they are not labeled completed matches. No arbitrary `.mat` compatibility claim is made. No proprietary binary format is accepted.
