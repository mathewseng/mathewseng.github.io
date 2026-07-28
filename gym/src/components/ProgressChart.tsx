import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Surface } from "./ui";

export interface ChartPoint {
  label: string;
  value?: number;
  secondary?: number;
  context?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  valueSuffix,
  secondaryLabel,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; dataKey?: string; payload?: ChartPoint }>;
  label?: string;
  valueSuffix: string;
  secondaryLabel?: string;
}) {
  if (!active || !payload?.length) return null;
  const primary = payload.find((item) => item.dataKey === "value");
  const secondary = payload.find((item) => item.dataKey === "secondary");
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-3 shadow-xl">
      <p className="text-xs font-extrabold">{label}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {primary?.value ?? "Unknown"} {primary?.value !== undefined ? valueSuffix : ""}
      </p>
      {secondary?.value !== undefined ? (
        <p className="text-xs text-[var(--muted)]">
          {secondaryLabel ?? "Secondary"}: {secondary.value}
        </p>
      ) : null}
      {primary?.payload?.context ? (
        <p className="mt-1 max-w-44 text-[0.66rem] text-[var(--orange)]">
          {primary.payload.context}
        </p>
      ) : null}
    </div>
  );
}

export default function ProgressChart({
  title,
  description,
  data,
  valueSuffix = "",
  secondaryLabel,
  variant = "line",
  height = 230,
}: {
  title: string;
  description?: string;
  data: ChartPoint[];
  valueSuffix?: string;
  secondaryLabel?: string;
  variant?: "line" | "area";
  height?: number;
}) {
  const gradientId = useId().replaceAll(":", "");
  const hasSecondary = data.some((point) => point.secondary !== undefined);
  const common = {
    data,
    margin: { top: 8, right: hasSecondary ? 0 : 8, bottom: 0, left: -18 },
  };

  return (
    <Surface className="min-w-0 overflow-hidden p-4 sm:p-5">
      <h3 className="text-sm font-extrabold">{title}</h3>
      {description ? (
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</p>
      ) : null}
      {hasSecondary ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-[var(--muted)]"
          aria-hidden="true"
        >
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            {valueSuffix || "Primary value"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-[var(--orange)]" />
            {secondaryLabel ?? "Secondary value"}
          </span>
        </div>
      ) : null}
      <div className="mt-4 w-full" style={{ height }} role="img" aria-label={title}>
        <ResponsiveContainer width="100%" height="100%">
          {variant === "area" ? (
            <AreaChart {...common}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--acid)" stopOpacity={0.48} />
                  <stop offset="100%" stopColor="var(--acid)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
              />
              <YAxis
                yAxisId="primary"
                axisLine={false}
                tickLine={false}
                width={46}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    valueSuffix={valueSuffix}
                    secondaryLabel={secondaryLabel}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                yAxisId="primary"
                stroke="var(--accent)"
                strokeWidth={2.4}
                fill={`url(#${gradientId})`}
                connectNulls={false}
                activeDot={{ r: 5, fill: "var(--accent)" }}
              />
            </AreaChart>
          ) : (
            <LineChart {...common}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
              />
              <YAxis
                yAxisId="primary"
                axisLine={false}
                tickLine={false}
                width={46}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
              />
              {hasSecondary ? (
                <YAxis
                  yAxisId="secondary"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  tick={{ fill: "var(--orange)", fontSize: 9 }}
                />
              ) : null}
              <Tooltip
                content={
                  <ChartTooltip
                    valueSuffix={valueSuffix}
                    secondaryLabel={secondaryLabel}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                yAxisId="primary"
                stroke="var(--accent)"
                strokeWidth={2.4}
                connectNulls={false}
                dot={{ r: 4, fill: "var(--surface-raised)", strokeWidth: 2 }}
                activeDot={{ r: 5, fill: "var(--accent)" }}
              />
              {hasSecondary ? (
                <Line
                  type="monotone"
                  dataKey="secondary"
                  yAxisId="secondary"
                  stroke="var(--orange)"
                  strokeWidth={1.8}
                  strokeDasharray="5 5"
                  connectNulls={false}
                  dot={{ r: 3, fill: "var(--surface-raised)", strokeWidth: 2 }}
                />
              ) : null}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Label</th>
            <th>Value</th>
            {secondaryLabel ? <th>{secondaryLabel}</th> : null}
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.label}>
              <td>{point.label}</td>
              <td>{point.value ?? "Unknown"}</td>
              {secondaryLabel ? <td>{point.secondary ?? "Unknown"}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </Surface>
  );
}
