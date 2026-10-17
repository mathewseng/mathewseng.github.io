import { clsx } from "clsx";
import type { KeyboardEvent } from "react";

import type { Scale0To6 } from "../lib/types";

const scores: Scale0To6[] = [0, 1, 2, 3, 4, 5, 6];

export function ScoreControl({
  id,
  label,
  value,
  onChange,
  onClear,
  lowLabel,
  highLabel,
  direction = "positive",
  compact = false,
}: {
  id: string;
  label: string;
  value: Scale0To6 | undefined;
  onChange: (value: Scale0To6) => void;
  onClear?: () => void;
  lowLabel: string;
  highLabel: string;
  direction?: "positive" | "negative";
  compact?: boolean;
}) {
  function handleScoreKey(event: KeyboardEvent<HTMLButtonElement>, score: Scale0To6) {
    let next: Scale0To6 | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = Math.min(6, score + 1) as Scale0To6;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = Math.max(0, score - 1) as Scale0To6;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = 6;
    }
    if (next === undefined) return;
    event.preventDefault();
    const group = event.currentTarget.parentElement;
    onChange(next);
    window.requestAnimationFrame(() => {
      group?.querySelector<HTMLButtonElement>(`[data-score="${next}"]`)?.focus();
    });
  }

  return (
    <fieldset id={id} className={clsx("min-w-0", compact ? "" : "surface p-4")}>
      {/* The legend holds only text; the Clear control sits beside the group below. */}
      <legend className="flex w-full items-center justify-between gap-3">
        <span className="text-sm font-bold">{label}</span>
        <span
          className={clsx(
            "grid h-8 min-w-8 place-items-center rounded-sm px-2 text-sm font-extrabold",
            value === undefined
              ? "bg-[var(--surface-3)] text-[var(--muted)]"
              : direction === "positive"
                ? "bg-[var(--accent-soft)] text-[var(--ink)]"
                : value >= 4
                  ? "bg-[var(--bad-soft)] text-[var(--bad)]"
                  : "bg-[var(--surface-3)]",
          )}
        >
          {value ?? "—"}
        </span>
      </legend>
      <div
        className={clsx(
          "mt-3 grid grid-cols-4 gap-1.5 min-[420px]:grid-cols-7",
          compact ? "sm:gap-1.5" : "sm:gap-2",
        )}
        role="radiogroup"
        aria-label={`${label}, ${value === undefined ? "not recorded" : `${value} out of 6`}`}
      >
        {scores.map((score) => (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={score === value}
            onClick={() => onChange(score)}
            onKeyDown={(event) => handleScoreKey(event, score)}
            tabIndex={score === value || (value === undefined && score === 0) ? 0 : -1}
            data-score={score}
            className={clsx(
              "grid min-h-11 place-items-center rounded-sm border text-xs font-bold transition-colors",
              score === value
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]"
                : "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[var(--control-border)] hover:text-[var(--ink)]",
            )}
          >
            {score}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-4 text-xs font-semibold text-[var(--muted)]">
        <span>0 · {lowLabel}</span>
        {onClear && value !== undefined ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClear}>
            Clear
          </button>
        ) : null}
        <span className="text-right">6 · {highLabel}</span>
      </div>
    </fieldset>
  );
}
