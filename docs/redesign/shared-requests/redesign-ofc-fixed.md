# Shared requests from redesign/ofc-fixed

| File | Request | Seen on | Why |
| --- | --- | --- | --- |
| `shared/tabs.js` | In `activate()`, scroll only the tablist sideways: replace `active.scrollIntoView({ block: "nearest", inline: "nearest" })` with `tablist.scrollTo({ left: active.offsetLeft - (tablist.clientWidth - active.offsetWidth) / 2 })`, or call it only when `persist` is true (that is, after a user action, not on restore). | `/ofc/fantasyland-ev/` at 320px with a 24px root | On load, when the tablist overflows and is below the fold, `block: "nearest"` also scrolls the page's scrolling `main` down, so the page opens part-way past its head. |
| `shared/app.css` | A `.data-table--stack` modifier for the phone "one card per row" table pass, with a visible label row for the header buttons (here `.matrix-definitions` with `button.chip`). | EV matrix | Recorded as `.data-table--stack` in `redesign-ofc-ev.md`. A stacked table whose `thead` is visually hidden must also take its header buttons out of the tab order. The EV page does this in `app.js` (`bindMatrixHeadFocus`). |
