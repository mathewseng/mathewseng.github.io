import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  CloudSun,
  Gauge,
  MapPin,
} from "lucide-react";
import { useId, useState } from "react";

import { calculateCompletedReps, calculateWorkoutTotals } from "../lib/calculations";
import type { ExerciseSet, Workout } from "../lib/types";
import { formatWorkoutDuration, formatWorkoutStartTime } from "../lib/workoutTime";
import { Badge, Surface, type BadgeTone } from "./ui";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function setLabel(set: ExerciseSet): string {
  if (set.failedAttempt && !set.completed) {
    const attempted = set.attemptedReps ? ` × ${set.attemptedReps} attempted` : "";
    return `${set.weightLb ? `${set.weightLb} lb` : "Load unknown"}${attempted}`;
  }
  const load = set.weightLb !== undefined ? `${set.weightLb} lb` : "body weight";
  const reps = set.reps !== undefined ? ` × ${set.reps}` : " × ? reps";
  return `${load}${reps}${set.perSide ? " / side" : ""}`;
}

function setTone(set: ExerciseSet): BadgeTone {
  if (set.failedAttempt) return "danger";
  if (set.warmup || set.rampUp) return "warn";
  if (set.dataQuality && set.dataQuality !== "complete") return "quality";
  return "accent";
}

export default function WorkoutCard({
  workout,
  defaultExpanded = false,
  actions,
}: {
  workout: Workout;
  defaultExpanded?: boolean;
  actions?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const detailId = useId();
  const totals = calculateWorkoutTotals(workout);
  const context = workout.context;
  const contextScores: Array<[string, number]> = [];
  for (const [label, value] of [
    ["Energy", context?.energy],
    ["Sleep", context?.sleepQuality],
    ["Soreness", context?.soreness],
    ["Illness", context?.illness],
    ["Travel", context?.travelImpact],
    ["Back pain", context?.backPain],
  ] as const) {
    if (value !== undefined) contextScores.push([label, value]);
  }

  return (
    <Surface as="article" className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{workout.type}</Badge>
          <Badge tone={workout.dataQuality === "complete" ? "neutral" : "quality"}>
            {workout.dataQuality} data
          </Badge>
          {workout.exercises.some((entry) =>
            entry.sets.some((set) => set.failedAttempt),
          ) ? (
            <Badge tone="danger">failed attempt noted</Badge>
          ) : null}
        </div>
        <h3 className="mt-3 text-lg font-bold tracking-[-0.02em]">{workout.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[var(--muted)]">
          <span className="flex items-center gap-1.5">
            {workout.date ? (
              <>
                <MapPin size={13} aria-hidden="true" />{" "}
                {dateFormatter.format(new Date(`${workout.date}T12:00:00`))}
              </>
            ) : (
              <>
                <CircleAlert size={13} aria-hidden="true" /> Date not recorded
              </>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock3 size={13} aria-hidden="true" />
            {workout.startTime
              ? formatWorkoutStartTime(workout.startTime)
              : "Start time not recorded"}
            {workout.durationMinutes !== undefined
              ? ` · ${formatWorkoutDuration(workout.durationMinutes)}`
              : ""}
          </span>
        </div>

        {/* The expander is a button holding only the summary line. */}
        <button
          type="button"
          className="well mt-4 flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[color-mix(in_oklab,var(--surface-3)_80%,var(--ink))]"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={detailId}
        >
          <span className="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-2">
            <span className="min-w-0">
              <span className="eyebrow block">Exercises</span>
              <span className="mt-0.5 block text-sm font-bold">
                {workout.exercises.length}
              </span>
            </span>
            <span className="min-w-0">
              <span className="eyebrow block">Reps</span>
              <span className="mt-0.5 block text-sm font-bold">
                {totals.completedReps}
              </span>
            </span>
            <span className="min-w-0">
              <span className="eyebrow block">Volume</span>
              <span className="mt-0.5 block text-sm font-bold">
                {totals.volumeLb.toLocaleString()} lb
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-[var(--muted)]">
            <span className="sr-only sm:not-sr-only">
              {expanded ? "Hide sets" : "Show sets"}
            </span>
            <span
              className="grid h-9 w-9 place-items-center rounded-sm bg-[var(--surface-2)]"
              aria-hidden="true"
            >
              {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            </span>
          </span>
        </button>
      </div>

      {expanded ? (
        <div id={detailId} className="border-t border-[var(--line)] p-4 sm:p-5">
          {contextScores.length ? (
            <div className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <CloudSun size={15} className="text-[var(--muted)]" aria-hidden="true" />
                <p className="eyebrow">Context · 0–6</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {contextScores.map(([label, value]) => (
                  <Badge key={label} tone="neutral">
                    {label} {value}/6
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-5">
            {workout.exercises.map((exercise) => (
              <section key={`${workout.id}-${exercise.exerciseId}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="text-sm font-bold">{exercise.name}</h4>
                  <span className="text-xs font-semibold text-[var(--muted)]">
                    {calculateCompletedReps(exercise.sets)} completed reps
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {exercise.sets.map((set, index) => (
                    <Badge key={set.id} tone={setTone(set)}>
                      <span className="text-[var(--muted)]">{index + 1}</span>
                      {setLabel(set)}
                      {set.warmup ? " · warm-up" : ""}
                      {set.rampUp ? " · ramp" : ""}
                      {set.failedAttempt ? " · failed" : ""}
                    </Badge>
                  ))}
                </div>
                {exercise.notes ? (
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                    {exercise.notes}
                  </p>
                ) : null}
              </section>
            ))}
          </div>

          {workout.notes ? (
            <div className="well mt-5 flex gap-3 p-4">
              <Gauge
                size={17}
                className="mt-0.5 shrink-0 text-[var(--warn)]"
                aria-hidden="true"
              />
              <p className="text-xs leading-5 text-[var(--muted)]">{workout.notes}</p>
            </div>
          ) : null}
          {actions ? (
            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-4">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
}
