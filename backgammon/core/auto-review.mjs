// SPDX-License-Identifier: GPL-3.0-or-later
import { clone } from "./rules.mjs";
import { decisionHistory, compactEvaluation, gradeDecision, sameDecisionPrefix } from "./decision-history.mjs";
import { sameDecisionAction } from "./decision-attempt.mjs";

// Uses the table's existing worker at a lower priority than play and hints.
// One committed decision at a time; never grades a draft or changes game state.
export class AutoReview {
  constructor({ engine, model, idle, save, changed = () => {} }) {
    Object.assign(this, { engine, model, idle, save, changed });
    this.job = null;
    this.error = null;
    this.timer = null;
    this.gameId = null;
  }
  update() {
    clearTimeout(this.timer);
    const model = this.model();
    if (this.gameId !== model?.id) {
      this.gameId = model?.id;
      this.error = null;
    }
    if (!model?.started || model.config?.mode !== "computer" || this.job || this.error || !this.idle()) return;
    const rows = decisionHistory(model).reverse();
    const row = rows.find(r => !r.feedback) ||
      rows.find(r => r.initialAction && !r.initialFeedback && !r.forced);
    if (!row) return;
    const job = { snapshot: clone(model), row, initial: !!row.feedback };
    this.job = job;
    this.changed();
    this.run(job);
  }
  async run(job) {
    try {
      const { row, snapshot } = job;
      const action = job.initial ? row.initialAction : row.action;
      const result = await this.engine.analyze(row.source, {
        preset: snapshot.config.reviewStrength || "auto",
        submitted: action.type === "move" ? action.steps : null,
        priority: -10,
      });
      const current = this.model();
      if (current?.id !== snapshot.id || current.config?.mode !== "computer" ||
          !sameDecisionPrefix(current, snapshot, row.index)) return;
      // A foreground review may have finished while this job was in flight.
      const latest = decisionHistory(current).find(r => r.index === row.index);
      if (job.initial && sameDecisionAction(latest?.initialAction, action) && !latest.initialFeedback) {
        current.events[row.index].initialDecision.evaluation = compactEvaluation(row.source, gradeDecision(row.source, result, action));
        await this.save();
      } else if (!job.initial && !latest?.feedback) {
        current.events[row.index].evaluation = compactEvaluation(row.source, gradeDecision(row.source, result, action));
        await this.save();
      }
    } catch (error) {
      if (error.name !== "AbortError" && this.model()?.id === job.snapshot.id)
        this.error = error.message;
    } finally {
      this.job = null;
      this.changed();
      // Cancellation by a foreground request is normal. Retry once idle.
      this.timer = setTimeout(() => this.update(), 250);
    }
  }
  retry() {
    this.error = null;
    this.update();
  }
  pause() {
    clearTimeout(this.timer);
  }
}
