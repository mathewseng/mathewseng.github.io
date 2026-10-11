// SPDX-License-Identifier: GPL-3.0-or-later
import { Board } from "./ui/board.mjs";
import { initialState } from "./core/rules.mjs";
import { get, all, settings } from "./core/storage.mjs";
import { applyBoardTheme } from "./core/appearance.mjs";
import { startUpdates } from "./ui/updates.mjs";
startUpdates({
  hub: true,
  onStatus: ({ state, message }) => {
    const status = document.getElementById("app-update-status");
    status.dataset.state = state;
    status.textContent = message;
  },
});
applyBoardTheme(settings().boardTheme);
addEventListener("storage", (e) => {
  if (e.key === "backgammon.v1.settings" || e.key === null)
    applyBoardTheme(settings().boardTheme);
});
const board = new Board(document.getElementById("hub-board"));
board.render(initialState(), { ...settings(), interactive: false });
try {
  const recent = document.getElementById("recent"),
    saved = await get("work", "play"),
    items = await all();
  if (saved?.game?.id && saved.game.config?.mode !== "online") {
    const a = document.createElement("a");
    a.href = `/backgammon/play/#resume=${encodeURIComponent(saved.game.id)}`;
    a.textContent = "Resume your game";
    recent.append(a);
  }
  const latest = items.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (latest) {
    const a = document.createElement("a");
    a.href = `/backgammon/solver/?item=${encodeURIComponent(latest.id)}`;
    a.textContent = "Recent: " + latest.title.slice(0, 32);
    recent.append(a);
  }
} catch {}
