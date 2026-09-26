import { CATEGORIES, COLORS, wilson } from "./engine.mjs";
export const pct = (p, digits = 1) => {
  if (p == null || !Number.isFinite(p)) return "—";
  const unit = 10 ** -digits;
  if (p > 0 && 100 * p < unit / 2) return `<${unit.toFixed(digits)}%`;
  return `${(100 * p).toFixed(digits)}%`;
};
export const num = (n, digits = 2) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
export const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const emptyChart = () =>
  '<div class="empty-chart">No hands match these filters.</div>';
export const legend = () =>
  CATEGORIES.map(
    (c, i) =>
      `<span><i class="swatch" style="background:${COLORS[i]}"></i>${c}</span>`,
  ).join("");
export function histogram(
  stat,
  { small = false, stacked = false, compact = false, width, height } = {},
) {
  if (!stat) return emptyChart();
  const w = width ?? (small ? 280 : 650),
    h = height ?? (small ? 140 : 215);
  const left = compact ? 40 : small ? 28 : 38,
    right = 12,
    top = 20,
    bottom = compact ? 42 : 30,
    pw = w - left - right,
    ph = h - top - bottom;
  const ymax = Math.max(0.05, Math.ceil(Math.max(...stat.hist) * 20) / 20),
    step = pw / 13;
  let marks = "";
  for (let j = 0; j <= (small ? 2 : 4); j++) {
    const p = (ymax * j) / (small ? 2 : 4),
      y = top + ph - (p / ymax) * ph;
    marks += `<line class="grid-line" x1="${left}" x2="${w - right}" y1="${y}" y2="${y}"/><text x="${left - 6}" y="${y + 3}" text-anchor="end">${Math.round(p * 100)}%</text>`;
  }
  stat.hist.forEach((p, i) => {
    const x = left + i * step + 3,
      bw = step - 6,
      y = top + ph - (p / ymax) * ph;
    const title = `Draw ${i + 1}: ${pct(p, 4)} bust; ${pct(stat.survival[i + 1], 4)} survive through this draw`;
    if (stacked) {
      let base = top + ph;
      for (let c = 0; c < 6; c++) {
        const value = stat.joint[i * 6 + c],
          barh = (value / ymax) * ph;
        marks += `<rect x="${x}" y="${base - barh}" width="${bw}" height="${barh}" fill="${COLORS[c]}"><title>${title}\n${CATEGORIES[c]}: ${pct(value, 4)} of all runouts</title></rect>`;
        base -= barh;
      }
    } else {
      marks += `<rect x="${x}" y="${y}" width="${bw}" height="${(p / ymax) * ph}" rx="2" fill="${i + 1 === stat.mode ? "#70e0bb" : "#3a9b7d"}"><title>${title}</title></rect>`;
    }
    if (!small && !compact && p >= 0.012)
      marks += `<text class="value-label" x="${x + bw / 2}" y="${y - 6}" text-anchor="middle">${pct(p, 1)}</text>`;
    if (!small || i % 2 === 0)
      marks += `<text x="${x + bw / 2}" y="${h - bottom + 15}" text-anchor="middle">${i + 1}</text>`;
  });
  if (!small)
    marks += `<text class="axis-label" x="${w / 2}" y="${h - 3}" text-anchor="middle">${compact ? "Draws, including the bust card" : "Additional cards drawn, including bust card"}</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Bust distribution across 13 draws. Mean ${num(stat.mean)} draws.">${marks}</svg>`;
}
export function lineChart(
  series,
  {
    start = 0,
    xLabel = "Completed safe draws",
    width = 650,
    height = 255,
    compact = false,
  } = {},
) {
  if (!series.length || !series[0].values.length) return emptyChart();
  const left = compact ? 44 : 39,
    right = 16,
    top = 18,
    bottom = compact ? 42 : 36,
    pw = width - left - right,
    ph = height - top - bottom;
  const n = series[0].values.length,
    x = (i) => left + (i / (n - 1)) * pw,
    y = (p) => top + ph * (1 - p);
  let marks = "";
  for (let k = 0; k <= 4; k++) {
    const p = k / 4;
    marks += `<line class="grid-line" x1="${left}" x2="${width - right}" y1="${y(p)}" y2="${y(p)}"/><text x="${left - 7}" y="${y(p) + 3}" text-anchor="end">${p * 100}%</text>`;
  }
  for (let i = 0; i < n; i++)
    marks += `<text x="${x(i)}" y="${height - bottom + 16}" text-anchor="middle">${i + start}</text>`;
  series.forEach((s) => {
    let path = "",
      pen = false;
    s.values.forEach((p, i) => {
      if (p == null) {
        pen = false;
        return;
      }
      path += `${pen ? "L" : "M"}${x(i)},${y(p)} `;
      pen = true;
    });
    if (series.length === 1 && s.values.every((p) => p != null))
      marks += `<path d="${path} L${x(n - 1)},${y(0)} L${x(0)},${y(0)}Z" fill="${s.color}" opacity=".08"/>`;
    marks += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.3" ${s.dashed ? 'stroke-dasharray="5 4"' : ""}/>`;
    s.values.forEach((p, i) => {
      if (p != null)
        marks += `<circle cx="${x(i)}" cy="${y(p)}" r="3.2" fill="${s.color}"><title>${esc(s.label)} · ${i + start}: ${pct(p, 4)}</title></circle>`;
    });
  });
  marks += `<text class="axis-label" x="${width / 2}" y="${height - 3}" text-anchor="middle">${esc(xLabel)}</text>`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(series.map((s) => s.label).join(", "))}">${marks}</svg>`;
}
export function outcomes(stat, confidence = false) {
  if (!stat) return emptyChart();
  return stat.categories
    .map((p, i) => {
      const interval = confidence ? wilson(p, stat.trials) : null;
      const title = interval
        ? `95% Wilson interval: ${pct(interval[0], 4)} – ${pct(interval[1], 4)}.${p === 0 ? " No occurrences observed; probability is not proven zero." : ""}`
        : `${CATEGORIES[i]}: ${pct(p, 5)}`;
      return `<div class="outcome-row" title="${title}"><span class="outcome-label"><i class="swatch" style="background:${COLORS[i]}"></i>${CATEGORIES[i]}</span><span class="bar-track"><i class="bar-fill" style="width:${p * 100}%;background:${COLORS[i]}"></i></span><span class="outcome-number">${pct(p, p < 0.01 ? 3 : 1)}</span></div>`;
    })
    .join("");
}
