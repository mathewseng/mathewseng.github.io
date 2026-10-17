import {
  Apple,
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  CircleAlert,
  Clock3,
  Dumbbell,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { clsx } from "clsx";

import type { NutritionEntry, Workout } from "../lib/types";
import { formatWorkoutDuration, formatWorkoutStartTime } from "../lib/workoutTime";

import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Surface,
  prefersReducedMotion,
} from "./ui";

const weekdayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const workoutTypeLegend = [
  "push",
  "pull",
  "legs",
  "full-body",
  "upper",
  "other",
] as const;
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const detailFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

function localIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12);
}

function getMonthCells(month: Date): Date[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1, 12);
  const start = new Date(year, monthIndex, 1 - first.getDay(), 12);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function addDays(iso: string, days: number): string {
  const date = parseLocalDate(iso);
  date.setDate(date.getDate() + days);
  return localIso(date);
}

function addMonths(iso: string, months: number): string {
  const date = parseLocalDate(iso);
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return localIso(target);
}

// Workout-type colours come from the family map in shared/tokens.css (index.css).
export function typeColorVar(type: Workout["type"]): React.CSSProperties {
  return { "--type-color": `var(--type-${type})` } as React.CSSProperties;
}

export default function WorkoutCalendar({
  workouts,
  nutritionEntries,
  initialDate,
  compact = false,
}: {
  workouts: Workout[];
  nutritionEntries: NutritionEntry[];
  initialDate?: string;
  compact?: boolean;
}) {
  const headingId = useId();
  const panelHeadingId = useId();
  const newestDate = useMemo(() => {
    const datedRecords = [
      ...workouts.flatMap((workout) => (workout.date ? [workout.date] : [])),
      ...nutritionEntries.flatMap((entry) => (entry.date ? [entry.date] : [])),
    ].sort((left, right) => left.localeCompare(right));
    return datedRecords.at(-1) ?? localIso(new Date());
  }, [nutritionEntries, workouts]);
  const startingDate = initialDate ?? newestDate;
  const [visibleMonth, setVisibleMonth] = useState(() => parseLocalDate(startingDate));
  const [selectedDate, setSelectedDate] = useState(startingDate);
  const [focusedDate, setFocusedDate] = useState(startingDate);
  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);
  const cells = useMemo(() => getMonthCells(visibleMonth), [visibleMonth]);
  const cellIsos = useMemo(() => cells.map(localIso), [cells]);
  const selectedWorkouts = workouts.filter((workout) => workout.date === selectedDate);
  const selectedNutrition = nutritionEntries.filter(
    (entry) => entry.date === selectedDate,
  );
  const undatedCount = workouts.filter((workout) => !workout.date).length;
  const firstOfMonth = localIso(
    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1, 12),
  );
  // One tab stop in the grid (roving tabindex).
  const rovingIso = cellIsos.includes(focusedDate)
    ? focusedDate
    : cellIsos.includes(selectedDate)
      ? selectedDate
      : firstOfMonth;

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-iso="${focusedDate}"]`)
      ?.focus();
  }, [focusedDate, visibleMonth]);

  function moveMonth(offset: number) {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1, 12),
    );
  }

  function selectDate(iso: string) {
    setSelectedDate(iso);
    setFocusedDate(iso);
    // On phones and tablets the day panel sits below the grid: bring it into
    // view and move focus to its heading so the selection is announced.
    if (typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(max-width: 1279px)").matches) return;
    window.requestAnimationFrame(() => {
      const behavior = prefersReducedMotion() ? "auto" : "smooth";
      if (compact) {
        panelRef.current?.scrollIntoView({ behavior, block: "nearest" });
        return;
      }
      panelHeadingRef.current?.focus({ preventScroll: true });
      panelHeadingRef.current?.scrollIntoView({ behavior, block: "start" });
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, iso: string) {
    const weekday = parseLocalDate(iso).getDay();
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(iso, -1),
      ArrowRight: () => addDays(iso, 1),
      ArrowUp: () => addDays(iso, -7),
      ArrowDown: () => addDays(iso, 7),
      Home: () => addDays(iso, -weekday),
      End: () => addDays(iso, 6 - weekday),
      PageUp: () => addMonths(iso, -1),
      PageDown: () => addMonths(iso, 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = move();
    const nextDate = parseLocalDate(next);
    if (
      nextDate.getMonth() !== visibleMonth.getMonth() ||
      nextDate.getFullYear() !== visibleMonth.getFullYear()
    ) {
      setVisibleMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1, 12));
    }
    moveFocus.current = true;
    setFocusedDate(next);
  }

  const selectedDateObject = parseLocalDate(selectedDate);
  const today = localIso(new Date());
  const pillLimit = compact ? 1 : 2;

  return (
    <div
      className={clsx("grid gap-4", compact ? "" : "xl:grid-cols-[minmax(0,1fr)_21rem]")}
    >
      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <p className="eyebrow">Calendar</p>
            <h2 id={headingId} className="mt-1 text-xl font-bold tracking-[-0.02em]">
              {monthFormatter.format(visibleMonth)}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" onClick={() => moveMonth(-1)} aria-label="Previous month">
              <ArrowLeft size={16} aria-hidden="true" />
            </Button>
            <Button
              onClick={() => {
                setVisibleMonth(parseLocalDate(newestDate));
                setSelectedDate(newestDate);
                setFocusedDate(newestDate);
              }}
            >
              Latest
            </Button>
            <Button size="icon" onClick={() => moveMonth(1)} aria-label="Next month">
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div
          ref={gridRef}
          role="grid"
          aria-labelledby={headingId}
          className="calendar-grid border-t border-[var(--line)]"
        >
          <div role="row">
            {weekdayLabels.map((day) => (
              <div
                key={day}
                role="columnheader"
                className="py-2 text-center text-xs font-bold uppercase tracking-wider text-[var(--muted)]"
              >
                <abbr title={day} className="no-underline">
                  <span className="sm:hidden" aria-hidden="true">
                    {day.slice(0, 1)}
                  </span>
                  <span className="hidden sm:inline" aria-hidden="true">
                    {day.slice(0, 3)}
                  </span>
                  <span className="sr-only">{day}</span>
                </abbr>
              </div>
            ))}
          </div>
          {Array.from({ length: 6 }, (_, week) => (
            <div role="row" key={cellIsos[week * 7]}>
              {cells.slice(week * 7, week * 7 + 7).map((date) => {
                const iso = localIso(date);
                const dayWorkouts = workouts.filter((workout) => workout.date === iso);
                const hasNutrition = nutritionEntries.some((entry) => entry.date === iso);
                const outside = date.getMonth() !== visibleMonth.getMonth();
                const isToday = iso === today;

                return (
                  <div role="gridcell" key={iso} className="calendar-day">
                    <button
                      type="button"
                      className="calendar-cell"
                      data-iso={iso}
                      data-outside={outside}
                      data-selected={iso === selectedDate}
                      data-today={isToday}
                      tabIndex={iso === rovingIso ? 0 : -1}
                      aria-pressed={iso === selectedDate}
                      aria-current={isToday ? "date" : undefined}
                      onClick={() => selectDate(iso)}
                      onKeyDown={(event) => handleKeyDown(event, iso)}
                      onFocus={() => setFocusedDate(iso)}
                      aria-label={`${detailFormatter.format(date)}: ${dayWorkouts.length} workout${dayWorkouts.length === 1 ? "" : "s"}${dayWorkouts.length ? ` (${dayWorkouts.map((workout) => workout.type).join(", ")})` : ""}${hasNutrition ? ", nutrition recorded" : ""}`}
                    >
                      <span className="day-number">{date.getDate()}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1 sm:block sm:space-y-1">
                        {dayWorkouts.slice(0, pillLimit).map((workout) => (
                          <span
                            key={workout.id}
                            className="type-pill-wrap"
                            style={typeColorVar(workout.type)}
                            aria-hidden="true"
                          >
                            <span className="type-dot sm:hidden" />
                            <span className="type-pill hidden sm:block">
                              {workout.type}
                            </span>
                          </span>
                        ))}
                        {dayWorkouts.length > pillLimit ? (
                          <span className="hidden text-xs font-bold text-[var(--muted)] sm:block">
                            +{dayWorkouts.length - pillLimit} more
                          </span>
                        ) : null}
                      </span>
                      {hasNutrition ? (
                        <span
                          className="nutrition-mark absolute bottom-1.5 right-1.5"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--muted)]">
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Legend">
            {workoutTypeLegend.map((type) => (
              <li key={type} className="flex items-center gap-1.5">
                <span
                  className="type-dot"
                  style={typeColorVar(type)}
                  aria-hidden="true"
                />
                {type}
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span className="nutrition-mark" aria-hidden="true" /> nutrition
            </li>
          </ul>
          {undatedCount ? (
            <span className="flex items-center gap-1.5 font-semibold">
              <CircleAlert size={13} aria-hidden="true" /> {undatedCount} undated sessions
            </span>
          ) : null}
        </div>
        {/* Selection feedback; the pressed cell carries the accessible state, so
            this is not a live region (the page has exactly two, in AppShell). */}
        {compact ? (
          <div
            ref={panelRef}
            className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold">
                {detailFormatter.format(selectedDateObject)}
              </p>
              <p className="mt-1 truncate text-xs text-[var(--muted)]">
                {selectedWorkouts.length
                  ? selectedWorkouts.map((workout) => workout.title).join(" · ")
                  : selectedNutrition.length
                    ? "Nutrition recorded"
                    : "No entries recorded"}
              </p>
            </div>
            <ButtonLink to="/workouts" variant="ghost" className="shrink-0">
              Open calendar <ArrowRight size={14} aria-hidden="true" />
            </ButtonLink>
          </div>
        ) : null}
      </Surface>

      {!compact ? (
        <section aria-labelledby={panelHeadingId} className="self-start">
          <Surface className="p-4 sm:p-5">
            <p className="eyebrow">Selected day</p>
            <h3
              ref={panelHeadingRef}
              id={panelHeadingId}
              tabIndex={-1}
              className="mt-1 rounded-sm text-lg font-bold tracking-[-0.02em]"
            >
              {detailFormatter.format(selectedDateObject)}
            </h3>
            <div className="mt-4 space-y-3">
              {selectedWorkouts.map((workout) => (
                <div
                  key={workout.id}
                  className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge tone="accent">{workout.type}</Badge>
                      <p className="mt-2 text-sm font-bold">{workout.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-[var(--muted)]">
                        <Clock3 size={12} aria-hidden="true" />
                        {workout.startTime
                          ? formatWorkoutStartTime(workout.startTime)
                          : "Start time not recorded"}
                        {workout.durationMinutes !== undefined
                          ? ` · ${formatWorkoutDuration(workout.durationMinutes)}`
                          : ""}
                        {` · ${workout.exercises.length} exercises`}
                      </p>
                    </div>
                    <Dumbbell
                      size={18}
                      className="text-[var(--muted)]"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              ))}
              {selectedNutrition.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-4"
                >
                  <div className="flex items-center gap-2">
                    <Apple size={16} className="text-[var(--warn)]" aria-hidden="true" />
                    <p className="text-sm font-bold">Nutrition logged</p>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                    {[
                      entry.proteinG && `${entry.proteinG} g protein`,
                      entry.calories && `${entry.calories} kcal`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Context-only entry"}
                  </p>
                </div>
              ))}
              {!selectedWorkouts.length && !selectedNutrition.length ? (
                <EmptyState
                  icon={CalendarPlus}
                  title="Open day"
                  description="No workout or nutrition entry is attached to this date."
                  action={
                    <ButtonLink to={`/add?date=${selectedDate}`}>
                      Add a workout
                    </ButtonLink>
                  }
                />
              ) : (
                <ButtonLink to={`/add?date=${selectedDate}`} block>
                  <CalendarPlus size={15} aria-hidden="true" /> Add another entry
                </ButtonLink>
              )}
            </div>
          </Surface>
        </section>
      ) : null}
    </div>
  );
}
