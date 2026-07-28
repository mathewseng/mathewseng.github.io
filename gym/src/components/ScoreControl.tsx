import { clsx } from "clsx";

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
  return (
    <fieldset className={clsx("min-w-0", compact ? "" : "surface p-4")}>
      <legend className="flex w-full items-center justify-between gap-3">
        <span className="text-sm font-extrabold">{label}</span>
        <span className="flex items-center gap-2">
          {onClear && value !== undefined ? (
            <button
              type="button"
              className="text-[0.64rem] font-extrabold text-[var(--muted)] hover:text-[var(--ink)]"
              onClick={onClear}
            >
              Clear
            </button>
          ) : null}
          <span
            className={clsx(
              "grid h-8 min-w-8 place-items-center rounded-xl px-2 text-sm font-black",
              value === undefined
                ? "bg-[var(--surface-soft)] text-[var(--faint)]"
                : direction === "positive"
                  ? "bg-[var(--acid-soft)] text-[var(--ink)]"
                  : value >= 4
                    ? "bg-red-500/15 text-[var(--danger)]"
                    : "bg-[var(--surface-soft)]",
            )}
          >
            {value ?? "—"}
          </span>
        </span>
      </legend>
      <div
        className={clsx(
          "mt-3 grid grid-cols-7 gap-1",
          compact ? "sm:gap-1.5" : "sm:gap-2",
        )}
        role="radiogroup"
        aria-label={`${label}, ${value === undefined ? "not recorded" : `${value} out of 6`}`}
      >
        {scores.map((score) => (
          <button
            key={score}
            id={score === value ? id : undefined}
            type="button"
            role="radio"
            aria-checked={score === value}
            onClick={() => onChange(score)}
            className={clsx(
              "grid min-h-10 place-items-center rounded-xl border text-xs font-black transition-colors",
              score === value
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]",
            )}
          >
            {score}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-4 text-[0.65rem] font-semibold text-[var(--faint)]">
        <span>0 · {lowLabel}</span>
        <span className="text-right">6 · {highLabel}</span>
      </div>
    </fieldset>
  );
}
