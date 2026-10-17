import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Gauge,
  Info,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ScoreControl } from "../components/ScoreControl";
import {
  Badge,
  Button,
  ButtonLink,
  PageHeader,
  SectionHeading,
  SegmentedControl,
  Surface,
} from "../components/ui";
import { suggestionToSearch } from "../lib/planHandoff";
import type { Scale0To6, WorkoutType } from "../lib/types";
import {
  DEFAULT_READINESS_SCORES,
  suggestWorkout,
  WORKOUT_DURATION_OPTIONS,
  type WorkoutDurationMinutes,
} from "../lib/workoutSuggestions";

const initialReadiness = DEFAULT_READINESS_SCORES;

const workoutTypes: WorkoutType[] = ["push", "pull", "legs", "full-body"];

// Outcomes use the semantic tokens, never the accent.
function readinessColor(level: string): string {
  switch (level) {
    case "high":
      return "var(--good)";
    case "moderate":
      return "var(--info)";
    case "low":
      return "var(--warn)";
    default:
      return "var(--bad)";
  }
}

export default function Suggested() {
  const [readiness, setReadiness] = useState(initialReadiness);
  const [duration, setDuration] = useState<WorkoutDurationMinutes>(45);
  const [lastWorkoutType, setLastWorkoutType] = useState<WorkoutType>("push");
  const [requestedType, setRequestedType] = useState<WorkoutType | "auto">("auto");

  const suggestion = useMemo(
    () =>
      suggestWorkout(
        {
          ...readiness,
          lastWorkoutType,
          daysSinceLastWorkout: 0,
        },
        {
          desiredDurationMinutes: duration,
          requestedType: requestedType === "auto" ? undefined : requestedType,
        },
      ),
    [duration, lastWorkoutType, readiness, requestedType],
  );

  function setScore(key: keyof typeof readiness, value: Scale0To6) {
    setReadiness((current) => ({ ...current, [key]: value }));
  }

  return (
    <>
      <PageHeader
        eyebrow="Planning"
        title="Session builder"
        description="Rate each signal from 0–6. The rules below adjust exercise choice and volume, then say exactly why."
        actions={
          <Button
            onClick={() => {
              setReadiness(initialReadiness);
              setDuration(45);
              setRequestedType("auto");
            }}
          >
            <RotateCcw size={15} aria-hidden="true" /> Reset
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(26rem,1.12fr)]">
        <div>
          <SectionHeading
            title="Readiness check"
            description="Unknown is different from zero. These controls deliberately record a real score."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <ScoreControl
              id="energy-score"
              label="Energy"
              value={readiness.energy}
              onChange={(value) => setScore("energy", value)}
              lowLabel="empty"
              highLabel="excellent"
            />
            <ScoreControl
              id="sleep-score"
              label="Sleep quality"
              value={readiness.sleepQuality}
              onChange={(value) => setScore("sleepQuality", value)}
              lowLabel="very poor"
              highLabel="excellent"
            />
            <ScoreControl
              id="soreness-score"
              label="Soreness"
              value={readiness.soreness}
              onChange={(value) => setScore("soreness", value)}
              lowLabel="none"
              highLabel="very high"
              direction="negative"
            />
            <ScoreControl
              id="appetite-score"
              label="Appetite"
              value={readiness.appetite}
              onChange={(value) => setScore("appetite", value)}
              lowLabel="very low"
              highLabel="strong"
            />
            <ScoreControl
              id="illness-score"
              label="Illness impact"
              value={readiness.illness}
              onChange={(value) => setScore("illness", value)}
              lowLabel="none"
              highLabel="severe"
              direction="negative"
            />
            <ScoreControl
              id="travel-score"
              label="Travel impact"
              value={readiness.travelImpact}
              onChange={(value) => setScore("travelImpact", value)}
              lowLabel="none"
              highLabel="major"
              direction="negative"
            />
            <ScoreControl
              id="back-score"
              label="Back pain"
              value={readiness.backPain}
              onChange={(value) => setScore("backPain", value)}
              lowLabel="none"
              highLabel="severe"
              direction="negative"
            />
            <ScoreControl
              id="pain-score"
              label="General pain"
              value={readiness.generalPain}
              onChange={(value) => setScore("generalPain", value)}
              lowLabel="none"
              highLabel="severe"
              direction="negative"
            />
          </div>

          <Surface className="mt-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="label">Previous workout</span>
                <select
                  className="field"
                  value={lastWorkoutType}
                  onChange={(event) =>
                    setLastWorkoutType(event.target.value as WorkoutType)
                  }
                >
                  {["push", "pull", "legs", "full-body", "upper", "other"].map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Session type</span>
                <select
                  className="field"
                  value={requestedType}
                  onChange={(event) =>
                    setRequestedType(event.target.value as WorkoutType | "auto")
                  }
                >
                  <option value="auto">Auto · continue rotation</option>
                  {workoutTypes.map((type) => (
                    <option key={type} value={type}>
                      Override · {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4">
              <span className="label" id="duration-label">
                Time available
              </span>
              <SegmentedControl
                block
                label="Time available"
                options={WORKOUT_DURATION_OPTIONS.map((minutes) => ({
                  value: minutes,
                  label: `${minutes}m`,
                }))}
                value={duration}
                onChange={setDuration}
              />
            </div>
          </Surface>
        </div>

        <div>
          <SectionHeading
            title="Today’s plan"
            description="A deterministic suggestion—not an AI coach claim."
          />
          <Surface raised className="surface-feature overflow-hidden">
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="accent">
                      <Sparkles size={12} aria-hidden="true" /> {suggestion.sessionType}
                    </Badge>
                    <Badge tone="accent">
                      <Clock3 size={12} aria-hidden="true" />{" "}
                      {suggestion.desiredDurationMinutes} min
                    </Badge>
                  </div>
                  <h2 className="mt-5 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">
                    {suggestion.title}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
                    Volume is set to {Math.round(suggestion.volumeMultiplier * 100)}% of
                    the standard template based on the recorded readiness signals.
                  </p>
                </div>
                <div
                  className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full border-[10px] border-[var(--surface-3)]"
                  role="img"
                  aria-label={`Readiness ${suggestion.readiness.score} of 6, ${suggestion.readiness.level}`}
                >
                  <div
                    className="absolute inset-[-10px] rounded-full border-[10px] border-transparent"
                    style={{
                      borderTopColor: readinessColor(suggestion.readiness.level),
                      transform: `rotate(${Math.round((suggestion.readiness.score / 6) * 260 - 130)}deg)`,
                    }}
                  />
                  <div className="text-center">
                    <p className="text-2xl font-extrabold">
                      {suggestion.readiness.score}
                    </p>
                    <p className="text-xs font-bold text-[var(--muted)]">of 6</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
                <span className="text-xs font-bold capitalize">
                  {suggestion.readiness.level} readiness
                </span>
                <span
                  className="h-1 w-1 rounded-full bg-[var(--muted)]"
                  aria-hidden="true"
                />
                <span className="text-xs text-[var(--muted)]">
                  {requestedType === "auto"
                    ? `Rotated from ${lastWorkoutType}`
                    : "Session type overridden by you"}
                </span>
              </div>
            </div>
          </Surface>

          {suggestion.warnings.length ? (
            <Surface className="surface-danger mt-3 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert
                  size={18}
                  className="mt-0.5 shrink-0 text-[var(--bad)]"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-bold">Safety adjustment</p>
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--muted)]">
                    {suggestion.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Surface>
          ) : null}

          <div className="mt-4 space-y-2">
            {suggestion.exercises.map((exercise, index) => (
              <Surface key={`${exercise.exerciseId}-${index}`} className="p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-[var(--surface-3)] text-xs font-bold"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold">{exercise.name}</h3>
                      {exercise.optional ? <Badge tone="quality">optional</Badge> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[var(--muted)]">
                      <span>{exercise.sets} sets</span>
                      {exercise.repRange ? (
                        <span>
                          {exercise.repRange[0]}–{exercise.repRange[1]} reps
                        </span>
                      ) : exercise.durationRangeSeconds ? (
                        <span>
                          {exercise.durationRangeSeconds[0]}–
                          {exercise.durationRangeSeconds[1]} sec
                        </span>
                      ) : null}
                      {exercise.weightLb ? <span>{exercise.weightLb} lb</span> : null}
                      <span>
                        {exercise.rirRange[0]}–{exercise.rirRange[1]} RIR
                      </span>
                    </div>
                    {exercise.notes ? (
                      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                        {exercise.notes}
                      </p>
                    ) : null}
                  </div>
                </div>
              </Surface>
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <Surface className="p-4">
              <div className="flex items-center gap-2">
                <Gauge size={16} className="text-[var(--accent)]" aria-hidden="true" />
                <p className="text-sm font-bold">Why this changed</p>
              </div>
              <ul className="mt-3 space-y-2">
                {suggestion.reasons.map((reason) => (
                  <li
                    key={reason}
                    className="flex items-start gap-2 text-xs leading-5 text-[var(--muted)]"
                  >
                    <Info size={13} className="mt-1 shrink-0" aria-hidden="true" />
                    {reason}
                  </li>
                ))}
              </ul>
            </Surface>
            <Surface className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  size={16}
                  className="text-[var(--accent)]"
                  aria-hidden="true"
                />
                <p className="text-sm font-bold">Session guardrails</p>
              </div>
              <ul className="mt-3 space-y-2">
                {suggestion.guardrails.map((guardrail) => (
                  <li
                    key={guardrail}
                    className="flex items-start gap-2 text-xs leading-5 text-[var(--muted)]"
                  >
                    <CheckCircle2
                      size={13}
                      className="mt-1 shrink-0"
                      aria-hidden="true"
                    />
                    {guardrail}
                  </li>
                ))}
              </ul>
            </Surface>
          </div>

          {suggestion.exercises.length ? (
            <ButtonLink
              to={`/add${suggestionToSearch(suggestion)}`}
              variant="primary"
              className="mt-4 w-full sm:w-auto"
            >
              <Dumbbell size={16} aria-hidden="true" /> Start with this plan{" "}
              <ArrowRight size={15} aria-hidden="true" />
            </ButtonLink>
          ) : null}
        </div>
      </div>

      <Surface className="mt-6 flex items-start gap-3 border-dashed p-4">
        <AlertTriangle
          size={17}
          className="mt-0.5 shrink-0 text-[var(--warn)]"
          aria-hidden="true"
        />
        <p className="text-xs leading-5 text-[var(--muted)]">
          Stop for sharp pain or concerning symptoms. Do not train through severe illness.
          This planner provides general organizational guidance, not medical advice or
          individualized coaching.
        </p>
      </Surface>
    </>
  );
}
