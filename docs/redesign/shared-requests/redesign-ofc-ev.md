# Shared component requests from redesign/ofc-ev

Implemented locally in `ofc/fantasyland-ev/styles.css`; each is generic enough for other data pages.

| Local selector | Proposed shared name | Used by | Notes |
| --- | --- | --- | --- |
| `.metric-matrix`, `.metric-matrix-head`, `.metric-matrix-label`, `.matrix-cell`, `.matrix-value`, `.matrix-meta`, `.matrix-cell--empty` | `.metric-matrix` + `.matrix-cell` in `shared/app.css` | EV overview; the blackjack chart inspector, Dodge aggregates, dice matchups | A row-label column plus N value cells; each cell is value (`--t-lg`/700) + `.bar-track` (`--bar-color`) + one muted 12px meta line. On phones the label spans the row (`grid-column: 1 / -1`) and the corner header hides. Cells need `position: relative` (they carry an `.sr-only` config name). |
| `.matrix-table` phone pass (`thead` visually hidden, `tr` as a card grid, `td[data-label]::before`) | `.data-table--stack` modifier | EV matrix; any wide table that must not scroll on phones | Needs `td.num` overridden to left-align (`.data-table .num` is right-aligned). |
| `.definition-link` | `.th-link` (a header button that explains a column) | EV matrix and deck tables | Dotted underline, inherits header type, 36px fine / 44px coarse min-height, kit focus ring. |
| `.joker-legend .chip` + `.joker-dot` (`.j0/.j1/.j2/.j-hypothetical`) | `.legend` chip row + `.legend-swatch` with a hatched "hypothetical" swatch | EV; any categorical chart | The persistent legend under a control bar; the hatch is `repeating-linear-gradient` from `--page`. |
| `.ev-shell > main { position: relative }` | `.ofc-shell > main` in `ofc/ofc.css` and the kit's future `.app--shell` main | Every app shell whose scrolling `main` contains `.sr-only` text | `.sr-only` is absolutely positioned; inside an unpositioned scroller it escapes to the initial containing block and lengthens the document (the EV phone page measured 1485px beside its 812px shell before this). |
| — | `.segmented > label` min-height | Every segmented control on fine pointers | The kit's pill is 30px inside a 36px track; the brief's 36px fine-pointer floor is met by the track, not the pill. Recorded so the integrator can decide. |
