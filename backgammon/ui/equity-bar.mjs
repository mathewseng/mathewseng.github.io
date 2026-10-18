// SPDX-License-Identifier: GPL-3.0-or-later
import { settings, saveSettings } from "../core/storage.mjs";
import { positionKey, playerName } from "../core/rules.mjs";
import { equityFraction, equityReading } from "../core/equity-bar.mjs";
import { EngineClient } from "../engine/client.mjs";
const element = (tag, cls) => {
  const node = document.createElement(tag);
  node.className = cls;
  return node;
};
export class EquityBar {
  constructor(board, toggle) {
    this.board = board;
    this.toggle = toggle;
    this.context = {};
    this.token = 0;
    this.engine = new EngineClient();
    this.node = element("div", "equity-bar");
    this.node.id = "equity-bar";
    this.node.setAttribute("role", "group");
    this.meter = element("span", "equity-meter");
    this.fill = element("span", "equity-fill");
    this.meter.append(this.fill);
    this.label = element("span", "equity-number equity-bottom-number");
    this.topLabel = element("span", "equity-number equity-top-number");
    // The group announces the complete reading, including its perspective.
    this.label.setAttribute("aria-hidden", "true");
    this.topLabel.setAttribute("aria-hidden", "true");
    this.retry = element("button", "equity-retry");
    this.retry.type = "button";
    this.retry.textContent = "Retry";
    this.retry.onclick = () => {
      this.key = null;
      this.refresh();
    };
    this.node.append(this.topLabel, this.meter, this.label, this.retry);
    board.container.append(this.node);
    this.enabled = settings().equityBar === true;
    this.life = new AbortController();
    const options = { signal: this.life.signal };
    toggle.onclick = () => {
      this.enabled = !this.enabled;
      try {
        saveSettings({ equityBar: this.enabled });
      } catch {}
      this.refresh();
    };
    const changed = () => {
      this.enabled = settings().equityBar === true;
      this.refresh();
    };
    addEventListener("bg-settings", changed, options);
    addEventListener("storage", changed, options);
    addEventListener(
      "pagehide",
      () => {
        this.stop();
        this.key = null;
      },
      options,
    );
    addEventListener("pageshow", () => this.refresh(), options);
    this.observer = new ResizeObserver(() => this.schedulePosition());
    this.observer.observe(board.container);
    this.refresh();
  }
  set(context) {
    this.context = context;
    this.refresh();
  }
  stop() {
    this.token++;
    this.engine.destroy();
    this.key = null;
    this.reading = null;
  }
  position() {
    if (!this.enabled) return;
    const r = this.board.svg.getBoundingClientRect(),
      c = this.board.container.getBoundingClientRect();
    const width = Math.min(r.width, (r.height * 876) / 660),
      height = (width * 660) / 876;
    Object.assign(this.node.style, {
      left: `${r.left - c.left + (r.width - width) / 2 - this.node.offsetWidth - 4}px`,
      top: `${r.top - c.top + (r.height - height) / 2}px`,
      height: `${height}px`,
    });
  }
  schedulePosition() {
    // State, actions, and history all update in the same task. Read geometry
    // once after those writes, not repeatedly in the middle of rebuilding DOM.
    if (this.positionFrame !== undefined) return;
    this.positionFrame = requestAnimationFrame(() => {
      this.positionFrame = undefined;
      this.position();
    });
  }
  paint(status, reading = null, reason = "") {
    this.reading = reading;
    this.node.dataset.state = status;
    this.retry.hidden = status !== "error";
    const orientation = settings().orientation === 1 ? 1 : 0;
    this.node.style.setProperty(
      "--equity-top",
      `var(--board-checker${1 - orientation})`,
    );
    this.node.style.setProperty(
      "--equity-bottom",
      `var(--board-checker${orientation})`,
    );
    if (reading) {
      const equity = orientation ? -reading.ivory : reading.ivory;
      this.fill.style.height = `${equityFraction(equity) * 100}%`;
      this.label.textContent = equity >= 0 ? equity.toFixed(3) : "";
      this.topLabel.textContent = equity < 0 ? (-equity).toFixed(3) : "";
      this.node.title = `${reading.choice}: ${playerName(orientation)} equity ${equity.toFixed(3)} ${reading.units} · ${reading.setting}. Nonlinear equity scale, not win probability.`;
    } else {
      this.label.textContent = status === "loading" ? "…" : "—";
      this.topLabel.textContent = "";
      this.node.title = reason;
    }
    this.node.setAttribute("aria-label", this.node.title);
    this.schedulePosition();
  }
  refresh() {
    this.toggle.setAttribute("aria-pressed", String(this.enabled));
    this.node.hidden = !this.enabled;
    this.board.container.classList.toggle("has-equity-bar", this.enabled);
    if (!this.enabled) {
      if (this.key || this.engine.worker) this.stop();
      return;
    }
    const {
      state,
      result,
      auto = false,
      blocked = "",
      submitted = null,
      engine = this.engine,
      preset = 'quick',
    } = this.context;
    if (
      blocked ||
      !state ||
      !["move", "roll", "double"].includes(state.phase)
    ) {
      if (this.key || this.engine.worker) this.stop();
      this.paint(
        "unavailable",
        null,
        blocked || "Equity is available during a checker or cube decision.",
      );
      return;
    }
    const prepared = auto ? engine.peek(state, {preset, submitted}) : null;
    const ready = equityReading(state, result || prepared);
    if (ready && (result || engine === this.engine)) {
      if (this.engine.active || this.engine.initializing) this.stop();
      this.paint("ready", ready);
      return;
    }
    if (!auto) {
      if (this.key || this.engine.worker) this.stop();
      this.paint(
        "unavailable",
        null,
        "Analyze or reveal this position to see equity.",
      );
      return;
    }
    const key = positionKey(state) + JSON.stringify([preset, submitted]);
    if (this.key === key) {
      this.schedulePosition();
      if (ready || this.reading) this.paint("ready", ready || this.reading);
      return;
    }
    if (this.engine.active || this.engine.initializing) this.stop();
    this.key = key;
    const token = ++this.token;
    this.paint(ready ? 'ready' : 'loading', ready, 'Evaluating the current decision');
    const publish = result => {
      if (token !== this.token || this.key !== key || !this.enabled) return;
      const reading = equityReading(state, result);
      if (reading) this.paint('ready', reading);
    };
    engine
      .analyze(state, { preset, submitted, priority: engine === this.engine ? 0 : submitted ? -4 : -5,
        onEvaluation: publish })
      .then((result) => {
        if (token !== this.token || this.key !== key || !this.enabled)
          return;
        const reading = equityReading(state, result);
        if (!reading)
          throw new Error(
            "No valid equity is available for this position.",
          );
        this.paint("ready", reading);
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          if (token === this.token) this.key = null;
          return;
        }
        if (token === this.token && this.enabled)
          this.paint("error", null, error.message);
      });
  }
  destroy() {
    cancelAnimationFrame(this.positionFrame);
    this.stop();
    this.life.abort();
    this.observer.disconnect();
    this.node.remove();
  }
}
