# Implementation checklist

Visual thesis: a quiet slate instrument, ivory and teal checkers, a generous flat board, and crisp utility typography.
Content plan: compact family hub; board-first tools with a single contextual inspector; secondary controls in native dialogs.
Interaction thesis: immediate selection and destination cues, short draft transitions, interruptible analysis with stable controls.

- [x] Pure rules, match state, replay, XGID and invariant tests
- [x] Shared responsive shell, SVG board and accessible draft controls
- [x] Pinned GNUbg source/assets, arbitrary move scoring, worker lifecycle
- [x] Play, Trainer, Solver, Library and versioned persistence
- [x] PeerRoom protocol, reconnect/recovery and integration tests
- [x] Scoped offline cache, artifact assembly and documentation
- [x] Real engine benchmarks, browser tests and inspected screenshots
- [x] Full repository checks and deployment-artifact validation

See `VALIDATION.md` for observed coverage and the family README for precise capability limits. Publishing follows the repository's commit/push-to-main workflow.

## Checker interaction refinement

- [x] Legal-source rings, destination die badges and landing previews
- [x] Tap, mouse/touch/pen pointer drag, cancellation and accessible keyboard controls
- [x] Interruptible checker/hit/undo/opponent motion with reduced-motion support
- [x] Separate opening die reveals, visible ties/winner and explicit Begin turn
- [x] Beginner guidance and focused cross-browser interaction coverage

## Board appearance

- [x] Six coordinated presets with readable text, dice and checker counts
- [x] Thirty-four independent hex/color-picker controls and a shared live board preview
- [x] Invalid-input handling, readability feedback, individual resets and undo
- [x] Saved colors across all family tools, previews and browser tabs
- [x] Editing themes preserves drafts, committed dice, history and analysis context

## Cache recovery

- [x] Revalidate worker imports and bypass stale HTTP assets during shell installation
- [x] Standalone refresh route preserving saved data, with explicit activation and open-window guard
- [x] Real old-cache upgrade in Chromium, Firefox and WebKit against the assembled site
- [x] Resume a first-turn draft after closing its original tab without repeating the opening prompt
- [x] Hub refresh link and automatic startup/foreground/reconnect checks
- [x] Versioned worker imports, safe staged activation and preservation of occupied tools
