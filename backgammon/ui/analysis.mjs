// SPDX-License-Identifier: GPL-3.0-or-later
import { presentAnalysis, presentMove } from "../core/move-presentation.mjs";
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
  { onPreview = () => {}, limit = 5, source = null, previous = null, selected } = {},
) {
  const node = el("div", { class: "stack" });
  const insight = comparisonSummary(result, previous);
  if (insight && (insight.changed !== null || insight.close))
    node.append(
      el(
        "p",
        { class: "notice small", id: "analysis-comparison" },
        `${insight.changed === true ? "Best move changed since " + insight.previousName + ". " : insight.changed === false ? "Best move unchanged since " + insight.previousName + ". " : ""}${insight.close ? (result.method === "rollout" ? "Leaders overlap within sampling uncertainty." : "Close decision · under 0.020 equity apart.") : ""}`.trim(),
      ),
    );
  if (result.method === "reference")
    node.append(el("p", {class:"notice small"}, "Imported XG reference · ",
      el("a", {href:result.reference.url,target:"_blank",rel:"noopener"}, "Published source"),
      `. ${result.reference.rules}. ${result.reference.listed} source-listed alternatives; finite rollouts and XGRoller++ estimates. This is not a new engine evaluation.`));
  if (result.method === "rollout")
    node.append(
      el(
        "p",
        { class: "muted small" },
        `${result.settings.name} · ${result.settings.trials} trials per alternative · intervals measure sampling error only.`,
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
      result.candidates.slice(0, count).map((candidate, i) => {
        const c = source ? { ...candidate, ...presentMove(source, candidate.steps) } : candidate;
        // Rows show which evaluated move the board previews (-1: the source).
        const b = button("", () => onPreview(c), "list-row",
          Number.isInteger(selected) ? { "aria-pressed": String(i === selected) } : {});
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
        if (result.method === "reference")
          b.append(el("div", {class:"small"}, `By ${c.referenceCredit.author} · ${c.referenceCredit.date} · ${c.referenceMethod}${c.referenceTrials ? ` · ${c.referenceTrials.toLocaleString()} trials` : ''}${Number.isFinite(c.referenceHalfWidth) ? ` · published ±${c.referenceHalfWidth.toFixed(4)} equity` : ''}`));
        if (result.method === "rollout")
          b.append(
            el(
              "div",
              { class: "small" },
              `95% sampling interval: ${equity(c.equity - 1.96 * c.standardError)} to ${equity(c.equity + 1.96 * c.standardError)} equity`,
            ),
          );
        if (source) {
          const f = moveFeatures(source, c.steps);
          b.append(
            el(
              "div",
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
  if (result.screening || result.method === "rollout" || result.settings.pruning === false || result.settings.verification) {
    const details = el(
      "details",
      {},
      el("summary", {}, "Analysis method & limits"),
    );
    if (result.screening)
      details.append(
        el(
          "p",
          { class: "muted small" },
          `${result.screening.finalists} finalists from ${result.screening.total} alternatives screened at ${result.screening.plies} ply${result.screening.initial ? `, after a 0-ply screen retained ${result.screening.initial.finalists}` : ""}. A screened-out move can still be better; only finalists are compared above.`,
        ),
      );
    if (result.screening?.retainedLeader)
      details.append(el("p", { class: "muted small" },
        "Research keeps the 3-ply shortlist’s leader and evaluates it alongside every other finalist at 4 ply. Completed 3-ply work is reused for this check."));
    if (result.settings.pruning === false)
      details.append(el("p", { class: "muted small" },
        "Verify evaluates every displayed 4-ply checker finalist without GNUbg’s internal pruning network. The Research shortlist and its 3-ply leader check still use normal pruning. This slower diagnostic can change equities; it does not establish greater playing strength or agreement with XG."));
    if (result.settings.verification)
      details.append(el("p", { class: "muted small" },
        "Verify applies to checker decisions. This cube result uses Research’s normal 4-ply search with pruning enabled."));
    if (result.method === "rollout")
      details.append(
        el(
          "p",
          { class: "muted small" },
          `${result.settings.policy}. ${result.uncertainty}`,
        ),
      );
    node.append(details);
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
    ...(result.budget ? [el("p", { class: "muted small", id: "analysis-budget" },
      `Auto · ${result.settings.plies} ply completed · ${({searching:"searching deeper…","maximum-depth":"maximum depth reached","cube-depth-limit":"3-ply cube limit for responsive play","clear-lead":"clear, stable lead","predicted-cost":result.budget.maxNextStageMs ? "next depth estimated above 5 s" : "next depth unlikely to fit","time-budget":"~1 s search budget"})[result.budget.reason] || "complete"}.${result.budget.lead ? ` Top-two gap: ${result.budget.lead.gap < .001 ? "<0.001" : result.budget.lead.gap.toFixed(3)} equity.` : ""}${result.budget.forecast ? ` Next depth: ${"~"+Math.max(.1,result.budget.forecast.estimateMs/1000).toFixed(1)} s estimated from earlier depths; timing can vary.` : ""} ${result.budget.minimumPlies ? "Minimum 2 ply. " : ""}Engine loading is separate; deeper manual searches remain available.`)] : []),
    el(
      "p",
      { class: "muted small" },
      `${result.settings.name} · ${result.method === "reference" ? "published book 3.70 (2013)" : result.method === "rollout" ? `${result.settings.trials} trials` : `${result.settings.plies} ply`} · ${(result.elapsedMs / 1000).toFixed(2)} s${result.book ? ` · precomputed opening book${result.book.stage === "third-turn" ? " (turn 3)" : result.book.stage === "fourth-turn" ? " (turn 4)" : ""}` : result.cached ? " · cached" : ""}. ${result.units === "current-cube-points" ? "Equity is in current-cube points." : "Main value is match-winning chance; Δ is normalized match equity."} Values use ${playerName(result.perspective)}’s player-on-roll perspective. Cubeless equity and engine metadata are included in saved results.`,
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
    const raw = await this.engine.analyze(state, {
      preset: this.preset,
      ...options,
    });
    if (token !== this.token || key !== positionKey(state))
      throw new DOMException("Stale analysis.", "AbortError");
    const result = presentAnalysis(state, raw);
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
