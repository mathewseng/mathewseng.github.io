import {
  Apple,
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  CircleAlert,
  Clock3,
  Dumbbell,
} from "lucide-react";
import { useMemo, useState } from "react";

import { clsx } from "clsx";

import type { NutritionEntry, Workout } from "../lib/types";
import { formatWorkoutDuration, formatWorkoutStartTime } from "../lib/workoutTime";

import { Badge, Button, ButtonLink, EmptyState, Surface } from "./ui";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
  const cells = useMemo(() => getMonthCells(visibleMonth), [visibleMonth]);
  const selectedWorkouts = workouts.filter((workout) => workout.date === selectedDate);
  const selectedNutrition = nutritionEntries.filter(
    (entry) => entry.date === selectedDate,
  );
  const undatedCount = workouts.filter((workout) => !workout.date).length;

  function moveMonth(offset: number) {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1, 12),
    );
  }

  const selectedDateObject = parseLocalDate(selectedDate);
  const today = localIso(new Date());

  return (
    <div
      className={clsx("grid gap-4", compact ? "" : "xl:grid-cols-[minmax(0,1fr)_21rem]")}
    >
      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <p className="eyebrow">Calendar</p>
            <h2 className="mt-1 text-xl font-bold tracking-[-0.02em]">
              {monthFormatter.format(visibleMonth)}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" onClick={() => moveMonth(-1)} aria-label="Previous month">
              <ArrowLeft size={16} aria-hidden="true" />
            </Button>
            <Button
              onClick={() => {
                const current = parseLocalDate(newestDate);
                setVisibleMonth(current);
                setSelectedDate(newestDate);
              }}
            >
              Latest
            </Button>
            <Button size="icon" onClick={() => moveMonth(1)} aria-label="Next month">
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="calendar-grid border-t border-[var(--line)]">
          {weekdayLabels.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-bold uppercase tracking-wider text-[var(--muted)]"
            >
              <span className="sm:hidden">{day.slice(0, 1)}</span>
              <span className="hidden sm:inline">{day}</span>
            </div>
          ))}
          {cells.map((date) => {
            const iso = localIso(date);
            const dayWorkouts = workouts.filter((workout) => workout.date === iso);
            const hasNutrition = nutritionEntries.some((entry) => entry.date === iso);
            const outside = date.getMonth() !== visibleMonth.getMonth();
            const isToday = iso === today;

            return (
              <button
                key={iso}
                type="button"
                className="calendar-cell"
                data-outside={outside}
                data-selected={iso === selectedDate}
                data-today={isToday}
                aria-pressed={iso === selectedDate}
                aria-current={isToday ? "date" : undefined}
                onClick={() => setSelectedDate(iso)}
                aria-label={`${detailFormatter.format(date)}: ${dayWorkouts.length} workout${dayWorkouts.length === 1 ? "" : "s"}${dayWorkouts.length ? ` (${dayWorkouts.map((workout) => workout.type).join(", ")})` : ""}${hasNutrition ? ", nutrition recorded" : ""}`}
              >
                <span className="day-number">{date.getDate()}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1 sm:block sm:space-y-1">
                  {dayWorkouts.slice(0, compact ? 1 : 2).map((workout) => (
                    <span
                      key={workout.id}
                      className="type-pill-wrap"
                      style={typeColorVar(workout.type)}
                      aria-hidden="true"
                    >
                      <span className="type-dot sm:hidden" />
                      <span className="type-pill hidden sm:block">{workout.type}</span>
                    </span>
                  ))}
                  {dayWorkouts.length > (compact ? 1 : 2) ? (
                    <span className="hidden text-xs font-bold text-[var(--muted)] sm:block">
                      +{dayWorkouts.length - (compact ? 1 : 2)} more
                    </span>
                  ) : null}
                </span>
                {hasNutrition ? (
                  <span
                    className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[var(--warn)]"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--muted)]">
          <div className="flex flex-wrap items-center gap-3">
            {(["push", "pull", "legs", "full-body", "upper"] as const).map((type) => (
              <span key={type} className="flex items-center gap-1.5">
                <span
                  className="type-dot"
                  style={typeColorVar(type)}
                  aria-hidden="true"
                />
                {type}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full bg-[var(--warn)]"
                aria-hidden="true"
              />{" "}
              nutrition
            </span>
          </div>
          {undatedCount ? (
            <span className="flex items-center gap-1.5 font-semibold">
              <CircleAlert size={13} aria-hidden="true" /> {undatedCount} undated sessions
            </span>
          ) : null}
        </div>
        {compact ? (
          <div
            className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            aria-live="polite"
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
        <Surface className="self-start p-4 sm:p-5">
          <p className="eyebrow">Selected day</p>
          <h3 className="mt-1 text-lg font-bold tracking-[-0.02em]">
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
                      <Clock3 size={12} />
                      {workout.startTime
                        ? formatWorkoutStartTime(workout.startTime)
                        : "Start time not recorded"}
                      {workout.durationMinutes !== undefined
                        ? ` · ${formatWorkoutDuration(workout.durationMinutes)}`
                        : ""}
                      {` · ${workout.exercises.length} exercises`}
                    </p>
                  </div>
                  <Dumbbell size={18} className="text-[var(--muted)]" />
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
                  <ButtonLink to={`/add?date=${selectedDate}`}>Add a workout</ButtonLink>
                }
              />
            ) : (
              <ButtonLink to={`/add?date=${selectedDate}`} block>
                <CalendarPlus size={15} aria-hidden="true" /> Add another entry
              </ButtonLink>
            )}
          </div>
        </Surface>
      ) : null}
    </div>
  );
}
