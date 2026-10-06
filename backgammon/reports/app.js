// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button, select, field } from "../ui/shell.mjs";
import { PRESETS, ENGINE_VERSION } from "../engine/metadata.mjs";
import { startUpdates } from "../ui/updates.mjs";
import { EngineClient } from "../engine/client.mjs";
startUpdates();
const $ = (id) => document.getElementById(id);
const time = (n) =>
  n < 1000 ? `${n.toFixed(n < 10 ? 2 : 0)} ms` : `${(n / 1000).toFixed(2)} s`;
const label = (p) => PRESETS[p]?.name || `Rollout · ${p.slice(7)} trials`;
const link = (text, href) => el("a", { href }, text);
function table(headers, rows, caption) {
  return el(
    "div",
    { class: "report-table-wrap", tabindex: "0", "aria-label": caption },
    el(
      "table",
      { class: "report-table" },
      el("caption", {}, caption),
      el(
        "thead",
        {},
        el("tr", {}, ...headers.map((h) => el("th", { scope: "col" }, h))),
      ),
      el(
        "tbody",
        {},
        ...rows.map((row) =>
          el(
            "tr",
            {},
            ...row.map((cell, i) =>
              el(i ? "td" : "th", i ? {} : { scope: "row" }, cell),
            ),
          ),
        ),
      ),
    ),
  );
}
async function json(path) {
  const r = await fetch(path);
  if (!r.ok)
    throw new Error(
      `Report could not load (${r.status}). Reload or try online.`,
    );
  return r.json();
}
try {
  const speed = await json("../data/speed-report.json");
  $("release").textContent =
    `${speed.engine} · measured ${new Date(speed.recordedAt).toLocaleString()}`;
  let topic = "contact";
  const target = el("div", {});
  function draw() {
    const rows = speed.rows.filter((r) => r.topic === topic);
    target.replaceChildren(
      table(
        [
          "Setting",
          "Median compute",
          "Observed range",
          "First result incl. startup",
          "Cache hit",
        ],
        rows.map((r) => [
          label(r.preset),
          time(r.compute.median),
          `${time(r.compute.min)} – ${time(r.compute.max)}`,
          time(r.endToEnd.median),
          time(r.cacheHit.median),
        ]),
        `${topic} · ${rows[0]?.compute.n || 0} fresh-worker samples per setting; no p95 from this small sample.`,
      ),
    );
  }
  $("speed-content").append(
    field(
      "Position type",
      select(
        ["opening", "contact", "race", "bearoff", "cube"].map((t) => [
          t,
          t[0].toUpperCase() + t.slice(1),
        ]),
        topic,
        (v) => {
          topic = v;
          draw();
        },
      ),
    ),
    target,
    el(
      "p",
      { class: "muted" },
      `${speed.environment.cpu} · ${speed.environment.os} · ${speed.environment.browser}. ${speed.environment.condition}`,
    ),
    el(
      "p",
      {},
      `Engine download size: ${(speed.bytes / 1024 / 1024).toFixed(2)} MiB. Median local transfer ${time(speed.startup.transferMs.median)}, compilation ${time(speed.startup.compileMs.median)}, initialization ${time(speed.startup.initializeMs.median)}. Internet and real-phone speeds are unmeasured.`,
    ),
    link("Download all samples (JSON)", "../data/speed-report.json"),
  );
  draw();
  if (speed.auto) {
    const median = (xs) =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    $("speed-content").append(
      el("h3", {}, "Automatic refinement"),
      table(
        ["Position", "Quick first answer", "Deep final answer"],
        speed.auto.rows.map((r) => [
          r.topic,
          time(median(r.samples.map((s) => s.firstMs))),
          time(median(r.samples.map((s) => s.finalMs))),
        ]),
        speed.auto.method,
      ),
    );
  }
} catch (e) {
  $("speed-content").append(el("p", { class: "error" }, e.message));
}
try {
  const report = await json("../data/accuracy-report.json");
  $("accuracy-content").append(
    el("p", {}, report.description),
    el(
      "p",
      { class: "muted" },
      `Measured ${new Date(report.recordedAt).toLocaleString()} · ${report.engine}`,
    ),
    table(
      [
        "Position class / setting",
        "Covered choices",
        "Within 0.005 of reference best",
        "Mean reference loss",
      ],
      report.summary.flatMap((group) =>
        group.presets.map((r) => [
          `${group.topic} / ${label(r.preset)}`,
          `${r.covered}/${r.n}`,
          `${r.agreementWithin005}/${r.covered}`,
          r.meanReferenceLoss.toFixed(4),
        ]),
      ),
      "300 positions · Quick, Standard and Deep · cubeless equity units",
    ),
    el(
      "p",
      {},
      "The reference contains only selected alternatives. A current best move missing from that list is “uncovered,” not wrong or correct. The loss average excludes those decisions. These are historical GNUbg rollouts with sampling and policy error—not exact answers, an Elo rating, or proof of superiority over another engine.",
    ),
    el(
      "p",
      {},
      "Expert, Research and new rollouts have timing and integration checks below. This 300-position quality comparison measures 0–2 ply only; it does not establish that every deeper result is better.",
    ),
    link("Download per-position results", "../data/accuracy-report.json"),
    el("span", {}, " · "),
    link(
      "Download reference positions & provenance",
      "../data/accuracy-reference.json",
    ),
  );
  const native = await json("../data/native-validation.json");
  $("accuracy-content").append(
    el("h3", {}, "Independent desktop integration check"),
    el("p", {}, native.description),
    el(
      "p",
      {},
      `${native.cases.length} comparisons · maximum absolute difference ${native.maxDifference.toFixed(8)} · tolerance ${native.tolerance}. ${native.reference}`,
    ),
    link(
      "Download desktop comparison results",
      "../data/native-validation.json",
    ),
  );
} catch (e) {
  $("accuracy-content").append(el("p", { class: "error" }, e.message));
}
$("method-content").append(
  el(
    "dl",
    { class: "report-methods" },
    ...[
      [
        "Auto",
        "A completed Quick answer appears first; a completed Deep answer replaces it. The UI reports when the preferred move changes.",
      ],
      [
        "Quick / Standard / Deep",
        "0, 1 and 2 ply respectively. Every legal resulting checker position is scored at the same depth. Cube/match context is preserved.",
      ],
      [
        "Expert / Research",
        "3 and 4 ply. Start with all moves at 2 ply; keep at least the top two, up to eight within 0.080 for Expert or four within 0.040 for Research, plus the submitted move. Finalists are rescored at equal depth. A screened-out move can still be better. Cube decisions use the selected depth directly.",
      ],
      [
        "Rollouts",
        "Real GNUbg full-game simulations, with 0-ply checker and cube policy, variance reduction and seeded ISAAC dice. Up to four close 2-ply candidates, at least two, plus the submitted move. Ordinary doubling and match scores are supported; beavers/raccoons require tree analysis. No fixed-ply truncation; cubeless bearoff database termination is enabled.",
      ],
      [
        "Uncertainty",
        "95% intervals approximate sampling error only. They omit policy bias, model error and screening risk. Alternatives share dice; conservative gap checks add their standard errors rather than assuming independence. More samples do not fix a weak policy.",
      ],
      [
        "Recovery",
        "Each completed 32-trial batch is saved locally by Solver. Cancel terminates the worker. Resume regenerates a worker and continues from saved moments and the next seed. An unfinished batch is discarded. Mobile suspension can stop computation.",
      ],
      [
        "Reproducibility",
        "Raw samples, engine revision, reference source checksums and per-position results are downloadable. Scripts live under backgammon/scripts/. Benchmark datasets are separate from trainer lessons.",
      ],
    ].flatMap(([a, b]) => [el("dt", {}, a), el("dd", {}, b)]),
  ),
);
let devicePreset = "deep",
  deviceTopic = "contact",
  client = null;
const run = button("Run measurement", async () => {
  if (client) {
    client.destroy();
    client = null;
    run.textContent = "Run measurement";
    return;
  }
  const own = new EngineClient({
    onStatus: (_, text) => ($("device-status").textContent = text),
  });
  client = own;
  run.textContent = "Cancel";
  try {
    const fixture = (await json("../data/exercises.json")).items.find(
      (f) => f.topic === deviceTopic,
    );
    const options = devicePreset.startsWith("rollout")
      ? {
          rollout: { trials: Number(devicePreset.slice(7)), seed: 20261006 },
          onProgress: (cp) =>
            ($("device-status").textContent =
              `${cp.completed} completed trials per alternative`),
        }
      : { preset: devicePreset };
    const started = performance.now(),
      answer = await own.analyze(fixture.state, options);
    if (client !== own) return;
    $("device-result").replaceChildren(
      table(
        ["Setting / position", "Compute", "Including startup"],
        [
          [
            `${label(devicePreset)} / ${deviceTopic}`,
            time(answer.elapsedMs),
            time(performance.now() - started),
          ],
        ],
        `One on-device sample · ${new Date().toLocaleString()}`,
      ),
      el("p", { class: "muted" }, navigator.userAgent),
    );
  } catch (e) {
    if (e.name !== "AbortError") $("device-status").textContent = e.message;
  } finally {
    own.destroy();
    if (client === own) {
      client = null;
      run.textContent = "Run measurement";
    }
  }
});
$("device-controls").append(
  field(
    "Setting",
    select(
      [...Object.keys(PRESETS), "rollout64", "rollout256"].map((k) => [
        k,
        label(k),
      ]),
      devicePreset,
      (v) => (devicePreset = v),
    ),
  ),
  field(
    "Position",
    select(
      ["opening", "contact", "race", "bearoff", "cube"].map((t) => [t, t]),
      deviceTopic,
      (v) => (deviceTopic = v),
    ),
  ),
  run,
);
addEventListener("pagehide", () => client?.destroy());
