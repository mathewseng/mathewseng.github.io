import {
  ArrowRight,
  Check,
  Circle,
  Dumbbell,
  Footprints,
  HeartPulse,
  Shield,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";

import { Badge, ButtonLink, PageHeader, ProgressBar, Surface } from "../components/ui";
import { goals } from "../data/goals";

const goalIcons = {
  "bench-body-weight": Trophy,
  "ten-strict-pullups": Target,
  "build-muscle": Dumbbell,
  "carry-partner": Sparkles,
  "consistent-ppl": Footprints,
  "back-safe-legs": Shield,
};

export default function Goals() {
  return (
    <>
      <PageHeader
        title="Goals & milestones"
        description="Each goal has a definition of success, a visible next step, and enough context to keep progress honest."
        actions={
          <ButtonLink to="/suggested" variant="primary">
            <HeartPulse size={16} aria-hidden="true" /> Plan next session
          </ButtonLink>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {goals.map((goal) => {
          const Icon = goalIcons[goal.id as keyof typeof goalIcons] ?? Target;
          const hasNumericProgress =
            goal.currentValue !== undefined &&
            goal.targetValue !== undefined &&
            goal.targetValue > 0;
          const percent = hasNumericProgress
            ? Math.min(100, Math.round((goal.currentValue! / goal.targetValue!) * 100))
            : undefined;

          return (
            <Surface key={goal.id} as="article" className="flex flex-col overflow-hidden">
              <div className="flex-1 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="accent">{goal.category}</Badge>
                      <Badge tone={goal.status === "limited" ? "warn" : "neutral"}>
                        {goal.status.replaceAll("-", " ")}
                      </Badge>
                    </div>
                    <h2 className="mt-4 text-xl font-bold tracking-[-0.02em]">
                      {goal.title}
                    </h2>
                  </div>
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[var(--surface-3)]"
                    aria-hidden="true"
                  >
                    <Icon size={19} />
                  </span>
                </div>

                {hasNumericProgress ? (
                  <div className="mt-6">
                    <div className="flex items-end justify-between gap-4">
                      <p className="text-3xl font-extrabold tracking-[-0.04em]">
                        {goal.currentValue}
                        <span className="ml-1 text-sm text-[var(--muted)]">
                          {goal.unit}
                        </span>
                      </p>
                      <p className="text-sm font-bold">{percent}%</p>
                    </div>
                    <ProgressBar
                      className="mt-3"
                      size="lg"
                      value={goal.currentValue ?? 0}
                      max={goal.targetValue ?? 1}
                      label={`${goal.title} progress`}
                      end={`Target: ${goal.targetValue} ${goal.unit}`}
                    />
                  </div>
                ) : (
                  <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
                    {goal.notes}
                  </p>
                )}

                {goal.milestones?.length ? (
                  <div className="mt-6">
                    <p className="text-xs font-semibold text-[var(--muted)]">
                      Milestone ladder
                    </p>
                    <ol className="mt-3 space-y-2">
                      {goal.milestones.slice(0, 5).map((milestone, index) => (
                        <li
                          key={milestone.id}
                          className="well flex items-center gap-3 px-3 py-2.5"
                        >
                          {milestone.achieved ? (
                            <span
                              className="grid h-6 w-6 place-items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)]"
                              aria-hidden="true"
                            >
                              <Check size={13} />
                            </span>
                          ) : (
                            <span
                              className="grid h-6 w-6 place-items-center rounded-full border border-[var(--line-strong)] text-xs font-bold text-[var(--muted)]"
                              aria-hidden="true"
                            >
                              {index + 1}
                            </span>
                          )}
                          <span className="text-xs font-bold">
                            {milestone.achieved ? (
                              <span className="sr-only">Achieved: </span>
                            ) : null}
                            {milestone.label}
                          </span>
                        </li>
                      ))}
                    </ol>
                    {goal.milestones.length > 5 ? (
                      <p className="mt-2 text-xs font-semibold text-[var(--muted)]">
                        +{goal.milestones.length - 5} later milestones
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="border-t border-[var(--line)] bg-[var(--surface-3)] p-4 sm:px-6">
                <div className="flex items-start gap-3">
                  <Circle
                    size={14}
                    className="mt-0.5 shrink-0 fill-[var(--accent)] text-[var(--accent)]"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--muted)]">
                      Next action
                    </p>
                    <p className="mt-1 text-xs leading-5">
                      {goal.progressionRules?.[0] ??
                        goal.safetyNotes?.[0] ??
                        goal.notes ??
                        "Keep the next session specific and measurable."}
                    </p>
                  </div>
                </div>
              </div>
            </Surface>
          );
        })}
      </div>

      <Surface className="mt-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold">A goal is not a daily grade.</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Travel, illness, back symptoms, and recovery sessions are part of the
            timeline—not failed milestones.
          </p>
        </div>
        <ButtonLink to="/suggested" className="shrink-0">
          Turn a goal into a session <ArrowRight size={15} aria-hidden="true" />
        </ButtonLink>
      </Surface>
    </>
  );
}
