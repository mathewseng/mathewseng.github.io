// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button } from "./shell.mjs";
import { installDialogBehavior } from "./dialog-behavior.mjs";
import { fitDialogViewport } from "./dialog-viewport.mjs";

let promptSerial = 0;

// One set of actions survives rotation: portrait keeps the submitted board
// unobscured, while wider layouts retain a modal confirmation.
export function decisionPrompt(title, content, actions, { container, checker = false } = {}) {
  const portrait = matchMedia("(max-width: 700px) and (orientation: portrait)");
  const copyId = `decision-prompt-copy-${++promptSerial}`;
  const prompt = el("section", {
    class: `decision-prompt${checker ? " checker-warning" : ""}`,
    "aria-label": title, "aria-describedby": copyId, tabindex: -1, open: true,
  });
  const revise = button("", () => prompt.close(), "ghost close btn--icon", {
    "aria-label": "Revise", title: "Revise your decision",
  });
  revise.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  prompt.append(
    el("div", { class: "dialog-head dialog-header" }, el("h2", {}, title), revise),
    el("div", { class: "dialog-body", id: copyId }, content),
    el("footer", { class: "dialog-foot" }, ...actions),
  );
  let closed = false, modal = null;
  Object.defineProperty(prompt, "open", { get: () => !closed });
  const detachModal = () => {
    if (!modal) return;
    modal.removeEventListener("close", dismiss);
    if (modal.open) modal.close();
    modal.remove();
    modal = null;
  };
  const dismiss = () => prompt.close();
  prompt.close = () => {
    if (closed) return;
    closed = true;
    portrait.removeEventListener("change", present);
    detachModal();
    prompt.remove();
    container.hidden = true;
    prompt.dispatchEvent(new Event("close"));
  };
  function present() {
    if (closed) return;
    const focus = prompt.contains(document.activeElement) ? document.activeElement : prompt;
    detachModal();
    prompt.classList.toggle("inline-decision-review", portrait.matches);
    container.hidden = !portrait.matches;
    if (portrait.matches) {
      prompt.setAttribute("role", "region");
      container.append(prompt);
    } else {
      prompt.removeAttribute("role");
      modal = el("dialog", { class: "dialog bg-dialog decision-warning", "aria-label": title, "aria-describedby": copyId });
      modal.append(prompt);
      document.body.append(modal);
      installDialogBehavior(modal, { dismissible: true, onDismiss: dismiss });
      fitDialogViewport(modal);
      modal.addEventListener("close", dismiss);
      modal.showModal();
    }
    focus.focus({ preventScroll: true });
  }
  prompt.addEventListener("keydown", event => {
    if (event.key === "Escape" && portrait.matches) {
      event.preventDefault();
      event.stopPropagation();
      prompt.close();
    }
  });
  portrait.addEventListener("change", present);
  present();
  return prompt;
}
