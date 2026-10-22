import {
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Filter,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import WorkoutCalendar from "../components/WorkoutCalendar";
import WorkoutCard from "../components/WorkoutCard";
import { useConfirm } from "../components/confirm";
import {
  Badge,
  Button,
  ButtonLink,
  Chip,
  EmptyState,
  PageHeader,
  SearchField,
  SectionHeading,
  SegmentedControl,
  Surface,
} from "../components/ui";
import { compareWorkoutsNewestFirst } from "../data/workouts";
import type { WorkoutType } from "../lib/types";
import { isValidIsoDate } from "../lib/validation";
import { useSearchParams } from "../router";
import { useAppState } from "../state/AppState";

type ContextFilter =
  "illness" | "travel" | "soreness" | "back-pain" | "incomplete" | "failed";

const typeOptions: Array<{ value: WorkoutType | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "push", label: "Push" },
  { value: "pull", label: "Pull" },
  { value: "legs", label: "Legs" },
  { value: "full-body", label: "Full body" },
  { value: "upper", label: "Upper" },
  { value: "other", label: "Other" },
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
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();
  const queryDate = searchParams.get("date");
  // `#/workouts?date=YYYY-MM-DD` opens the calendar on that day.
  const initialDate = queryDate && isValidIsoDate(queryDate) ? queryDate : undefined;
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

  async function removeWorkout(id: string, title: string) {
    const confirmed = await confirm({
      title: `Delete “${title}”?`,
      description:
        "The entry is removed from this browser. This cannot be undone unless it is in a backup.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (confirmed) deleteWorkout(id);
  }

  return (
    <>
      <PageHeader
        title="Training calendar"
        description="Scan the month, inspect every set, and filter by the recovery context that shaped the session."
        actions={
          <ButtonLink to="/add" variant="primary">
            <Plus size={16} aria-hidden="true" /> Add workout
          </ButtonLink>
        }
      />

      <WorkoutCalendar
        key={initialDate ?? "latest"}
        workouts={workouts}
        nutritionEntries={nutritionEntries}
        initialDate={initialDate}
      />

      <section className="mt-8">
        <SectionHeading
          title="Workout history"
          description={`${workouts.length} sessions · ${workouts.filter((workout) => !workout.date).length} undated`}
        />

        <Surface className="mb-4 p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchField
              className="flex-1"
              label="Search exercise or workout"
              value={search}
              onChange={setSearch}
              placeholder="Search exercise or session"
            />
            <SegmentedControl
              label="Workout type"
              options={typeOptions}
              value={type}
              onChange={setType}
            />
            <Button
              className="shrink-0"
              onClick={() => setShowFilters((value) => !value)}
              aria-expanded={showFilters}
            >
              <Filter size={15} aria-hidden="true" /> Context
              {filters.length ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 text-xs text-[var(--on-accent)]">
                  {filters.length}
                </span>
              ) : null}
              <ChevronDown size={14} aria-hidden="true" />
            </Button>
          </div>

          {showFilters ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
              {contextOptions.map((option) => (
                <Chip
                  key={option.id}
                  pressed={filters.includes(option.id)}
                  onClick={() => toggleFilter(option.id)}
                >
                  {option.label}
                </Chip>
              ))}
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
                      <ButtonLink to={`/add?edit=${workout.id}`}>
                        Edit local entry
                      </ButtonLink>
                      <Button
                        variant="danger"
                        onClick={() => void removeWorkout(workout.id, workout.title)}
                      >
                        <Trash2 size={14} aria-hidden="true" /> Delete
                      </Button>
                    </>
                  ) : null
                }
              />
            ))}
          </div>
        ) : (
          <Surface>
            <EmptyState
              icon={CalendarDays}
              title="No dated workouts match"
              description="Try clearing a filter or search."
            />
          </Surface>
        )}

        {undated.length ? (
          <div className="mt-7">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-[-0.02em]">
                  <button
                    type="button"
                    className="flex min-h-11 items-center gap-2 rounded-sm text-left"
                    onClick={() => setShowUndated((value) => !value)}
                    aria-expanded={showUndated}
                    aria-controls="undated-history"
                  >
                    <CircleAlert
                      size={17}
                      className="text-[var(--warn)]"
                      aria-hidden="true"
                    />
                    Undated history
                    <ChevronDown
                      size={16}
                      className={showUndated ? "rotate-180" : undefined}
                      aria-hidden="true"
                    />
                  </button>
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  Kept in source order; never assigned a made-up date.
                </p>
              </div>
              <Badge tone="quality">{undated.length} sessions</Badge>
            </div>
            {showUndated ? (
              <div id="undated-history" className="space-y-3">
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
