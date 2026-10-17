// Shared dialog and bottom-sheet behaviour for the .dialog component in
// shared/app.css. The keyboard-viewport fitting and backdrop-tap dismissal are
// lifted from backgammon/ui/shell.mjs and ui/dialog-behavior.mjs; focus
// return follows the Gym app shell.
//
// Classic script: exposes window.Sheet (and module.exports in Node).
//
//   const d = Sheet.create({ title: "Settings", body: node, actions: [btn], sheet: true });
//   Sheet.open(d, { dismissible: true, returnFocus: button });
//   Sheet.fit(d);        // re-measure the visual viewport (done automatically while open)
//   Sheet.close(d);
//
// open() shows the <dialog> modally (so the rest of the page is inert and Escape
// closes it), keeps its actions inside the visible viewport while a software
// keyboard is up (--dialog-visible-height/top plus data-keyboard, read by
// app.css), locks the document scroll with html.has-dialog, optionally closes
// on a genuine backdrop tap, and returns focus to the opener on close.
(function (root) {
  "use strict";

  const openDialogs = new Set();
  let pageHeight = null;

  function doc() {
    return root.document;
  }

  function el(tag, attrs = {}, ...children) {
    const node = doc().createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children) if (child != null) node.append(child);
    return node;
  }

  // Safari's on-screen keyboard shrinks the visual viewport without changing
  // dvh. Keep the dialog's actions inside that visible region; pinch zoom stays
  // browser-controlled rather than triggering a layout change.
  function fit(dialog) {
    const viewport = root.visualViewport;
    if (!viewport || viewport.scale !== 1) return;
    dialog.style.setProperty("--dialog-visible-height", viewport.height + "px");
    dialog.style.setProperty("--dialog-visible-top", viewport.offsetTop + "px");
    dialog.toggleAttribute("data-keyboard", root.innerHeight - viewport.height > 100);
  }

  function lockPage() {
    if (pageHeight) return;
    const body = doc().body;
    pageHeight = {
      value: body.style.getPropertyValue("min-height"),
      priority: body.style.getPropertyPriority("min-height"),
    };
    // Preserve the document's height so a panel moved into the dialog cannot
    // clamp the current scroll position when it is moved back.
    const height = Math.max(body.scrollHeight, doc().documentElement.scrollHeight);
    body.style.setProperty("min-height", height + "px");
    doc().documentElement.classList.add("has-dialog");
  }

  function unlockPage() {
    if (!pageHeight || openDialogs.size) return;
    const body = doc().body;
    doc().documentElement.classList.remove("has-dialog");
    if (pageHeight.value) body.style.setProperty("min-height", pageHeight.value, pageHeight.priority);
    else body.style.removeProperty("min-height");
    pageHeight = null;
  }

  // A genuine tap on the backdrop dismisses the dialog. A scroll, a drag out
  // of a control, or a tap inside empty dialog space does not.
  function installBackdropDismiss(dialog) {
    let start = null;
    const outside = (event) => {
      const r = dialog.getBoundingClientRect();
      return (
        event.target === dialog &&
        (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
      );
    };
    dialog.addEventListener("pointerdown", (event) => {
      start = event.isPrimary && event.button === 0 && outside(event) ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    });
    dialog.addEventListener("pointermove", (event) => {
      if (start && start.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 8) start = null;
    });
    dialog.addEventListener("pointerup", (event) => {
      const tap = start;
      start = null;
      if (dialog.open && tap && tap.id === event.pointerId && outside(event) && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 8)
        dialog.close();
    });
    dialog.addEventListener("pointercancel", () => {
      start = null;
    });
  }

  function open(dialog, options = {}) {
    if (!dialog || dialog.open) return dialog;
    const opener = options.returnFocus === false ? null : options.returnFocus || doc().activeElement;
    const viewport = root.visualViewport;
    const refit = () => fit(dialog);
    if (options.sheet) dialog.classList.add("dialog--sheet");
    if (options.dismissible && !dialog.dataset.dismissible) {
      installBackdropDismiss(dialog);
      dialog.dataset.dismissible = "true";
    }
    lockPage();
    openDialogs.add(dialog);
    if (viewport) {
      viewport.addEventListener("resize", refit);
      viewport.addEventListener("scroll", refit);
    }
    refit();
    dialog.addEventListener(
      "close",
      () => {
        openDialogs.delete(dialog);
        if (viewport) {
          viewport.removeEventListener("resize", refit);
          viewport.removeEventListener("scroll", refit);
        }
        dialog.removeAttribute("data-keyboard");
        queueMicrotask(unlockPage);
        if (options.remove) dialog.remove();
        if (opener && typeof opener.focus === "function" && opener.isConnected) opener.focus({ preventScroll: true });
        if (typeof options.onClose === "function") options.onClose(dialog.returnValue);
      },
      { once: true },
    );
    dialog.showModal();
    const first = options.initialFocus || dialog.querySelector("[autofocus]");
    if (first && typeof first.focus === "function") first.focus();
    return dialog;
  }

  function close(dialog, returnValue) {
    if (dialog && dialog.open) dialog.close(returnValue);
  }

  // Builds <dialog class="dialog"> with a head (title + close), a scrolling
  // body and a footer of actions. The .dialog-error slot renders errors inside
  // the modal; fill it with setError().
  function create({ title, body, actions = [], sheet = false, className = "", id = null, closeLabel = "Close" } = {}) {
    const dialog = el("dialog", { class: ("dialog " + (sheet ? "dialog--sheet " : "") + className).trim(), id, "aria-label": title });
    const closeButton = el("button", { type: "button", class: "btn btn--ghost btn--icon", "aria-label": closeLabel });
    closeButton.textContent = "✕";
    closeButton.addEventListener("click", () => dialog.close());
    const error = el("div", { class: "dialog-error", role: "alert" });
    const bodyNode = el("div", { class: "dialog-body" }, error);
    if (typeof body === "string") bodyNode.append(el("p", { text: body }));
    else if (body) bodyNode.append(body);
    dialog.append(el("div", { class: "dialog-head" }, el("h2", { text: title }), closeButton), bodyNode, el("div", { class: "dialog-foot" }, ...actions));
    doc().body.append(dialog);
    return dialog;
  }

  function setError(dialog, message) {
    const slot = dialog && dialog.querySelector(".dialog-error");
    if (slot) slot.textContent = message || "";
  }

  // Convenience: a confirm with a verb on a danger button, never a generic accent "Continue".
  function confirm({ title, text, verb = "Confirm", danger = false, sheet = false }) {
    return new Promise((resolve) => {
      const cancel = el("button", { type: "button", class: "btn btn--ghost", text: "Cancel" });
      const action = el("button", { type: "button", class: "btn " + (danger ? "btn--danger" : "btn--primary"), text: verb });
      const dialog = create({ title, body: text, actions: [cancel, action], sheet, className: "dialog--confirm" });
      cancel.addEventListener("click", () => dialog.close("cancel"));
      action.addEventListener("click", () => dialog.close("confirm"));
      open(dialog, { remove: true, onClose: (value) => resolve(value === "confirm") });
    });
  }

  const api = { open, close, fit, create, setError, confirm };
  root.Sheet = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
