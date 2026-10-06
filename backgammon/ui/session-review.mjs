// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button, dialog, select, field } from "./shell.mjs";
import {
  decisionHistory,
  decisionTotals,
  compactEvaluation,
  gradeDecision,
} from "../core/decision-history.mjs";
import { clone } from "../core/rules.mjs";
import { PRESETS } from "../engine/metadata.mjs";
import { EngineClient } from "../engine/client.mjs";
import { decisionReview } from "./decision-review.mjs";
export function sessionReview(
  model,
  { onSave = async () => {}, allowAnalysis = true, gameNumber = null } = {},
) {
  const snapshot = clone(model),
    names = model.names || ["Ivory", "Teal"];
  const engine = new EngineClient(),
    body = el("div", { class: "session-review" }),
    status = el("p", { role: "status", class: "muted" });
  let preset = PRESETS[model.config?.reviewStrength]
    ? model.config.reviewStrength
    : "deep";
  let rows = decisionHistory(snapshot),
    busy = false,
    closed = false,
    generation = 0;
  const d = dialog("Session review", body);
  d.classList.add("session-dialog");
  d.addEventListener(
    "close",
    () => {
      closed = true;
      generation++;
      engine.destroy();
    },
    { once: true },
  );
  function render() {
    const shown = rows.filter(
      (r) => gameNumber === null || r.game === gameNumber,
    );
    const games = [...new Set(rows.map((r) => r.game))];
    const totals = el(
      "div",
      { class: "session-totals" },
      ...[0, 1].map((p) => {
        const t = decisionTotals(shown, p);
        return el(
          "div",
          {},
          el("strong", {}, names[p]),
          el(
            "p",
            {},
            `${t.evaluated ? t.loss.toFixed(3) : "—"} ${t.money ? "EV points lost" : "normalized equity lost"}`,
          ),
          el(
            "span",
            { class: "muted small" },
            `${t.evaluated} evaluated · ${t.pending} unreviewed · ${t.forced} forced`,
          ),
        );
      }),
    );
    const actions = el(
      "div",
      { class: "row wrap" },
      field(
        "Game",
        select(
          [["all", "All games"], ...games.map((n) => [String(n), `Game ${n}`])],
          gameNumber === null ? "all" : String(gameNumber),
          (v) => {
            gameNumber = v === "all" ? null : Number(v);
            render();
          },
        ),
      ),
      field(
        "Review strength",
        select(
          Object.entries(PRESETS).map(([k, p]) => [
            k,
            `${p.name} · ${p.plies} ply`,
          ]),
          preset,
          (v) => {
            if (!busy) preset = v;
          },
        ),
      ),
      button(
        busy ? "Cancel analysis" : "Analyze unreviewed decisions",
        () => {
          if (busy) {
            generation++;
            engine.cancel();
          } else run();
        },
        "primary",
        {
          id: "analyze-session",
          disabled:
            !allowAnalysis ||
            (!busy && !shown.some((r) => r.status === "pending")),
        },
      ),
    );
    body.replaceChildren(
      actions,
      totals,
      status,
      el(
        "p",
        { class: "muted small" },
        "Totals include evaluated decisions only, separately for each player. Money losses use each decision’s original cube, in session points. Match totals are normalized equity loss, not PR. Mixed strengths are labeled per decision.",
      ),
      el(
        "div",
        { class: "session-decisions", role: "list" },
        ...shown.map((r) => {
          const row = el(
            "div",
            { class: "session-decision", role: "listitem" },
            el(
              "span",
              {},
              `Game ${r.game} · ${r.index + 1} · ${names[r.player]} · ${r.label}`,
            ),
          );
          if (r.feedback)
            row.append(
              button(
                `${r.feedback.label} ${r.feedback.value} · ${r.result.settings.name}`,
                () =>
                  decisionReview(r.source, {
                    title: "Decision review",
                  }).result(r.result),
                "history-evaluation",
                { "data-loss-tone": r.feedback.tone },
              ),
            );
          else
            row.append(
              el(
                "span",
                { class: "muted small" },
                r.forced ? "Forced · no choice" : "Not analyzed",
              ),
            );
          return row;
        }),
      ),
    );
  }
  async function run() {
    if (busy) return;
    busy = true;
    const token = ++generation;
    render();
    const jobs = rows.filter(
      (r) =>
        (gameNumber === null || r.game === gameNumber) &&
        r.status === "pending",
    );
    try {
      for (let i = 0; i < jobs.length; i++) {
        if (closed || token !== generation)
          throw new DOMException("Cancelled", "AbortError");
        const row = jobs[i];
        status.textContent = `Analyzing ${i + 1} of ${jobs.length} decisions · ${PRESETS[preset].name}`;
        let result = await engine.analyze(row.source, {
          preset,
          submitted: row.action.type === "move" ? row.action.steps : null,
          priority: 0,
        });
        if (closed || token !== generation)
          throw new DOMException("Cancelled", "AbortError");
        result = gradeDecision(row.source, result, row.action);
        snapshot.events[row.index].evaluation = compactEvaluation(
          row.source,
          result,
        );
        await onSave(snapshot, row.index);
        rows = decisionHistory(snapshot);
        render();
        status.textContent = `Completed ${i + 1} of ${jobs.length} decisions`;
      }
    } catch (error) {
      status.textContent =
        error.name === "AbortError"
          ? "Analysis stopped. Completed decisions are saved."
          : error.message;
    } finally {
      busy = false;
      if (!closed) render();
    }
  }
  render();
  return d;
}
