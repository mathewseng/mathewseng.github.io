import {
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Filter,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import WorkoutCalendar from "../components/WorkoutCalendar";
import WorkoutCard from "../components/WorkoutCard";
import { Badge, PageHeader, SectionHeading, Surface } from "../components/ui";
import { compareWorkoutsNewestFirst } from "../data/workouts";
import type { WorkoutType } from "../lib/types";
import { Link } from "../router";
import { useAppState } from "../state/AppState";

type ContextFilter =
  "illness" | "travel" | "soreness" | "back-pain" | "incomplete" | "failed";

const typeOptions: Array<WorkoutType | "all"> = [
  "all",
  "push",
  "pull",
  "legs",
  "full-body",
  "upper",
  "other",
];

const contextOptions: Array<{ id: ContextFilter; label: string }> = [
  { id: "illness", label: "Illness > 0" },
  { id: "travel", label: "Travel impact > 0" },
  { id: "soreness", label: "Soreness ≥ 3" },
  { id: "back-pain", label: "Back pain > 0" },
  { id: "incomplete", label: "Incomplete data" },
  { id: "failed", label: "Failed attempt" },
];

export default function Workouts() {
  const { workouts, nutritionEntries, isLocalWorkout, deleteWorkout } = useAppState();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<WorkoutType | "all">("all");
  const [filters, setFilters] = useState<ContextFilter[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showUndated, setShowUndated] = useState(true);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return [...workouts]
      .filter((workout) => type === "all" || workout.type === type)
      .filter(
        (workout) =>
          !normalizedSearch ||
          workout.title.toLowerCase().includes(normalizedSearch) ||
          workout.exercises.some(
            (exercise) =>
              exercise.name.toLowerCase().includes(normalizedSearch) ||
              exercise.exerciseId.includes(normalizedSearch),
          ),
      )
      .filter((workout) =>
        filters.every((filter) => {
          switch (filter) {
            case "illness":
              return (
                (workout.context?.illness ?? 0) > 0 ||
                workout.context?.sourceLabels?.some((label) =>
                  label.includes("illness"),
                ) === true
              );
            case "travel":
              return (
                (workout.context?.travelImpact ?? 0) > 0 ||
                workout.context?.sourceLabels?.some((label) =>
                  label.includes("travel"),
                ) === true
              );
            case "soreness":
              return (workout.context?.soreness ?? 0) >= 3;
            case "back-pain":
              return (workout.context?.backPain ?? 0) > 0;
            case "incomplete":
              return workout.dataQuality !== "complete";
            case "failed":
              return workout.exercises.some((exercise) =>
                exercise.sets.some((set) => set.failedAttempt),
              );
          }
        }),
      )
      .sort(compareWorkoutsNewestFirst);
  }, [filters, search, type, workouts]);

  const dated = filtered.filter((workout) => workout.date);
  const undated = filtered.filter((workout) => !workout.date);

  function toggleFilter(filter: ContextFilter) {
    setFilters((current) =>
      current.includes(filter)
        ? current.filter((value) => value !== filter)
        : [...current, filter],
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="History & rhythm"
        title="Training calendar"
        description="Scan your month, inspect every set, and filter by the recovery context that shaped the session."
        actions={
          <Link to="/add" className="button-primary">
            <Plus size={16} /> Add workout
          </Link>
        }
      />

      <WorkoutCalendar workouts={workouts} nutritionEntries={nutritionEntries} />

      <section className="mt-8">
        <SectionHeading
          title="Workout history"
          description={`${workouts.length} sessions · ${workouts.filter((workout) => !workout.date).length} honestly undated`}
        />

        <Surface className="mb-4 p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search exercise or workout</span>
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="field !pl-10"
                placeholder="Search exercise or session"
              />
              {search ? (
                <button
                  type="button"
                  className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              ) : null}
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
              {typeOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setType(option)}
                  className={
                    type === option
                      ? "button-primary !min-h-11 whitespace-nowrap !px-3 text-xs capitalize"
                      : "button-secondary !min-h-11 whitespace-nowrap !px-3 text-xs capitalize"
                  }
                  aria-pressed={type === option}
                >
                  {option}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="button-secondary !min-h-11 shrink-0 text-xs"
              onClick={() => setShowFilters((value) => !value)}
              aria-expanded={showFilters}
            >
              <Filter size={15} /> Context
              {filters.length ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 text-[0.62rem] text-[var(--accent-ink)]">
                  {filters.length}
                </span>
              ) : null}
              <ChevronDown size={14} />
            </button>
          </div>

          {showFilters ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
              {contextOptions.map((option) => {
                const active = filters.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleFilter(option.id)}
                    className={
                      active
                        ? "button-primary !min-h-11 !px-3 text-xs"
                        : "button-secondary !min-h-11 !px-3 text-xs"
                    }
                    aria-pressed={active}
                  >
                    {active ? <Check size={13} /> : null}
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </Surface>

        {dated.length ? (
          <div className="space-y-3">
            {dated.map((workout) => (
              <WorkoutCard
                key={workout.id}
                workout={workout}
                actions={
                  isLocalWorkout(workout.id) ? (
                    <>
                      <Link
                        to={`/add?edit=${workout.id}`}
                        className="button-secondary text-xs"
                      >
                        Edit local entry
                      </Link>
                      <button
                        type="button"
                        className="button-danger text-xs"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete “${workout.title}” from this browser? This cannot be undone unless it is in a backup.`,
                            )
                          ) {
                            deleteWorkout(workout.id);
                          }
                        }}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </>
                  ) : null
                }
              />
            ))}
          </div>
        ) : (
          <Surface className="grid min-h-44 place-items-center p-6 text-center">
            <div>
              <CalendarDays className="mx-auto text-[var(--muted)]" size={24} />
              <p className="mt-3 text-sm font-extrabold">No dated workouts match</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Try clearing a filter or search.
              </p>
            </div>
          </Surface>
        )}

        {undated.length ? (
          <div className="mt-7">
            <button
              type="button"
              className="mb-3 flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setShowUndated((value) => !value)}
              aria-expanded={showUndated}
            >
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black tracking-[-0.025em]">
                  <CircleAlert size={17} className="text-[var(--orange)]" />
                  Undated history
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Kept in source order; never assigned a made-up date.
                </p>
              </div>
              <Badge tone="quality">{undated.length} sessions</Badge>
            </button>
            {showUndated ? (
              <div className="space-y-3">
                {undated.map((workout) => (
                  <WorkoutCard key={workout.id} workout={workout} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
