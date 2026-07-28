import {
  Apple,
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  CircleAlert,
  Dumbbell,
} from "lucide-react";
import { useMemo, useState } from "react";

import { clsx } from "clsx";

import type { NutritionEntry, Workout } from "../lib/types";
import { Link } from "../router";
import { Badge, EmptyState, Surface } from "./ui";

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

const typeColor: Record<Workout["type"], string> = {
  push: "#d9ff52",
  pull: "#7dd3fc",
  legs: "#ffb88b",
  "full-body": "#c4b5fd",
  upper: "#86efac",
  other: "#d4d4d4",
};

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
            <p className="eyebrow">Training rhythm</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em]">
              {monthFormatter.format(visibleMonth)}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="button-secondary !h-11 !min-h-11 !w-11 !p-0"
              onClick={() => moveMonth(-1)}
              aria-label="Previous month"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              className="button-secondary !h-11 !min-h-11 !px-3 text-xs"
              onClick={() => {
                const current = parseLocalDate(newestDate);
                setVisibleMonth(current);
                setSelectedDate(newestDate);
              }}
            >
              Latest
            </button>
            <button
              type="button"
              className="button-secondary !h-11 !min-h-11 !w-11 !p-0"
              onClick={() => moveMonth(1)}
              aria-label="Next month"
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        <div className="calendar-grid border-t border-[var(--line)]">
          {weekdayLabels.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-[0.68rem] font-extrabold uppercase tracking-wider text-[var(--faint)]"
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
                className="calendar-cell hover:bg-[var(--surface-soft)]"
                data-outside={outside}
                data-selected={iso === selectedDate}
                data-today={isToday}
                onClick={() => setSelectedDate(iso)}
                aria-label={`${detailFormatter.format(date)}: ${dayWorkouts.length} workout${dayWorkouts.length === 1 ? "" : "s"}${dayWorkouts.length ? ` (${dayWorkouts.map((workout) => workout.type).join(", ")})` : ""}${hasNutrition ? ", nutrition recorded" : ""}`}
              >
                <span className="day-number">{date.getDate()}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1 sm:block sm:space-y-1">
                  {dayWorkouts.slice(0, compact ? 1 : 2).map((workout) => (
                    <span
                      key={workout.id}
                      className="h-2 w-2 rounded-full sm:block sm:h-auto sm:w-auto sm:truncate sm:rounded-md sm:px-1.5 sm:py-1 sm:text-[0.68rem] sm:font-extrabold sm:uppercase sm:tracking-wide sm:text-[#10130f]"
                      style={{ backgroundColor: typeColor[workout.type] }}
                      aria-hidden="true"
                    >
                      <span className="hidden sm:inline">{workout.type}</span>
                    </span>
                  ))}
                  {dayWorkouts.length > (compact ? 1 : 2) ? (
                    <span className="hidden text-[0.68rem] font-bold text-[var(--muted)] sm:block">
                      +{dayWorkouts.length - (compact ? 1 : 2)} more
                    </span>
                  ) : null}
                </span>
                {hasNutrition ? (
                  <span
                    className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[var(--orange)]"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--muted)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--acid)]" /> workout
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--orange)]" /> nutrition
            </span>
          </div>
          {undatedCount ? (
            <span className="flex items-center gap-1.5 font-semibold">
              <CircleAlert size={13} /> {undatedCount} honest-to-source undated sessions
            </span>
          ) : null}
        </div>
        {compact ? (
          <div
            className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            aria-live="polite"
          >
            <div className="min-w-0">
              <p className="text-xs font-extrabold">
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
            <Link
              to="/workouts"
              className="button-ghost shrink-0 justify-between !px-2 text-xs"
            >
              Open calendar <ArrowRight size={14} />
            </Link>
          </div>
        ) : null}
      </Surface>

      {!compact ? (
        <Surface className="self-start p-4 sm:p-5">
          <p className="eyebrow">Selected day</p>
          <h3 className="mt-1 text-lg font-black tracking-[-0.025em]">
            {detailFormatter.format(selectedDateObject)}
          </h3>
          <div className="mt-4 space-y-3">
            {selectedWorkouts.map((workout) => (
              <div
                key={workout.id}
                className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Badge tone="accent">{workout.type}</Badge>
                    <p className="mt-2 text-sm font-extrabold">{workout.title}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {workout.exercises.length} exercises
                    </p>
                  </div>
                  <Dumbbell size={18} className="text-[var(--muted)]" />
                </div>
              </div>
            ))}
            {selectedNutrition.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4"
              >
                <div className="flex items-center gap-2">
                  <Apple size={16} className="text-[var(--orange)]" />
                  <p className="text-sm font-extrabold">Nutrition logged</p>
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
                  <Link
                    to={`/add?date=${selectedDate}`}
                    className="button-secondary text-xs"
                  >
                    Add a workout
                  </Link>
                }
              />
            ) : (
              <Link
                to={`/add?date=${selectedDate}`}
                className="button-secondary w-full text-xs"
              >
                <CalendarPlus size={15} /> Add another entry
              </Link>
            )}
          </div>
        </Surface>
      ) : null}
    </div>
  );
}
