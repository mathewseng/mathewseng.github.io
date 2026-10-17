import type { LucideIcon } from "lucide-react";
import { AlertCircle, Check, Search, X } from "lucide-react";
import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { clsx } from "clsx";

import { Link } from "../router";

/* ---------- Surfaces ---------- */

type SurfaceProps = PropsWithChildren<{
  className?: string;
  raised?: boolean;
  as?: "div" | "section" | "article";
}>;

export function Surface({
  children,
  className,
  raised = false,
  as: Element = "div",
}: SurfaceProps) {
  return (
    <Element className={clsx(raised ? "surface-raised" : "surface", className)}>
      {children}
    </Element>
  );
}

/* ---------- Badge ---------- */

export type BadgeTone = "neutral" | "accent" | "good" | "warn" | "danger" | "quality";

export function Badge({
  children,
  tone = "neutral",
  className,
}: PropsWithChildren<{ tone?: BadgeTone; className?: string }>) {
  return (
    <span className={clsx("badge", tone !== "neutral" && `badge--${tone}`, className)}>
      {children}
    </span>
  );
}

/* ---------- Buttons ---------- */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonStyle {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  dashed?: boolean;
  className?: string;
}

export function buttonClass({
  variant = "secondary",
  size = "md",
  block = false,
  dashed = false,
  className,
}: ButtonStyle = {}): string {
  return clsx(
    "btn",
    variant !== "secondary" && `btn--${variant}`,
    size === "icon" ? "btn--icon btn--md" : `btn--${size}`,
    block && "btn--block",
    dashed && "btn--dashed",
    className,
  );
}

type ButtonProps = ButtonStyle &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">;

export function Button({
  variant,
  size,
  block,
  dashed,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block, dashed, className })}
      {...props}
    />
  );
}

export function ButtonLink({
  to,
  variant,
  size,
  block,
  dashed,
  className,
  children,
  ...props
}: ButtonStyle &
  PropsWithChildren<{
    to: string;
    "aria-label"?: string;
    onClick?: () => void;
  }>) {
  return (
    <Link
      to={to}
      className={buttonClass({ variant, size, block, dashed, className })}
      {...props}
    >
      {children}
    </Link>
  );
}

/* ---------- Chips and segmented control ---------- */

export function Chip({
  pressed,
  children,
  className,
  ...props
}: PropsWithChildren<
  { pressed: boolean; className?: string } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "children"
  >
>) {
  return (
    <button
      type="button"
      className={clsx("chip", className)}
      aria-pressed={pressed}
      {...props}
    >
      {pressed ? <Check size={13} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  block = false,
  className,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  block?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={clsx("segmented", block && "segmented--block", className)}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Toggle (role=switch in a 44px row) ---------- */

export function Toggle({
  checked,
  onChange,
  label,
  tone = "neutral",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  tone?: "neutral" | "danger" | "warn";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx("switch-row", tone !== "neutral" && `switch-row--${tone}`)}
    >
      {label}
      <span className="switch-track" aria-hidden="true" />
    </button>
  );
}

/* ---------- Progress bar ---------- */

export function ProgressBar({
  value,
  max,
  label,
  start,
  end,
  size = "md",
  color,
  className,
}: {
  value: number;
  max: number;
  label: string;
  start?: ReactNode;
  end?: ReactNode;
  size?: "md" | "lg";
  color?: string;
  className?: string;
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={clsx("progress", className)}>
      <div
        className={clsx("bar", size === "lg" && "bar--lg")}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        style={{ "--value": `${percent}%`, "--bar-color": color } as React.CSSProperties}
      />
      {start !== undefined || end !== undefined ? (
        <div className="progress-label" aria-hidden="true">
          <span>{start}</span>
          <span>{end}</span>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Search field ---------- */

export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  className,
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "className" | "placeholder" | "type"
>) {
  return (
    <label className={clsx("relative block min-w-0", className)}>
      <span className="sr-only">{label}</span>
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field pl-10 pr-12"
        placeholder={placeholder}
        {...props}
      />
      {value ? (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0.5 top-1/2 -translate-y-1/2"
          onClick={() => onChange("")}
          aria-label={`Clear ${label.toLowerCase()}`}
        >
          <X size={15} aria-hidden="true" />
        </Button>
      ) : null}
    </label>
  );
}

/* ---------- Page furniture ---------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? <p className="eyebrow-accent mb-2">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full shrink-0 flex-col gap-2 min-[360px]:w-auto min-[360px]:flex-row min-[360px]:flex-wrap [&>*]:w-full min-[360px]:[&>*]:w-auto">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: LucideIcon;
  accent?: string;
}) {
  return (
    <Surface className="min-w-0 overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{label}</p>
        {Icon ? (
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-sm"
            style={{ background: accent ?? "var(--surface-3)" }}
            aria-hidden="true"
          >
            <Icon size={15} strokeWidth={2.4} />
          </span>
        ) : null}
      </div>
      <p className="metric-value mt-4">{value}</p>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{detail}</p>
      ) : null}
    </Surface>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold tracking-[-0.02em]">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span
        className="grid h-11 w-11 place-items-center rounded-md bg-[var(--surface-3)] text-[var(--muted)]"
        aria-hidden="true"
      >
        <Icon size={20} />
      </span>
      <h3 className="mt-2 text-sm font-bold text-[var(--ink)]">{title}</h3>
      <p className="mx-auto max-w-sm text-sm leading-6">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/* ---------- Form errors ---------- */

/** A stable DOM id for a validation path such as `exercises[0].sets[1].reps`. */
export function fieldDomId(formId: string, path: string): string {
  return `${formId}-${path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/-$/, "")}`;
}

export function groupIssuesByPath(
  issues: ReadonlyArray<{ path: string; message: string }>,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const issue of issues) {
    grouped.set(issue.path, [...(grouped.get(issue.path) ?? []), issue.message]);
  }
  return grouped;
}

/**
 * The id, aria-invalid and aria-describedby a control needs for its errors,
 * plus the messages to render with FieldError.
 */
export function fieldA11y(formId: string, errors: Map<string, string[]>, path: string) {
  const id = fieldDomId(formId, path);
  const messages = errors.get(path) ?? [];
  return {
    errorId: `${id}-error`,
    messages,
    props: {
      id,
      "aria-invalid": messages.length ? (true as const) : undefined,
      "aria-describedby": messages.length ? `${id}-error` : undefined,
    },
  };
}

export function FieldError({ id, messages }: { id: string; messages: string[] }) {
  if (!messages.length) return null;
  return (
    <p id={id} className="field-error">
      <AlertCircle size={13} aria-hidden="true" />
      <span>{messages.join(" ")}</span>
    </p>
  );
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Focuses the control for a validation path, or its nearest enclosing group. */
export function focusIssue(formId: string, path: string) {
  let candidate = path;
  while (candidate) {
    const element = document.getElementById(fieldDomId(formId, candidate));
    if (element) {
      element.focus({ preventScroll: true });
      element.scrollIntoView({
        block: "center",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      return;
    }
    const next = candidate.replace(/(\.[^.[\]]+|\[\d+\])$/, "");
    if (next === candidate) return;
    candidate = next;
  }
}

/* ---------- Mobile action bar ---------- */

/**
 * A fixed bar above the tab bar holding the view's primary action on phones
 * and tablets. Its height is published as --action-bar-h so the toast stack,
 * the scroll padding and the in-flow spacer keep content clear of it.
 */
export function ActionBar({
  children,
  className,
  label,
}: PropsWithChildren<{ className?: string; label: string }>) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const topbar = document.querySelector<HTMLElement>(".topbar");
    const write = () => {
      // A landscape phone docks the bar as a right-side column (CSS) under the
      // sticky topbar; then its width, not its height, is what the content
      // must make room for.
      const column = getComputedStyle(bar).flexDirection === "column";
      if (topbar) root.style.setProperty("--topbar-h", `${topbar.offsetHeight}px`);
      root.style.setProperty("--action-bar-h", column ? "0px" : `${bar.offsetHeight}px`);
      root.style.setProperty("--action-bar-w", column ? `${bar.offsetWidth}px` : "0px");
    };
    write();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(write) : null;
    observer?.observe(bar);
    if (topbar) observer?.observe(topbar);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--action-bar-h");
      root.style.removeProperty("--action-bar-w");
      root.style.removeProperty("--topbar-h");
    };
  }, []);

  // The bar is portalled to <body> so no transformed ancestor (the view's
  // entrance transition) can become its containing block.
  return (
    <>
      <div className={clsx("action-bar-spacer", className)} aria-hidden="true" />
      {createPortal(
        <div
          ref={barRef}
          className={clsx("action-bar", className)}
          role="region"
          aria-label={label}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
