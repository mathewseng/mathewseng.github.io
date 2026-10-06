// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button, select, field, showError } from "./shell.mjs";
import { comparisonSummary, moveFeatures } from "../core/analysis-insight.mjs";
import { EngineClient } from "../engine/client.mjs";
import { PRESETS } from "../engine/metadata.mjs";
import { positionKey, playerName } from "../core/rules.mjs";
export const percentage = (n) => `${(100 * n).toFixed(1)}%`;
export const equity = (n) => (n >= 0 ? "+" : "") + n.toFixed(3);
export function probabilityView(c, player) {
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
      `Gammon includes backgammon. Chances are for ${player === undefined ? "the player on roll" : playerName(player) + ", the player on roll"}.`,
    ),
  );
}
export function resultView(
  result,
  { onPreview = () => {}, limit = 5, source = null, previous = null } = {},
) {
  const node = el("div", { class: "stack" });
  const insight = comparisonSummary(result, previous);
  if (insight)
    node.append(
      el(
        "p",
        { class: "notice", id: "analysis-comparison" },
        `${insight.changed === true ? "The preferred move changed since " + insight.previousName + ". " : insight.changed === false ? "The preferred move is unchanged since " + insight.previousName + ". " : ""}${insight.close ? (result.method === "rollout" ? "The leading moves are not separated by the conservative sampling margin." : "The leading moves are close: less than 0.020 equity apart. Treat the ranking as an estimate.") : "Compare the evaluated differences, not just the rank."}`,
      ),
    );
  if (result.screening)
    node.append(
      el(
        "p",
        { class: "muted small" },
        `${result.screening.finalists} finalists from ${result.screening.total} alternatives screened at ${result.screening.plies} ply. A screened-out move can still be better; only finalists are compared below.`,
      ),
    );
  if (result.method === "rollout")
    node.append(
      el(
        "p",
        { class: "notice" },
        `${result.settings.trials} trials per alternative · ${result.settings.policy}. ${result.uncertainty}`,
      ),
    );
  if (result.type === "cube") {
    node.append(
      el(
        "h2",
        {},
        result.available
          ? {
              double: "Double",
              take: "Take",
              pass: "Pass",
              roll: "No double",
              beaver: "Beaver",
              raccoon: "Raccoon",
            }[result.action]
          : "Cube unavailable",
      ),
      probabilityView(result, result.perspective),
      el(
        "div",
        { class: "list" },
        ...(
          (!result.available
            ? [{ action: "Position equity", equity: result.equity }]
            : result.decisionOptions) ||
          result.outcomes.map((equity, i) => ({
            equity,
            action: ["No double", "Double / take", "Double / pass"][i],
          }))
        ).map(({ equity: n, action }, i) =>
          el(
            "div",
            { class: "list-row row spread" },
            el(
              "span",
              {},
              {
                roll: "No double",
                double: "Double · best reply",
                take: "Take",
                pass: "Pass",
                beaver: "Beaver · best reply",
                raccoon: "Raccoon · best reply",
              }[action] || action,
            ),
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
        if (result.method === "rollout")
          b.append(
            el(
              "span",
              { class: "small" },
              `95% sampling interval: ${equity(c.equity - 1.96 * c.standardError)} to ${equity(c.equity + 1.96 * c.standardError)} equity`,
            ),
          );
        if (source) {
          const f = moveFeatures(source, c.steps);
          b.append(
            el(
              "span",
              { class: "muted small move-observations" },
              `${f.blots} exposed blot${f.blots === 1 ? "" : "s"} · ${f.madePoints} made points · ${f.hit} hit · ${f.borneOff} off · ${f.pips} pips`,
            ),
          );
        }
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
    if (source)
      node.append(
        el(
          "p",
          { class: "muted small" },
          "Board features describe the resulting position; they do not prove why the engine prefers a move.",
        ),
      );
    if (result.candidates.length) {
      const best = result.candidates[0];
      node.append(
        probabilityView(best, result.perspective),
        el(
          "div",
          { class: "metrics" },
          el(
            "div",
            {},
            result.settings.cubeful ? "Cubeful equity" : "Equity · cube off",
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
  if (result.method === "rollout" && result.type === "cube")
    node.append(
      el(
        "p",
        { class: "small" },
        `Approximate 95% equity margins: no double ±${(1.96 * result.outcomeSE[0]).toFixed(3)}, double/take ±${(1.96 * result.outcomeSE[1]).toFixed(3)}. Passing is a fixed payoff.`,
      ),
    );
  node.append(
    el(
      "p",
      { class: "muted small" },
      `${result.settings.name} · ${result.settings.plies} ply · ${(result.elapsedMs / 1000).toFixed(2)} s${result.cached ? " · cached" : ""}. ${result.units === "current-cube-points" ? "Equity is in current-cube points." : "Main value is match-winning chance; Δ is normalized match equity."} Values use ${playerName(result.perspective)}’s player-on-roll perspective. Cubeless equity and engine metadata are included in saved results.`,
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
        clearInterval(this.elapsedTimer);
        if (type === "busy") {
          const started = performance.now();
          this.elapsedTimer = setInterval(() => {
            if (!this.status.textContent.includes("trials per alternative"))
              this.status.textContent = `${text} · ${Math.floor((performance.now() - started) / 1000)} s elapsed`;
          }, 1000);
        }
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
