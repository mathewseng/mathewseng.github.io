// SPDX-License-Identifier: GPL-3.0-or-later
// Browser chrome and keyboards can shrink/pan Safari's visual viewport
// without changing dvh. Leave pinch zoom browser-controlled.
export function fitDialogViewport(dialog) {
  const viewport = window.visualViewport;
  const warning = dialog.classList?.contains("decision-warning");
  let frame;
  const fit = () => {
    if (!viewport || viewport.scale !== 1) return;
    for (const [key, value] of Object.entries({
      height: viewport.height, top: viewport.offsetTop,
      width: viewport.width, left: viewport.offsetLeft,
    })) dialog.style.setProperty(`--dialog-visible-${key}`, `${value}px`);
    const keyboard = innerHeight - viewport.height > 100;
    dialog.toggleAttribute("data-keyboard", keyboard);
    if (warning && dialog.open) {
      const board = document.querySelector(".play-page.live-table .board-slot > .bg-board");
      const top = board?.getBoundingClientRect().bottom + 12;
      // A short decision card belongs just below the board, where the thumbs
      // already are. Keep the normal safe-area layout when space is tight.
      const fits = !keyboard && viewport.width <= 700 && viewport.height > viewport.width &&
        top >= viewport.offsetTop + 20 &&
        top + dialog.getBoundingClientRect().height <= viewport.offsetTop + viewport.height - 40;
      dialog.toggleAttribute("data-thumb-positioned", fits);
      if (fits) dialog.style.setProperty("--decision-top", `${top}px`);
    }
  };
  const cleanup = () => {
    viewport?.removeEventListener("resize", fit);
    viewport?.removeEventListener("scroll", fit);
    window.removeEventListener("resize", fit);
    dialog.removeEventListener("close", cleanup);
    if (frame) cancelAnimationFrame(frame);
    observer?.disconnect();
  };
  viewport?.addEventListener("resize", fit);
  viewport?.addEventListener("scroll", fit);
  window.addEventListener("resize", fit);
  dialog.addEventListener("close", cleanup, { once: true });
  const observer = warning && typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
  observer?.observe(dialog);
  fit();
  if (warning) frame = requestAnimationFrame(fit);
  return cleanup;
}
