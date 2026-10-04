// SPDX-License-Identifier: GPL-3.0-or-later
import { Board } from "./ui/board.mjs";
import { initialState } from "./core/rules.mjs";
import { get, all, settings } from "./core/storage.mjs";
const board = new Board(document.getElementById("hub-board"));
board.render(initialState(), { ...settings(), interactive: false });
try {
  const recent = document.getElementById("recent"),
    saved = await get("work", "play"),
    items = await all();
  if (saved) {
    const a = document.createElement("a");
    a.href = "/backgammon/play/";
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
