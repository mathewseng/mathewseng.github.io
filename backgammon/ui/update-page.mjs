// SPDX-License-Identifier: GPL-3.0-or-later
// The static controls guide shares the family update gate, without an app shell.
import { startUpdates } from "./updates.mjs";
import { settings } from "../core/storage.mjs";
import { applySkin } from "./skin.mjs";
applySkin(settings().skin);
addEventListener("storage", (e) => {
  if (e.key === "backgammon.v1.settings" || e.key === null) applySkin(settings().skin);
});
startUpdates();
