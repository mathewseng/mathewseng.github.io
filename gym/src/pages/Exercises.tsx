import {
  ArrowUpRight,
  CircleAlert,
  Dumbbell,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Weight,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import ProgressChart, { type ChartPoint } from "../components/ProgressChart";
import { Badge, MetricCard, PageHeader, Surface } from "../components/ui";
import { exercises } from "../data/exercises";
import { calculateCompletedReps, calculateVolume } from "../lib/calculations";
import { getExercisePersonalRecords } from "../lib/personalRecords";
import type { ExerciseCategory } from "../lib/types";
import { useAppState } from "../state/AppState";

const categories: Array<ExerciseCategory | "all"> = [
  "all",
  "chest",
  "back",
  "shoulders",
  "arms",
  "legs",
  "carries",
  "core",
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
        eyebrow="Exercise intelligence"
        title="Every movement has a story."
        description="Keep machines and free weights separate, compare only meaningful sets, and see exactly where the next rep fits."
      />

      <div className="grid gap-5 lg:grid-cols-[21rem_minmax(0,1fr)]">
        <Surface className="self-start p-3 sm:p-4">
          <label className="relative block">
            <span className="sr-only">Search exercises</span>
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="field !pl-10"
              placeholder="Search exercise"
            />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {categories.map((option) => (
              <button
                key={option}
                type="button"
                className={
                  category === option
                    ? "button-primary !min-h-11 whitespace-nowrap !px-3 text-xs capitalize"
                    : "button-secondary !min-h-11 whitespace-nowrap !px-3 text-xs capitalize"
                }
                onClick={() => setCategory(option)}
                aria-pressed={category === option}
              >
                {option}
              </button>
            ))}
          </div>
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
                      ? "flex w-full items-center justify-between gap-3 rounded-xl bg-[var(--accent)] px-3 py-3 text-left text-[var(--accent-ink)]"
                      : "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left hover:bg-[var(--surface-soft)]"
                  }
                >
                  <span>
                    <span className="block text-sm font-extrabold">
                      {exercise.canonicalName}
                    </span>
                    <span
                      className={
                        selected?.id === exercise.id
                          ? "mt-0.5 block text-[0.65rem] font-semibold opacity-70"
                          : "mt-0.5 block text-[0.65rem] font-semibold text-[var(--muted)]"
                      }
                    >
                      {exercise.category}
                    </span>
                  </span>
                  {recorded ? (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-[var(--acid)]"
                      title="Has history"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </Surface>

        {selected ? (
          <div className="min-w-0">
            <Surface
              raised
              className="overflow-hidden bg-[var(--accent)] p-5 text-[var(--accent-ink)] sm:p-6"
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-2xl">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="!border-white/15 !bg-white/10 !text-current">
                      {selected.category}
                    </Badge>
                    <Badge className="!border-white/15 !bg-white/10 !text-current">
                      {selected.equipment.join(" · ")}
                    </Badge>
                  </div>
                  <h2
                    ref={detailHeadingRef}
                    tabIndex={-1}
                    className="mt-5 scroll-mt-24 text-3xl font-black tracking-[-0.05em] focus:outline-none"
                  >
                    {selected.canonicalName}
                  </h2>
                  <p className="mt-3 text-sm leading-6 opacity-75">{selected.notes}</p>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10">
                  <Dumbbell size={22} />
                </span>
              </div>
              <div className="mt-7 flex flex-wrap gap-2">
                {selected.muscleGroups.map((muscle) => (
                  <span
                    key={muscle}
                    className="rounded-full border border-white/15 px-3 py-1 text-[0.68rem] font-bold"
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
                  <ShieldCheck size={17} className="text-[var(--accent)]" />
                  <h3 className="text-sm font-extrabold">Tracking rules</h3>
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
                      <dd className="text-right font-extrabold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Surface>
              <Surface className="p-5">
                <div className="flex items-center gap-2">
                  <CircleAlert size={17} className="text-[var(--orange)]" />
                  <h3 className="text-sm font-extrabold">Comparison integrity</h3>
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
