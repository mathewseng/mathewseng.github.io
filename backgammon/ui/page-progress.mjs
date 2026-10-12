// SPDX-License-Identifier: GPL-3.0-or-later
// Per-tab emergency checkpoint: synchronous pagehide storage complements the
// normal IndexedDB saves. A navigation to a different shared position never
// restores this record. No live multiplayer authority is reconstructed here.
const key = "backgammon.page-progress.";
export function readPageProgress() {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(key + location.pathname) || "null",
    );
    return saved?.version === 1 && saved.url === location.href
      ? saved.value
      : null;
  } catch {
    return null;
  }
}
export function keepPageProgress(capture) {
  const save = () => {
    try {
      const value = capture();
      if (value)
        sessionStorage.setItem(
          key + location.pathname,
          JSON.stringify({ version: 1, url: location.href, value }),
        );
      else sessionStorage.removeItem(key + location.pathname);
    } catch {
      /* IndexedDB remains the primary store if session quota is full. */
    }
  };
  addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) save();
  });
}
