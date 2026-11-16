// SPDX-License-Identifier: GPL-3.0-or-later
// Browser chrome and keyboards can shrink/pan Safari's visual viewport
// without changing dvh. Leave pinch zoom browser-controlled.
export function fitDialogViewport(dialog) {
  const viewport = window.visualViewport;
  const fit = () => {
    if (!viewport || viewport.scale !== 1) return;
    for (const [key, value] of Object.entries({
      height: viewport.height, top: viewport.offsetTop,
      width: viewport.width, left: viewport.offsetLeft,
    })) dialog.style.setProperty(`--dialog-visible-${key}`, `${value}px`);
    dialog.toggleAttribute("data-keyboard", innerHeight - viewport.height > 100);
  };
  const cleanup = () => {
    viewport?.removeEventListener("resize", fit);
    viewport?.removeEventListener("scroll", fit);
    window.removeEventListener("resize", fit);
    dialog.removeEventListener("close", cleanup);
  };
  viewport?.addEventListener("resize", fit);
  viewport?.addEventListener("scroll", fit);
  window.addEventListener("resize", fit);
  dialog.addEventListener("close", cleanup, { once: true });
  fit();
  return cleanup;
}
