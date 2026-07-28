import type { LucideIcon } from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";

import { clsx } from "clsx";

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

export function Badge({
  children,
  tone = "neutral",
  className,
}: PropsWithChildren<{
  tone?: "neutral" | "accent" | "warm" | "danger" | "quality";
  className?: string;
}>) {
  const tones = {
    neutral: "border-[var(--line)] bg-[var(--surface-soft)] text-[var(--muted)]",
    accent: "border-transparent bg-[var(--acid-soft)] text-[var(--ink)]",
    warm: "border-transparent bg-orange-500/12 text-[var(--orange)]",
    danger: "border-transparent bg-red-500/12 text-[var(--danger)]",
    quality: "border-dashed border-[var(--line-strong)] text-[var(--muted)]",
  };

  return (
    <span
      className={clsx(
        "inline-flex min-h-6 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-extrabold tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

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
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="text-3xl font-black tracking-[-0.045em] sm:text-4xl">{title}</h1>
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
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
            style={{ background: accent ?? "var(--surface-soft)" }}
            aria-hidden="true"
          >
            <Icon size={15} strokeWidth={2.4} />
          </span>
        ) : null}
      </div>
      <p className="metric-value mt-5">{value}</p>
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
        <h2 className="text-lg font-black tracking-[-0.025em]">{title}</h2>
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
    <div className="grid min-h-52 place-items-center p-6 text-center">
      <div>
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[var(--surface-soft)] text-[var(--muted)]">
          <Icon size={20} />
        </span>
        <h3 className="mt-3 font-extrabold">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[var(--muted)]">
          {description}
        </p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
