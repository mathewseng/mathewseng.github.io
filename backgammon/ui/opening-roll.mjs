// SPDX-License-Identifier: GPL-3.0-or-later
import { el, dieFace } from "./shell.mjs";
import { reducedMotion } from "./motion.mjs";
import { sound } from "./sound.mjs";

// Presentation only. Values always come from the committed opening event;
// revealing, skipping animation, refreshing, or dismissing never rolls again.
export class OpeningRoll {
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.timers = [];
    this.active = false;
    addEventListener("bg-settings", () => {
      if (this.busy && reducedMotion()) this.finish();
    });
    const settle = () => {
      if (this.busy && (reducedMotion() || document.hidden)) this.finish();
    };
    addEventListener("bg-motion", settle);
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
      "change",
      settle,
    );
    document.addEventListener("visibilitychange", settle);
  }
  sync(model, names, audible = false) {
    if (!model?.started) return this.hide();
    const last = model.events.at(-1),
      state = model.state;
    if (last?.action.type !== "opening" && state.phase !== "opening")
      return this.hide();
    const key = `${model.id}:${state.gameNumber}:${model.events.length}`;
    if (this.key === key && this.active) return;
    let acknowledged;
    try {
      acknowledged = sessionStorage.getItem("backgammon.v1.opening-seen");
    } catch {}
    if (
      last?.action.type === "opening" &&
      (this.acknowledged === key || acknowledged === key) &&
      state.phase !== "opening"
    )
      return this.hide();
    this.hide();
    this.key = key;
    this.active = true;
    this.audible = audible;
    this.names = names;
    this.cubeValue = state.cube.value;
    this.dice = last?.action.type === "opening" ? last.action.dice : null;
    this.tie = this.dice && this.dice[0] === this.dice[1];
    this.busy = !!this.dice && !reducedMotion();
    this.title = el("h2", {}, "Opening roll");
    this.caption = el(
      "p",
      { class: "muted" },
      "One die each. The higher roll starts and uses both dice.",
    );
    this.players = names.map((name, p) => {
      const face = this.dice
        ? dieFace(this.dice[p], { player: p })
        : el(
            "span",
            { class: "die unrolled", "aria-label": "Not rolled" },
            "–",
          );
      if (this.dice) face.setAttribute("aria-hidden", "true");
      return el(
        "div",
        { class: "opening-player", "data-player": p },
        el(
          "span",
          { class: "opening-name", title: name },
          el("i", {
            class: `checker-dot${p ? " teal" : ""}`,
            "aria-hidden": true,
          }),
          el("strong", {}, name),
        ),
        el("div", { class: "opening-die" }, face),
      );
    });
    this.node = el(
      "section",
      {
        class: "opening-roll",
        "aria-label": "Opening dice",
        "aria-live": "polite",
      },
      this.title,
      el("div", { class: "opening-players" }, ...this.players),
      this.caption,
    );
    this.container.append(this.node);
    if (this.dice) {
      if (this.busy) {
        this.timers.push(setTimeout(() => this.reveal(0), 120));
        this.timers.push(setTimeout(() => this.reveal(1), 470));
        this.timers.push(setTimeout(() => this.finish(), 720));
      } else this.finish(false);
    }
  }
  reveal(p) {
    if (!this.players[p].classList.contains("revealed") && this.audible)
      sound.play("die");
    this.players[p].classList.add("revealed");
    this.players[p].querySelector(".die").removeAttribute("aria-hidden");
    this.title.textContent = `${this.names[p]} rolled ${this.dice[p]}`;
  }
  finish(notify = true) {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (!this.dice || !this.active) return;
    this.busy = false;
    this.players.forEach((_, p) => this.reveal(p));
    const winner = this.dice[0] > this.dice[1] ? 0 : 1;
    this.players.forEach((node, p) =>
      node.classList.toggle("opening-winner", !this.tie && winner === p),
    );
    this.title.textContent = this.tie
      ? `A tie · both rolled ${this.dice[0]}`
      : this.names[winner] === "You"
        ? "You start"
        : `${this.names[winner]} starts`;
    this.caption.textContent = this.tie
      ? `Roll one die each again.${this.cubeValue > 1 ? " Stakes are now " + this.cubeValue + " · cube stays centered." : " The stake is unchanged."}`
      : `The winner uses both dice: ${this.dice[0]} and ${this.dice[1]}.`;
    if (notify) this.onChange();
  }
  dismiss() {
    this.acknowledged = this.key;
    try {
      sessionStorage.setItem("backgammon.v1.opening-seen", this.key);
    } catch {}
    this.hide();
    this.onChange();
  }
  hide() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.node?.remove();
    this.node = null;
    this.active = false;
    this.busy = false;
  }
}
