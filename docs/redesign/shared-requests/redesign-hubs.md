# Shared requests from redesign/hubs

Components implemented in `shared/hub.css` (this step owns it) that other families will want,
and two app.css rules that break the 12px / tertiary-grey floors.

## `.link-list` ← `.hub-links` (blackjack/index.html, dice/index.html)

A list of plain links with a muted description, for references and secondary links that must
not look like tiles. Also wanted by Backgammon's hub (Controls · Refresh · Engine report row)
and the rules/about dialogs' source links.

```css
.hub-links { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.hub-links li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 12px; padding: 2px 0; border-bottom: 1px solid var(--line); }
.hub-links a { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; color: var(--accent); font-size: var(--t-md); font-weight: 600; text-decoration: underline; text-decoration-color: color-mix(in oklab, var(--accent) 45%, transparent); text-underline-offset: 3px; }
.hub-links a:hover { text-decoration-color: currentColor; }
.hub-links a:focus-visible { border-radius: var(--r-sm); outline-offset: 0; }
.hub-links a .icon { width: 14px; height: 14px; stroke-width: 2; }
.hub-links li > span { color: var(--muted); font-size: var(--t-sm); line-height: var(--lh-body); }
```

## `.foot` fixes and `.foot-links` (every hub and the landing page; document pages next)

app.css sets `.foot { color: var(--soft); font-size: 0.8rem }` and `0.74rem` under 640px:
tertiary grey below 15px and 11.8px text on phones. hub.css overrides both; app.css should take
the override and the link row:

```css
.foot { align-items: center; color: var(--muted); font-size: var(--t-sm); }
.foot-links { display: flex; flex-wrap: wrap; gap: 2px 16px; }
.foot a { display: inline-flex; align-items: center; gap: 5px; min-height: 44px; text-decoration: underline; text-decoration-color: color-mix(in oklab, var(--muted) 40%, transparent); text-underline-offset: 3px; }
.foot a:hover { text-decoration-color: currentColor; }
.foot a:focus-visible { border-radius: var(--r-sm); outline-offset: 0; }
.foot .icon { width: 14px; height: 14px; stroke-width: 2; }
@media (max-width: 640px) { .foot { flex-direction: column; align-items: flex-start; gap: 0; } }
```

and drop the phone `font-size: 0.74rem`.

## `.icon--sm` (14px) for inline link icons

Both blocks above size `.icon` to 14px for an icon beside link text; a modifier in app.css
would replace the two descendant rules.

## `.die` ← `svg.hub-die` (dice/index.html, index.html)

The brief's component 23. The hub draws a die as an inline SVG with the favicon's pip geometry
(`rect` 60×60 rx 15, pips r 5.5 at 20/32/44), filled from tokens: `rect { fill: var(--surface-3);
stroke: var(--line-strong) }`, `circle { fill: var(--accent) }`. Card Table Workshop and the
Backgammon theme samples can reuse the same markup; a `.die` class in app.css with
`fill`/`stroke` from tokens and the pip layouts documented would let the dice page's canvas read
the same colours.

## Switcher edge fade on phones

At 320px the phone switcher (already `overflow-x: auto` in app.css) clips "Dice" at the scroll
edge with no hint that it scrolls; the brief's edge fade (`mask-image` on `.switcher`) belongs
in app.css.

## `.tile svg` is too broad

`hub.css` styles every `svg` inside a `.tile` as an 18px stroked icon, which is why the dice
faces needed `svg.hub-die` to win. If `.tile svg` becomes `.tile-icon svg, .go svg` in a later
hub.css pass, the `svg.hub-die` specificity workaround can go.

## `.crumbs a` needs the 44px floor on phones (review fix, redesign/hubs-fixed)

The crumbs home link (the 32px `.mark` plus "Projects") measures 96×32 on every hub at
≤ 640px; the shell sweep does not check `.crumbs a`, so it passed. `shared/hub.css` holds
`min-height: 44px` on `.crumbs a` in its phone block until app.css takes it:

```css
@media (pointer: coarse), (max-width: 640px) {
  .crumbs a { min-height: 44px; }
}
```

## Clipped tile copy belongs in the shell sweep

`scripts/shell-browser.cjs` has no clamp assertion, so the ellipsised tile copy at 844×390
and 1024×768 that the review found passed every sweep. A one-line check on hub pages would
keep it fixed: every `.tile p` with `scrollHeight <= clientHeight + 1`. The site-map test
guards the hub.css rules statically meanwhile.
