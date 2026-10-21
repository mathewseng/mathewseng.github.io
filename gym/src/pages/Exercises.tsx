import {
  ArrowUpRight,
  CircleAlert,
  Dumbbell,
  ShieldCheck,
  Sparkles,
  Target,
  Weight,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import ProgressChart, { type ChartPoint } from "../components/ProgressChart";
import {
  Badge,
  MetricCard,
  PageHeader,
  SearchField,
  SegmentedControl,
  Surface,
} from "../components/ui";
import { exercises } from "../data/exercises";
import { calculateCompletedReps, calculateVolume } from "../lib/calculations";
import { getExercisePersonalRecords } from "../lib/personalRecords";
import type { ExerciseCategory } from "../lib/types";
import { useAppState } from "../state/AppState";

const categories: Array<{ value: ExerciseCategory | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "chest", label: "Chest" },
  { value: "back", label: "Back" },
  { value: "shoulders", label: "Shoulders" },
  { value: "arms", label: "Arms" },
  { value: "legs", label: "Legs" },
  { value: "carries", label: "Carries" },
  { value: "core", label: "Core" },
];

export default function Exercises() {
  const { workouts } = useAppState();
  const [category, setCategory] = useState<ExerciseCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("smith-flat-bench");
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);

  function selectExercise(exerciseId: string) {
    setSelectedId(exerciseId);
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    window.requestAnimationFrame(() => {
      detailHeadingRef.current?.focus({ preventScroll: true });
      detailHeadingRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
  }

  const filteredExercises = useMemo(() => {
    const query = search.trim().toLowerCase();
    return exercises.filter(
      (exercise) =>
        (category === "all" || exercise.category === category) &&
        (!query ||
          exercise.canonicalName.toLowerCase().includes(query) ||
          exercise.aliases.some((alias) => alias.toLowerCase().includes(query)) ||
          exercise.muscleGroups.some((muscle) => muscle.toLowerCase().includes(query))),
    );
  }, [category, search]);

  const selected =
    exercises.find((exercise) => exercise.id === selectedId) ?? exercises[0];
  const records = selected
    ? getExercisePersonalRecords(workouts, selected.id, {
        machineId: selected.id.startsWith("smith-") ? "primary-smith-machine" : undefined,
      })
    : [];
  const primaryRecord = records[0];

  const history = useMemo<ChartPoint[]>(() => {
    if (!selected) return [];
    return workouts
      .filter((workout) =>
        workout.exercises.some((entry) => entry.exerciseId === selected.id),
      )
      .sort((a, b) => a.chronologyIndex - b.chronologyIndex)
      .map((workout) => {
        const entries = workout.exercises.filter(
          (entry) => entry.exerciseId === selected.id,
        );
        const eligibleSets = entries.flatMap((entry) =>
          entry.sets.filter(
            (set) =>
              set.completed &&
              !set.failedAttempt &&
              !set.warmup &&
              set.reps !== undefined,
          ),
        );
        const bestSet = [...eligibleSets].sort((left, right) => {
          const weightDifference = (right.weightLb ?? 0) - (left.weightLb ?? 0);
          return weightDifference || (right.reps ?? 0) - (left.reps ?? 0);
        })[0];
        return {
          label: workout.date
            ? new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
              }).format(new Date(`${workout.date}T12:00:00`))
            : `#${workout.chronologyIndex}`,
          value: bestSet?.weightLb ?? bestSet?.reps,
          secondary: entries.reduce(
            (total, entry) => total + calculateCompletedReps(entry),
            0,
          ),
          context: workout.date
            ? workout.context?.notes
            : "Exact workout date was not recorded.",
        };
      });
  }, [selected, workouts]);

  const sessionEntries = selected
    ? workouts.flatMap((workout) =>
        workout.exercises
          .filter((entry) => entry.exerciseId === selected.id)
          .map((entry) => ({ workout, entry })),
      )
    : [];
  const bestVolume = Math.max(
    0,
    ...sessionEntries.map(({ entry }) => calculateVolume(entry)),
  );

  return (
    <>
      <PageHeader
        title="Exercise progress"
        description="Machines and free weights stay separate, only comparable sets count, and the best known set for each movement is shown."
      />

      <div className="grid gap-5 lg:grid-cols-[min(21rem,35%)_minmax(0,1fr)]">
        <Surface className="self-start p-3 sm:p-4">
          <SearchField
            label="Search exercises"
            value={search}
            onChange={setSearch}
            placeholder="Search exercise"
          />
          <SegmentedControl
            className="mt-3 w-full"
            label="Exercise category"
            options={categories}
            value={category}
            onChange={setCategory}
          />
          <div className="mt-2 max-h-[18rem] space-y-1 overflow-y-auto pr-1 lg:max-h-[38rem]">
            {filteredExercises.map((exercise) => {
              const recorded = workouts.some((workout) =>
                workout.exercises.some((entry) => entry.exerciseId === exercise.id),
              );
              return (
                <button
                  key={exercise.id}
                  type="button"
                  onClick={() => selectExercise(exercise.id)}
                  aria-pressed={selected?.id === exercise.id}
                  className={
                    selected?.id === exercise.id
                      ? "flex min-h-11 w-full items-center justify-between gap-3 rounded-md bg-[var(--accent-soft)] px-3 py-2.5 text-left shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_45%,transparent)]"
                      : "flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left hover:bg-[var(--surface-3)]"
                  }
                >
                  <span>
                    <span className="block text-sm font-bold">
                      {exercise.canonicalName}
                    </span>
                    <span
                      className={
                        selected?.id === exercise.id
                          ? "mt-0.5 block text-xs font-semibold text-[var(--accent)]"
                          : "mt-0.5 block text-xs font-semibold text-[var(--muted)]"
                      }
                    >
                      {exercise.category}
                    </span>
                  </span>
                  {recorded ? (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                      role="img"
                      aria-label="Has history"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </Surface>

        {selected ? (
          <div className="min-w-0">
            <Surface raised className="surface-feature overflow-hidden p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="accent">{selected.category}</Badge>
                    <Badge tone="accent">{selected.equipment.join(" · ")}</Badge>
                  </div>
                  <h2
                    ref={detailHeadingRef}
                    tabIndex={-1}
                    className="mt-5 scroll-mt-24 text-2xl font-extrabold tracking-[-0.03em] focus:outline-none sm:text-3xl"
                  >
                    {selected.canonicalName}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                    {selected.notes}
                  </p>
                </div>
                <span
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-[var(--accent-soft)] text-[var(--accent)]"
                  aria-hidden="true"
                >
                  <Dumbbell size={22} />
                </span>
              </div>
              <div className="mt-7 flex flex-wrap gap-2">
                {selected.muscleGroups.map((muscle) => (
                  <span
                    key={muscle}
                    className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs font-semibold text-[var(--muted)]"
                  >
                    {muscle}
                  </span>
                ))}
              </div>
            </Surface>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                label="Heaviest set"
                value={
                  primaryRecord?.heaviestSuccessfulSet?.weightLb !== undefined
                    ? `${primaryRecord.heaviestSuccessfulSet.weightLb} lb`
                    : "—"
                }
                detail={
                  primaryRecord?.heaviestSuccessfulSet
                    ? `${primaryRecord.heaviestSuccessfulSet.reps} completed rep${primaryRecord.heaviestSuccessfulSet.reps === 1 ? "" : "s"}`
                    : "No comparable set"
                }
                icon={Weight}
              />
              <MetricCard
                label="Best session reps"
                value={`${primaryRecord?.bestSessionCompletedReps?.value ?? "—"}`}
                detail="Completed reps only"
                icon={Target}
              />
              <MetricCard
                label="Best known volume"
                value={bestVolume ? `${bestVolume.toLocaleString()} lb` : "—"}
                detail="No per-side assumptions"
                icon={ArrowUpRight}
              />
              <MetricCard
                label="Logged sessions"
                value={`${sessionEntries.length}`}
                detail={`${sessionEntries.filter(({ workout }) => !workout.date).length} undated`}
                icon={Sparkles}
              />
            </div>

            <div className="mt-4">
              <ProgressChart
                title={`${selected.canonicalName} progression`}
                description="Primary line shows the highest known completed load (or reps for bodyweight work); dashed line shows session reps."
                data={history}
                valueSuffix={selected.volumeCalculationMeaningful ? "lb" : "reps"}
                secondaryLabel="Session reps"
                height={280}
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Surface className="p-5">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    size={17}
                    className="text-[var(--accent)]"
                    aria-hidden="true"
                  />
                  <h3 className="text-sm font-bold">Tracking rules</h3>
                </div>
                <dl className="mt-4 space-y-3 text-xs">
                  {[
                    [
                      "Per-side possible",
                      selected.weightMayBePerSide ? "Yes — label it" : "No",
                    ],
                    [
                      "Volume meaningful",
                      selected.volumeCalculationMeaningful ? "Yes" : "Not by default",
                    ],
                    [
                      "Estimated 1RM",
                      selected.estimatedOneRepMaxAppropriate
                        ? "Optional, clearly estimated"
                        : "Disabled",
                    ],
                    [
                      "May stress back",
                      selected.mayStressBack ? "Use symptom context" : "Not flagged",
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3 last:border-0 last:pb-0"
                    >
                      <dt className="text-[var(--muted)]">{label}</dt>
                      <dd className="text-right font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Surface>
              <Surface className="p-5">
                <div className="flex items-center gap-2">
                  <CircleAlert
                    size={17}
                    className="text-[var(--warn)]"
                    aria-hidden="true"
                  />
                  <h3 className="text-sm font-bold">Comparison integrity</h3>
                </div>
                <p className="mt-4 text-xs leading-6 text-[var(--muted)]">
                  Smith-machine loads stay separate from free-weight barbell loads.
                  Machine stacks remain machine-specific. Warm-ups, failed attempts,
                  missing reps, and ambiguous per-side values do not silently become clean
                  records.
                </p>
              </Surface>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
