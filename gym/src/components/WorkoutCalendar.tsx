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
  initialDate = "2026-07-28",
  compact = false,
}: {
  workouts: Workout[];
  nutritionEntries: NutritionEntry[];
  initialDate?: string;
  compact?: boolean;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => parseLocalDate(initialDate));
  const [selectedDate, setSelectedDate] = useState(initialDate);
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
              className="button-secondary !h-10 !min-h-10 !w-10 !p-0"
              onClick={() => moveMonth(-1)}
              aria-label="Previous month"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              className="button-secondary !h-10 !min-h-10 !px-3 text-xs"
              onClick={() => {
                const current = parseLocalDate("2026-07-28");
                setVisibleMonth(current);
                setSelectedDate("2026-07-28");
              }}
            >
              Latest
            </button>
            <button
              type="button"
              className="button-secondary !h-10 !min-h-10 !w-10 !p-0"
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
              className="py-2 text-center text-[0.62rem] font-extrabold uppercase tracking-wider text-[var(--faint)]"
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
            const isToday = iso === "2026-07-28";

            return (
              <button
                key={iso}
                type="button"
                className="calendar-cell hover:bg-[var(--surface-soft)]"
                data-outside={outside}
                data-selected={iso === selectedDate}
                data-today={isToday}
                onClick={() => setSelectedDate(iso)}
                aria-label={`${detailFormatter.format(date)}: ${dayWorkouts.length} workouts${hasNutrition ? ", nutrition recorded" : ""}`}
              >
                <span className="day-number">{date.getDate()}</span>
                <span className="mt-1 block space-y-1">
                  {dayWorkouts.slice(0, compact ? 1 : 2).map((workout) => (
                    <span
                      key={workout.id}
                      className="block truncate rounded-md px-1.5 py-1 text-[0.58rem] font-extrabold uppercase tracking-wide text-[#10130f]"
                      style={{ backgroundColor: typeColor[workout.type] }}
                    >
                      {workout.type}
                    </span>
                  ))}
                  {dayWorkouts.length > (compact ? 1 : 2) ? (
                    <span className="block text-[0.6rem] font-bold text-[var(--muted)]">
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
