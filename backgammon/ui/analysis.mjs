// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button, select, field, showError } from "./shell.mjs";
import { EngineClient } from "../engine/client.mjs";
import { PRESETS } from "../engine/metadata.mjs";
import { positionKey } from "../core/rules.mjs";
export const percentage = (n) => `${(100 * n).toFixed(1)}%`;
export const equity = (n) => (n >= 0 ? "+" : "") + n.toFixed(3);
export function probabilityView(c) {
  const [win, gammon, bg, loseGammon, loseBg] = c.probabilities;
  return el(
    "div",
    {},
    el(
      "div",
      { class: "row spread small" },
      el("span", {}, "Win chance"),
      el("strong", {}, percentage(win)),
    ),
    el(
      "div",
      { class: "probability-bar" },
      el("span", { style: `width:${Math.max(0, Math.min(100, win * 100))}%` }),
    ),
    el(
      "div",
      { class: "metrics" },
      el(
        "div",
        {},
        "Win gammon / BG",
        el("strong", {}, `${percentage(gammon)} / ${percentage(bg)}`),
      ),
      el(
        "div",
        {},
        "Lose gammon / BG",
        el("strong", {}, `${percentage(loseGammon)} / ${percentage(loseBg)}`),
      ),
    ),
    el(
      "p",
      { class: "muted small" },
      "Gammon includes backgammon. Chances are for the player on roll.",
    ),
  );
}
export function resultView(result, { onPreview = () => {}, limit = 5 } = {}) {
  const node = el("div", { class: "stack" });
  if (result.type === "cube") {
    node.append(
      el(
        "h2",
        {},
        result.available
          ? { double: "Double", take: "Take", pass: "Pass", roll: "No double" }[
              result.action
            ]
          : "Cube unavailable",
      ),
      probabilityView(result),
      el(
        "div",
        { class: "list" },
        ...result.outcomes.map((n, i) =>
          el(
            "div",
            { class: "list-row row spread" },
            el("span", {}, ["No double", "Double / take", "Double / pass"][i]),
            el(
              "strong",
              { class: "value" },
              result.outcomesMWC
                ? percentage(result.outcomesMWC[i])
                : equity(n),
            ),
          ),
        ),
      ),
    );
  } else {
    const list = el("div", { class: "list" });
    const fill = (count) => {
      list.replaceChildren(
        ...result.candidates
          .slice(0, count)
          .map(
            (c, i) =>
              button(
                "",
                () => onPreview(c),
                "list-row",
              ).appendChildReturn?.() || candidate(c, i),
          ),
      );
    };
    function candidate(c, i) {
      return button("", () => onPreview(c), "list-row", {
        title: "Preview this move",
      }).withContent;
    }
    const rows = (count) =>
      result.candidates.slice(0, count).map((c, i) => {
        const b = button("", () => onPreview(c), "list-row");
        b.append(
          el(
            "div",
            { class: "row spread" },
            el("span", {}, `${i + 1}. ${c.notation}`),
            el(
              "strong",
              { class: "value" },
              c.mwc !== null ? percentage(c.mwc) : equity(c.equity),
            ),
          ),
          el(
            "span",
            { class: "muted small" },
            `Δ ${equity(c.equity - result.candidates[0].equity)} · win ${percentage(c.probabilities[0])}`,
          ),
        );
        return b;
      });
    list.append(...rows(limit));
    node.append(el("h2", {}, "Evaluated moves"), list);
    if (result.candidates.length > limit)
      node.append(
        button(
          `Show all ${result.candidates.length} moves`,
          (e) => {
            list.replaceChildren(...rows(result.candidates.length));
          },
          "ghost",
        ),
      );
    if (result.candidates.length) {
      const best = result.candidates[0];
      node.append(
        probabilityView(best),
        el(
          "div",
          { class: "metrics" },
          el(
            "div",
            {},
            "Cubeful equity",
            el("strong", {}, equity(best.equity)),
          ),
          el(
            "div",
            {},
            "Cubeless equity",
            el("strong", {}, equity(best.cubeless)),
          ),
        ),
      );
    }
  }
  node.append(
    el(
      "p",
      { class: "muted small" },
      `${result.settings.name} · ${result.settings.plies} ply · ${(result.elapsedMs / 1000).toFixed(2)} s${result.cached ? " · cached" : ""}. ${result.units === "current-cube-points" ? "Equity is in current-cube points." : "Main value is match-winning chance; Δ is normalized match equity."} Cubeless equity and engine metadata are included in saved results.`,
    ),
  );
  return node;
}
export class AnalysisPanel {
  constructor({ onResult = () => {} } = {}) {
    this.status = el(
      "div",
      { class: "engine-status", role: "status" },
      "GNUbg loads when needed.",
    );
    this.preset = "quick";
    this.engine = new EngineClient({
      onStatus: (type, text) => {
        this.status.classList.toggle(
          "busy",
          ["busy", "loading"].includes(type),
        );
        this.status.textContent = text;
      },
    });
    this.onResult = onResult;
    this.token = 0;
  }
  controls() {
    return el(
      "div",
      { class: "stack" },
      field(
        "Analysis strength",
        select(
          Object.entries(PRESETS).map(([k, v]) => [
            k,
            `${v.name} · ${v.plies} ply`,
          ]),
          this.preset,
          (v) => (this.preset = v),
        ),
      ),
      this.status,
    );
  }
  async run(state, options = {}) {
    const token = ++this.token,
      key = positionKey(state);
    const result = await this.engine.analyze(state, {
      preset: this.preset,
      ...options,
    });
    if (token !== this.token || key !== positionKey(state))
      throw new DOMException("Stale analysis.", "AbortError");
    this.result = result;
    this.onResult(result);
    return result;
  }
  cancel() {
    this.token++;
    this.engine.cancel();
  }
  async safely(state, options) {
    try {
      return await this.run(state, options);
    } catch (e) {
      if (e.name !== "AbortError") showError(e);
      return null;
    }
  }
}
