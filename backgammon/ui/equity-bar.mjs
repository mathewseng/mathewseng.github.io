// SPDX-License-Identifier: GPL-3.0-or-later
import { readSettings, saveSettings } from "../core/storage.mjs";
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
    this.hide = element("button", "equity-reading");
    this.hide.type = "button";
    this.hide.title = "Hide equity bar";
    this.hide.setAttribute("aria-label", this.hide.title);
    this.reveal = element("button", "equity-reveal");
    this.reveal.type = "button";
    this.reveal.title = "Show equity bar";
    this.reveal.setAttribute("aria-label", this.reveal.title);
    this.reveal.setAttribute("aria-controls", this.node.id);
    this.reveal.innerHTML = `<span class="equity-reveal-label" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span>Equity</span></span>`;
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
      this.stop();
      this.refresh();
    };
    this.hide.append(this.topLabel, this.meter, this.label);
    this.node.append(this.hide, this.retry);
    board.container.append(this.node, this.reveal);
    this.enabled = readSettings().equityBar === true;
    this.life = new AbortController();
    const options = { signal: this.life.signal };
    this.portrait = matchMedia("(max-width: 700px) and (orientation: portrait)");
    this.portrait.addEventListener("change", () => this.schedulePosition(), options);
    toggle.onclick = () => this.setEnabled(!this.enabled);
    this.hide.onclick = () => this.setEnabled(false);
    this.reveal.onclick = () => this.setEnabled(true);
    const changed = () => {
      this.enabled = readSettings().equityBar === true;
      this.refresh();
      this.schedulePosition();
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
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.refresh();
    }, options);
    this.observer = new ResizeObserver(() => this.schedulePosition());
    this.observer.observe(board.container);
    this.observer.observe(board.svg);
    addEventListener("resize", () => this.schedulePosition(), options);
    window.visualViewport?.addEventListener("resize", () => this.schedulePosition(), options);
    this.refresh();
  }
  set(context) {
    this.context = context;
    this.refresh();
  }
  setEnabled(enabled) {
    const railFocused = [this.hide, this.reveal].includes(document.activeElement);
    this.enabled = enabled;
    try {
      saveSettings({ equityBar: enabled });
    } catch {}
    this.refresh();
    // Keep keyboard navigation in place when its current control is hidden.
    if (railFocused) (enabled ? this.hide : this.reveal).focus({ preventScroll: true });
  }
  stop({release = true} = {}) {
    this.token++;
    clearTimeout(this.retryTimer);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cancelPreview?.();
    this.cancelPreview = null;
    this.observedEngine = null;
    if (release) this.engine.destroy();
    this.key = null;
    this.reading = null;
  }
  position() {
    const rail = this.enabled ? this.node : this.reveal;
    const r = this.board.svg.getBoundingClientRect(),
      c = this.board.container.getBoundingClientRect();
    const width = Math.min(r.width, (r.height * 876) / 660),
      height = (width * 660) / 876;
    const top = r.top - c.top + (this.board.svg.getAttribute('preserveAspectRatio')?.includes('YMin')
      ? 0 : (r.height - height) / 2);
    let geometry;
    if (this.portrait.matches) {
      geometry = {
        left: `${r.left - c.left + (r.width - width) / 2}px`,
        top: `${top + height + 4}px`,
        width: `${width}px`,
        height: "",
      };
    } else {
      rail.style.width = "";
      geometry = {
        width: "",
        left: `${r.left - c.left + (r.width - width) / 2 - rail.offsetWidth - 4}px`,
        top: `${top}px`,
        height: `${height}px`,
      };
    }
    // Both controls occupy the same reserved strip. Keep their geometry ready
    // so toggling visibility does not need another synchronous layout read.
    for (const node of [this.node, this.reveal]) Object.assign(node.style, geometry);
    this.positioned = true;
  }
  schedulePosition() {
    // Resize/settings changes invalidate geometry; equity and checker changes
    // do not. Avoid forcing the freshly rebuilt SVG to lay out on every tap.
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
    const orientation = readSettings().orientation === 1 ? 1 : 0;
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
      this.fill.style.setProperty("--equity-fraction", `${equityFraction(equity) * 100}%`);
      this.label.textContent = equity >= 0 ? equity.toFixed(3) : "";
      this.topLabel.textContent = equity < 0 ? (-equity).toFixed(3) : "";
      this.node.title = `${reading.choice}: ${playerName(orientation)} equity ${equity.toFixed(3)} ${reading.units} · ${reading.setting}. Nonlinear equity scale, not win probability.`;
    } else {
      this.label.textContent = status === "loading" ? "…" : "—";
      this.topLabel.textContent = "";
      this.node.title = reason;
    }
    this.node.setAttribute("aria-label", this.node.title);
  }
  refresh() {
    this.toggle.setAttribute("aria-pressed", String(this.enabled));
    this.node.hidden = !this.enabled;
    this.reveal.hidden = this.enabled;
    // Reserve the same strip for the reveal handle so taps never shift the board.
    this.board.container.classList.add("has-equity-bar");
    if (!this.positioned) this.schedulePosition();
    if (!this.enabled || document.hidden) {
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
      beforeDecision = false,
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
    // Display quality is independent of the configured playing/review depth.
    // Reuse the deepest available reading, including another preset or a book.
    const prepared = auto ? engine.peek(state, {preset:null, submitted}) : null;
    const ready = equityReading(state, result || prepared, {beforeDecision});
    if (ready && result) {
      if (this.key || this.engine.worker) this.stop();
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
    const key = positionKey(state) + JSON.stringify([submitted, beforeDecision]);
    if (this.key === key && this.observedEngine === engine) {
      if (ready || this.reading) this.paint("ready", ready || this.reading);
      return;
    }
    this.stop({release: engine !== this.engine});
    this.key = key;
    this.observedEngine = engine;
    const token = ++this.token;
    const current = () => token === this.token && this.key === key && this.enabled && !document.hidden;
    const position = engine.normalizedPosition(state);
    // Only retire work owned solely by this display. A real hint or bot caller
    // joining the same quick request makes it non-display work in EngineClient.
    this.cancelPreview = () => engine.cancelWhere(job => job.displayOnly && engine.normalizedPosition(job.state) === position);
    this.paint(ready ? 'ready' : 'loading', ready, 'Evaluating the current decision');
    const publish = result => {
      if (!current()) return;
      const reading = equityReading(state, result, {beforeDecision});
      if (reading) {
        clearTimeout(this.retryTimer);
        this.paint('ready', reading);
        this.cancelPreview?.();
      }
    };
    this.unsubscribe = engine.subscribeReading(state, publish, {submitted});
    const request = (attempt = 0) => {
      if (!current() || this.reading) return;
      engine.analyze(state, {preset:'quick', submitted, useBook:false, priority:0, displayOnly:true})
        .then(result => {
          if (!current()) return;
          // A deeper stage may have arrived while this quick job was queued.
          publish(engine.peek(state, {preset:null, submitted}) || result);
          if (!this.reading) throw new Error('No valid equity is available for this position.');
        })
        .catch(error => {
          if (!current() || this.reading) return;
          // Retry transient failures/cancellation, but never create an endless
          // worker/reload loop when assets are unavailable or a device is offline.
          if (attempt < 2) this.retryTimer = setTimeout(() => request(attempt + 1), attempt ? 1000 : 250);
          else this.paint('error', null, error.message);
        });
    };
    request();
  }
  destroy() {
    cancelAnimationFrame(this.positionFrame);
    this.stop();
    this.life.abort();
    this.observer.disconnect();
    this.node.remove();
    this.reveal.remove();
    this.board.container.classList.remove("has-equity-bar");
  }
}
