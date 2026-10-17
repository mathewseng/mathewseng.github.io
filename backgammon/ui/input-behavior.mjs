// SPDX-License-Identifier: GPL-3.0-or-later
let installed = false;
export function installInputBehavior() {
  if (installed) return;
  installed = true;
  const root = document.documentElement;
  root.dataset.focusNavigation = "false";
  // A game shortcut/programmatic focus must not leave a browser focus ring.
  // Tab/arrow navigation still has a deliberate, accessible visual focus cue.
  document.addEventListener("pointerdown", () => { root.dataset.focusNavigation = "false"; }, true);
  // Space and Enter on a control are keyboard activation (the play shortcuts
  // skip them there too), so the ring stays on that control and on whatever
  // the activation focuses next, such as a dialog's Close button.
  const control = 'button,a[href],summary,select,[role="button"],[role="tab"],[role="switch"],' +
    '[role="checkbox"],[role="radio"],[role="option"],[role="menuitem"]';
  document.addEventListener("keydown", event => {
    if (["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) ||
      ([" ", "Enter"].includes(event.key) && event.target.closest?.(control)))
      root.dataset.focusNavigation = "true";
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey &&
      !event.target.closest?.('input,textarea,[contenteditable="true"]'))
      root.dataset.focusNavigation = "false";
  }, true);
  // The board, player strips and action area are drag surfaces; text in the
  // inspector, dialogs and the review section stays selectable (styles.css
  // scopes user-select the same way).
  document.addEventListener("selectstart", event => {
    const target = event.target.nodeType === Node.ELEMENT_NODE ? event.target : event.target.parentElement;
    if (target?.closest('input,textarea,[contenteditable="true"]')) return;
    if (target?.closest(".inspector, .play-review, .dialog-body, .dialog-head") &&
        !target.closest(".bg-board, .decision-board, .history-preview-board, .theme-sample, .theme-swatch, .library-preview"))
      return;
    event.preventDefault();
  });
}
