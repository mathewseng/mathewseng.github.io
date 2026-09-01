import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  CloudSun,
  Gauge,
  MapPin,
} from "lucide-react";
import { useState } from "react";

import { calculateCompletedReps, calculateWorkoutTotals } from "../lib/calculations";
import type { ExerciseSet, Workout } from "../lib/types";
import { formatWorkoutDuration, formatWorkoutStartTime } from "../lib/workoutTime";
import { Badge, Surface } from "./ui";

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

function setTone(set: ExerciseSet): "accent" | "warm" | "danger" | "quality" {
  if (set.failedAttempt) return "danger";
  if (set.warmup || set.rampUp) return "warm";
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
      <button
        type="button"
        className="w-full p-4 text-left sm:p-5"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
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
            <h3 className="mt-3 text-lg font-black tracking-[-0.025em]">
              {workout.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[var(--muted)]">
              <span className="flex items-center gap-1.5">
                {workout.date ? (
                  <>
                    <MapPin size={13} />{" "}
                    {dateFormatter.format(new Date(`${workout.date}T12:00:00`))}
                  </>
                ) : (
                  <>
                    <CircleAlert size={13} /> Date not recorded
                  </>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock3 size={13} />
                {workout.startTime
                  ? formatWorkoutStartTime(workout.startTime)
                  : "Start time not recorded"}
                {workout.durationMinutes !== undefined
                  ? ` · ${formatWorkoutDuration(workout.durationMinutes)}`
                  : ""}
              </span>
            </div>
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-soft)] text-[var(--muted)]">
            {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-[var(--surface-soft)] p-3">
            <p className="eyebrow">Exercises</p>
            <p className="mt-1 text-sm font-black">{workout.exercises.length}</p>
          </div>
          <div className="rounded-xl bg-[var(--surface-soft)] p-3">
            <p className="eyebrow">Completed reps</p>
            <p className="mt-1 text-sm font-black">{totals.completedReps}</p>
          </div>
          <div className="rounded-xl bg-[var(--surface-soft)] p-3">
            <p className="eyebrow">Known volume</p>
            <p className="mt-1 text-sm font-black">
              {totals.volumeLb.toLocaleString()} lb
            </p>
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-[var(--line)] p-4 sm:p-5">
          {contextScores.length ? (
            <div className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <CloudSun size={15} className="text-[var(--muted)]" />
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
                  <h4 className="text-sm font-extrabold">{exercise.name}</h4>
                  <span className="text-[0.68rem] font-semibold text-[var(--muted)]">
                    {calculateCompletedReps(exercise.sets)} completed reps
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {exercise.sets.map((set, index) => (
                    <Badge key={set.id} tone={setTone(set)}>
                      <span className="text-[var(--faint)]">{index + 1}</span>
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
            <div className="mt-5 flex gap-3 rounded-2xl bg-[var(--surface-soft)] p-4">
              <Gauge size={17} className="mt-0.5 shrink-0 text-[var(--orange)]" />
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
