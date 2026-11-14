// SPDX-License-Identifier: GPL-3.0-or-later
// Keep the table's scroll position while a modal is open. Nested dialogs share
// one lock; closing a child must not unlock the page beneath its parent.
const openDialogs = new Set();
let pageHeight;

export function installDialogBehavior(dialog, { dismissible = false, onDismiss = () => {} } = {}) {
  if (!pageHeight) {
    pageHeight = {
      value: document.body.style.getPropertyValue("min-height"),
      priority: document.body.style.getPropertyPriority("min-height"),
    };
    // Details temporarily moves a live panel into the dialog. Preserve the
    // document's height so that removing it cannot clamp the current scroll.
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    document.body.style.setProperty("min-height", `${height}px`);
    document.documentElement.classList.add("bg-dialog-open");
  }
  openDialogs.add(dialog);
  dialog.addEventListener("close", () => {
    openDialogs.delete(dialog);
    queueMicrotask(() => {
      if (openDialogs.size) return;
      document.documentElement.classList.remove("bg-dialog-open");
      // Let the caller first restore panels to their original locations. Do
      // not force a scroll: Return to this position intentionally goes to the
      // board, while merely closing a sheet should retain the current spot.
      if (pageHeight.value) document.body.style.setProperty("min-height", pageHeight.value, pageHeight.priority);
      else document.body.style.removeProperty("min-height");
      pageHeight = null;
    });
  }, { once: true });

  if (!dismissible) return;
  dialog.addEventListener("cancel", onDismiss);
  // A genuine tap on the backdrop dismisses a tools sheet. A scroll, a drag
  // out of a control, or a tap inside empty dialog space does not. Forms and
  // confirmations opt out, so entered work cannot disappear accidentally.
  let start;
  const outside = event => {
    const r = dialog.getBoundingClientRect();
    return event.target === dialog &&
      (event.clientX < r.left || event.clientX > r.right ||
       event.clientY < r.top || event.clientY > r.bottom);
  };
  dialog.addEventListener("pointerdown", event => {
    start = event.isPrimary && event.button === 0 && outside(event)
      ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  });
  dialog.addEventListener("pointermove", event => {
    if (start?.id === event.pointerId &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 8)
      start = null;
  });
  dialog.addEventListener("pointerup", event => {
    const tap = start;
    start = null;
    if (dialog.open && tap?.id === event.pointerId && outside(event) &&
        Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 8) {
      onDismiss();
      if (dialog.open) dialog.close();
    }
  });
  dialog.addEventListener("pointercancel", () => { start = null; });

  // A phone bottom sheet draws a grab handle, so a downward swipe on its head
  // follows the finger and dismisses it; a short swipe springs back.
  if (!dialog.classList.contains("dialog--sheet")) return;
  let drag;
  const docked = matchMedia("(max-width: 700px) and (min-height: 501px)");
  dialog.addEventListener("pointerdown", event => {
    drag = event.pointerType === "touch" && event.isPrimary && docked.matches &&
      !dialog.hasAttribute("data-keyboard") &&
      event.target.closest?.(".dialog-head") && !event.target.closest("button, a, input, select, [role=tab]")
      ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  });
  dialog.addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId) return;
    dialog.style.transition = "none";
    dialog.style.translate = `0 ${Math.max(0, event.clientY - drag.y)}px`;
  });
  const release = event => {
    const swipe = drag;
    drag = null;
    if (swipe?.id !== event.pointerId) return;
    dialog.style.transition = dialog.style.translate = "";
    const dy = event.clientY - swipe.y;
    if (event.type === "pointerup" && dialog.open && dy > 64 && dy > Math.abs(event.clientX - swipe.x)) {
      onDismiss();
      if (dialog.open) dialog.close();
    }
  };
  dialog.addEventListener("pointerup", release);
  dialog.addEventListener("pointercancel", release);
}
