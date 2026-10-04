// SPDX-License-Identifier: GPL-3.0-or-later
import { playerName, distance } from "../core/rules.mjs";
const NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
export function pointGeometry(point, orientation = 0) {
  const p = orientation ? 23 - point : point,
    top = p >= 12,
    col = top ? p - 12 : 11 - p;
  return { x: 24 + col * 60 + (col >= 6 ? 48 : 0), y: top ? 34 : 328, top };
}
export class Board {
  constructor(container, onPoint = () => {}) {
    this.container = container;
    this.onPoint = onPoint;
    this.svg = svg("svg", {
      viewBox: "0 0 876 600",
      class: "bg-board",
      role: "group",
      "aria-label": "Backgammon board",
    });
    container.replaceChildren(this.svg);
    this.svg.addEventListener("click", (e) => {
      const p = e.target.closest("[data-point]");
      if (p) this.onPoint(this.decode(p.dataset.point));
    });
    this.svg.addEventListener("keydown", (e) => {
      const point = e.target.closest("[data-point]");
      if (!point) return;
      if (["Enter", " "].includes(e.key)) {
        e.preventDefault();
        this.onPoint(this.decode(point.dataset.point));
      } else if (
        ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const all = [...this.svg.querySelectorAll("[data-point]")],
          i = all.indexOf(point);
        all[
          (i +
            (["ArrowRight", "ArrowDown"].includes(e.key)
              ? 1
              : all.length - 1)) %
            all.length
        ].focus();
      }
    });
  }
  decode(p) {
    return /^\d+$/.test(p) ? Number(p) : p;
  }
  render(
    s,
    {
      orientation = 0,
      numbers = true,
      selected = null,
      destinations = [],
      interactive = true,
      preview = false,
      editor = false,
    } = {},
  ) {
    const compact = this.container.clientWidth < 600;
    const focus = this.svg.contains(document.activeElement)
      ? document.activeElement.dataset.point
      : null;
    const children = [
      svg("rect", {
        x: 1,
        y: 1,
        width: 874,
        height: 598,
        rx: 15,
        fill: "#202b30",
        stroke: "#435158",
        "stroke-width": 2,
      }),
      svg("rect", {
        x: 18,
        y: 28,
        width: 780,
        height: 544,
        rx: 5,
        fill: "#172126",
      }),
      svg("path", { d: "M408 28V572", stroke: "#38474c", "stroke-width": 40 }),
      svg("path", { d: "M813 28V572", stroke: "#435158" }),
    ];
    const checker = (x, y, p, count) => {
      const g = svg("g", { "aria-hidden": "true" });
      g.append(
        svg("circle", {
          cx: x,
          cy: y,
          r: 24,
          fill: p === 0 ? "#f0eadb" : "#72b8ad",
          stroke: p === 0 ? "#b5ac97" : "#234d49",
          "stroke-width": 2,
        }),
      );
      g.append(
        svg("circle", {
          cx: x,
          cy: y,
          r: 18,
          fill: "none",
          stroke: p === 0 ? "#cec4ae" : "#52978c",
          "stroke-width": 1.5,
        }),
      );
      if (count > 1)
        g.append(
          svg(
            "text",
            {
              x,
              y: y + 7,
              "text-anchor": "middle",
              fill: "#18272a",
              "font-size": compact ? 30 : 22,
              "font-weight": 700,
            },
            count,
          ),
        );
      return g;
    };
    for (let p = 0; p < 24; p++) {
      const { x, y, top } = pointGeometry(p, orientation),
        v = s.points[p],
        n = Math.abs(v);
      const label = `Point ${distance(p, orientation)}, ${n ? `${n} ${playerName(v > 0 ? 0 : 1)} checkers` : "empty"}${destinations.includes(p) ? ", legal destination" : ""}`;
      const g = svg("g", {
        "data-point": p,
        role: "button",
        tabindex: interactive ? 0 : -1,
        "aria-label": label,
        "aria-disabled": !interactive,
        class: `point${selected === p ? " selected" : ""}${destinations.includes(p) ? " destination" : ""}`,
      });
      g.append(
        svg("rect", {
          x,
          y: top ? 28 : 306,
          width: 60,
          height: 266,
          fill: "transparent",
          class: "point-hit",
        }),
      );
      g.append(
        svg("path", {
          d: top
            ? `M${x + 3} 38 L${x + 57} 38 L${x + 30} 262 Z`
            : `M${x + 3} 562 L${x + 57} 562 L${x + 30} 338 Z`,
          fill: p % 2 ? "#536b70" : "#aa967c",
          "pointer-events": "none",
        }),
      );
      if (numbers)
        g.append(
          svg(
            "text",
            {
              x: x + 30,
              y: top ? 21 : 590,
              "text-anchor": "middle",
              fill: "#c8d4d5",
              "font-size": compact ? 28 : 16,
              "font-weight": 500,
              "pointer-events": "none",
            },
            distance(p, orientation),
          ),
        );
      for (let i = 0; i < Math.min(n, 5); i++)
        g.append(
          checker(
            x + 30,
            top ? 65 + i * 47 : 535 - i * 47,
            v > 0 ? 0 : 1,
            i === 4 && n > 5 ? n : 1,
          ),
        );
      if (destinations.includes(p))
        g.append(
          svg("circle", {
            cx: x + 30,
            cy: top ? 282 : 318,
            r: 8,
            fill: "#b6eee0",
            stroke: "#172126",
            "stroke-width": 2,
            "pointer-events": "none",
          }),
        );
      children.push(g);
    }
    for (const p of [0, 1]) {
      const top = p !== orientation,
        y = top ? 100 : 446;
      const g = svg("g", {
        "data-point": `bar${p}`,
        tabindex: interactive ? 0 : -1,
        role: "button",
        "aria-label": `${playerName(p)} bar, ${s.bar[p]} checkers`,
        class: `point${selected === "bar" && s.turn === p ? " selected" : ""}`,
      });
      g.append(
        svg("rect", {
          x: 385,
          y: top ? 32 : 327,
          width: 46,
          height: 245,
          rx: 4,
          fill: "transparent",
          class: "point-hit",
        }),
      );
      if (s.bar[p]) g.append(checker(408, y, p, s.bar[p]));
      else
        g.append(
          svg(
            "text",
            {
              x: 408,
              y: top ? 68 : 548,
              "text-anchor": "middle",
              fill: "#a2b7b9",
              "font-size": compact ? 19 : 13,
            },
            "BAR",
          ),
        );
      children.push(g);
      const off = svg("g", {
        "data-point": `off${p}`,
        tabindex: interactive ? 0 : -1,
        role: "button",
        "aria-label": `${playerName(p)} borne off, ${s.off[p]} checkers${destinations.includes("off") && s.turn === p ? ", legal destination" : ""}`,
        class: `point${destinations.includes("off") && s.turn === p ? " destination" : ""}`,
      });
      off.append(
        svg("rect", {
          x: 820,
          y: top ? 35 : 326,
          width: 46,
          height: 239,
          rx: 5,
          fill: "#28373b",
          class: "point-hit",
        }),
      );
      off.append(
        svg(
          "text",
          {
            x: 843,
            y: top ? 60 : 560,
            "text-anchor": "middle",
            fill: "#d6dfdb",
            "font-size": compact ? 22 : 14,
          },
          "OFF",
        ),
      );
      for (let i = 0; i < s.off[p]; i++)
        off.append(
          svg("rect", {
            x: 827,
            y: top ? 76 + i * 11 : 530 - i * 11,
            width: 32,
            height: 7,
            rx: 3,
            fill: p === 0 ? "#f0eadb" : "#72b8ad",
            "pointer-events": "none",
          }),
        );
      if (s.off[p])
        off.append(
          svg(
            "text",
            {
              x: 843,
              y: top ? 260 : 350,
              "text-anchor": "middle",
              fill: "#f0eadb",
              "font-size": 18,
            },
            s.off[p],
          ),
        );
      children.push(off);
    }
    const cy =
      s.cube.owner === null ? 300 : s.cube.owner === orientation ? 372 : 228;
    children.push(
      svg("rect", {
        x: 390,
        y: cy - 18,
        width: 36,
        height: 36,
        rx: 6,
        fill: "#f0eadb",
      }),
      svg(
        "text",
        {
          x: 408,
          y: cy + 7,
          "text-anchor": "middle",
          "font-size": 19,
          fill: "#172126",
          "font-weight": 700,
        },
        s.cube.value === 1 ? "64" : s.cube.value,
      ),
    );
    children.push(
      svg(
        "text",
        {
          x: 196,
          y: 307,
          "text-anchor": "middle",
          fill: "#b9c6c4",
          "font-size": 14,
          "letter-spacing": 2,
        },
        preview ? "MOVE PREVIEW" : editor ? "POSITION EDITOR" : "BACKGAMMON",
      ),
    );
    this.svg.replaceChildren(...children);
    this.svg.classList.toggle("is-preview", preview);
    if (focus)
      this.svg
        .querySelector(`[data-point="${focus}"]`)
        ?.focus({ preventScroll: true });
  }
}
