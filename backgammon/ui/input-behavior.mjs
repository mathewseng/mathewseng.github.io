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
  document.addEventListener("keydown", event => {
    if (["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key))
      root.dataset.focusNavigation = "true";
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey &&
      !event.target.closest?.('input,textarea,[contenteditable="true"]'))
      root.dataset.focusNavigation = "false";
  }, true);
  document.addEventListener("selectstart", event => {
    const target = event.target.nodeType === Node.ELEMENT_NODE ? event.target : event.target.parentElement;
    if (!target?.closest('input,textarea,[contenteditable="true"]')) event.preventDefault();
  });
}
