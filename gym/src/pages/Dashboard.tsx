import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Dumbbell,
  Flame,
  HeartPulse,
  Plus,
  Scale,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";

import ProgressChart, { type ChartPoint } from "../components/ProgressChart";
import WorkoutCalendar from "../components/WorkoutCalendar";
import {
  ActionBar,
  Badge,
  ButtonLink,
  MetricCard,
  PageHeader,
  ProgressBar,
  SectionHeading,
  Surface,
} from "../components/ui";
import { goals } from "../data/goals";
import { profile } from "../data/profile";
import { compareWorkoutsNewestFirst } from "../data/workouts";
import { getWeeklyTrainingFrequency } from "../lib/calculations";
import { localToday } from "../lib/formUtils";
import { getBestTrainingWeek, getExercisePersonalRecords } from "../lib/personalRecords";
import { suggestionToSearch } from "../lib/planHandoff";
import { getExerciseProgression } from "../lib/progression";
import type { Goal, Workout } from "../lib/types";
import { DEFAULT_READINESS_SCORES, suggestWorkout } from "../lib/workoutSuggestions";
import { useAppState } from "../state/AppState";

const SMITH = { machineId: "primary-smith-machine" };
const DAY_MS = 86_400_000;

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const longDate = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function noonOf(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function capitalise(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

function pointLabel(workout: { date?: string; chronologyIndex: number }): string {
  return workout.date
    ? shortDate.format(noonOf(workout.date))
    : `#${workout.chronologyIndex}`;
}

/** Dated sessions in the four Monday-start weeks ending with the latest log's week. */
function recentSessionCount(workouts: Workout[], latestDate: string | undefined) {
  if (!latestDate) return 0;
  const weeks = getWeeklyTrainingFrequency(workouts);
  const latestWeek = weeks.at(-1)?.weekStart;
  if (!latestWeek) return 0;
  const cutoff = new Date(`${latestWeek}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 21);
  const from = cutoff.toISOString().slice(0, 10);
  return weeks
    .filter((week) => week.weekStart >= from)
    .reduce((total, week) => total + week.workoutCount, 0);
}

function nextMilestone(goal: Goal): string | undefined {
  return goal.milestones?.find((milestone) => !milestone.achieved)?.label;
}

function GoalRow({ goal }: { goal: Goal }) {
  const current = goal.currentValue ?? 0;
  const target = goal.targetValue ?? 1;
  const percent = Math.min(100, Math.round((current / target) * 100));
  const next = nextMilestone(goal);
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold">{goal.title}</h3>
          {next ? <p className="mt-1 text-xs text-[var(--muted)]">Next: {next}</p> : null}
        </div>
        <span className="text-sm font-bold">{percent}%</span>
      </div>
      <ProgressBar
        className="mt-3"
        value={current}
        max={target}
        label={`${goal.title} progress`}
        start={`${current} ${goal.unit ?? ""}`.trim()}
        end={`${target} ${goal.unit ?? ""}`.trim()}
      />
    </div>
  );
}

export default function Dashboard() {
  const { workouts, nutritionEntries } = useAppState();
  // Read once per visit: the suggestion depends on the days since the last log.
  const [today] = useState(localToday);

  const data = useMemo(() => {
    const dated = workouts
      .filter((workout) => workout.date)
      .sort(compareWorkoutsNewestFirst);
    const latest = dated[0];
    const daysSinceLatest = latest?.date
      ? Math.max(
          0,
          Math.round((noonOf(today).getTime() - noonOf(latest.date).getTime()) / DAY_MS),
        )
      : undefined;

    const suggestion = suggestWorkout(
      {
        ...DEFAULT_READINESS_SCORES,
        lastWorkoutType: latest?.type,
        daysSinceLastWorkout: daysSinceLatest,
      },
      { desiredDurationMinutes: 45 },
    );

    const [bench] = getExercisePersonalRecords(workouts, "smith-flat-bench", SMITH);
    const [pullUps] = getExercisePersonalRecords(workouts, "strict-pull-up");
    const benchPoints = getExerciseProgression(workouts, "smith-flat-bench", SMITH);
    const pullUpPoints = getExerciseProgression(workouts, "strict-pull-up");

    const benchChart: ChartPoint[] = benchPoints
      .filter((point) => point.estimatedOneRepMaxLb !== undefined)
      .map((point) => ({
        label: pointLabel(point),
        value: point.estimatedOneRepMaxLb,
        secondary: point.bestWeightLb,
        context: point.failedAttempts
          ? `${point.failedAttempts} failed attempt${point.failedAttempts === 1 ? "" : "s"} excluded.`
          : undefined,
      }));
    const pullUpChart: ChartPoint[] = pullUpPoints.map((point) => ({
      label: pointLabel(point),
      value: point.bestSetReps,
      secondary: point.completedReps,
      context: point.date ? undefined : "Exact date was not recorded.",
    }));

    const latestWeight = [...nutritionEntries]
      .filter((entry) => entry.bodyWeightLb !== undefined)
      .sort((left, right) => right.date.localeCompare(left.date))[0];

    return {
      latest,
      daysSinceLatest,
      suggestion,
      bench,
      pullUps,
      benchChart,
      pullUpChart,
      latestWeight,
      recentSessions: recentSessionCount(workouts, latest?.date),
      bestWeek: getBestTrainingWeek(workouts),
      undatedCount: workouts.length - dated.length,
    };
  }, [nutritionEntries, today, workouts]);

  const {
    latest,
    daysSinceLatest,
    suggestion,
    bench,
    pullUps,
    benchChart,
    pullUpChart,
    latestWeight,
    recentSessions,
    bestWeek,
    undatedCount,
  } = data;

  const numericGoals = goals.filter(
    (goal) => goal.currentValue !== undefined && goal.targetValue !== undefined,
  );
  const benchSet = bench?.bestSuccessfulSet;
  const pullUpSet = pullUps?.bestSuccessfulSet;
  const planned = suggestion.exercises.filter((exercise) => !exercise.optional);
  const rirLow = Math.min(...planned.map((exercise) => exercise.rirRange[0]));
  const rirHigh = Math.max(...planned.map((exercise) => exercise.rirRange[1]));
  const keyReason =
    suggestion.reasons.find((reason) => reason.includes("gap")) ?? suggestion.reasons[0];
  const plannedType = suggestion.workoutType;

  return (
    <>
      <PageHeader
        eyebrow={
          latest?.date
            ? `${longDate.format(noonOf(latest.date))} · Latest log`
            : "Undated training history"
        }
        title="Dashboard"
        actions={
          <>
            <ButtonLink to="/suggested" className="hidden lg:inline-flex">
              <Sparkles size={16} aria-hidden="true" /> Build next session
            </ButtonLink>
            <ButtonLink to="/add" variant="primary" className="hidden lg:inline-flex">
              <Plus size={16} aria-hidden="true" /> Log workout
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.75fr)]">
        <Surface raised className="surface-feature relative overflow-hidden p-5 sm:p-7">
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">
                <HeartPulse size={12} aria-hidden="true" /> Recovery-aware
              </Badge>
              {latest && plannedType ? (
                <Badge tone="accent">
                  {capitalise(latest.type)} → {capitalise(plannedType)} next
                </Badge>
              ) : null}
            </div>
            <div className="mt-6 max-w-xl">
              <p className="eyebrow-accent">Suggested next session</p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">
                {suggestion.title}
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-[var(--muted)]">
                {latest
                  ? `Last logged: ${latest.title}${
                      daysSinceLatest !== undefined
                        ? `, ${daysSinceLatest === 0 ? "today" : `${daysSinceLatest} day${daysSinceLatest === 1 ? "" : "s"} ago`}`
                        : ""
                    }. `
                  : ""}
                {keyReason}
              </p>
            </div>
            <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-6">
              <div className="flex items-center gap-4 sm:gap-5">
                <div>
                  <p className="text-2xl font-extrabold">
                    {suggestion.desiredDurationMinutes}
                  </p>
                  <p className="eyebrow">minutes</p>
                </div>
                <div className="h-9 w-px bg-[var(--line-strong)]" aria-hidden="true" />
                <div>
                  <p className="text-2xl font-extrabold">{suggestion.exercises.length}</p>
                  <p className="eyebrow">exercises</p>
                </div>
                {planned.length ? (
                  <>
                    <div
                      className="h-9 w-px bg-[var(--line-strong)]"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-2xl font-extrabold">
                        {rirLow}–{rirHigh}
                      </p>
                      <p className="eyebrow">target RIR</p>
                    </div>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink
                  to="/suggested"
                  variant="ghost"
                  className="hidden lg:inline-flex"
                >
                  Tune readiness
                </ButtonLink>
                {suggestion.exercises.length ? (
                  <ButtonLink to={`/add${suggestionToSearch(suggestion)}`}>
                    Start with this plan <ArrowRight size={16} aria-hidden="true" />
                  </ButtonLink>
                ) : null}
              </div>
            </div>
          </div>
        </Surface>

        <section aria-labelledby="dashboard-goals">
          <Surface className="flex h-full flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 id="dashboard-goals" className="text-lg font-bold tracking-[-0.02em]">
                Nearest milestones
              </h2>
              <Trophy size={17} className="text-[var(--warn)]" aria-hidden="true" />
            </div>
            {numericGoals.map((goal) => (
              <GoalRow key={goal.id} goal={goal} />
            ))}
            <ButtonLink
              to="/goals"
              variant="ghost"
              block
              className="mt-auto justify-between"
            >
              View every goal <ChevronRight size={15} aria-hidden="true" />
            </ButtonLink>
          </Surface>
        </section>
      </section>

      <section
        aria-label="Key numbers"
        className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <MetricCard
          label="Best bench set"
          value={
            benchSet?.weightLb !== undefined
              ? `${benchSet.weightLb} × ${benchSet.reps}`
              : "—"
          }
          detail={
            benchSet?.date
              ? `Smith machine · ${shortDate.format(noonOf(benchSet.date))}`
              : "Smith machine"
          }
          icon={Dumbbell}
          accent="var(--accent-soft)"
        />
        <MetricCard
          label="Pull-up best set"
          value={pullUpSet ? `${pullUpSet.reps} reps` : "—"}
          detail={
            pullUps?.bestSessionCompletedReps
              ? `${pullUps.bestSessionCompletedReps.value} in the best session`
              : undefined
          }
          icon={Flame}
        />
        <MetricCard
          label="Last 4 weeks"
          value={`${recentSessions} session${recentSessions === 1 ? "" : "s"}`}
          detail={
            bestWeek
              ? `Best week: ${bestWeek.workoutCount} (from ${shortDate.format(noonOf(bestWeek.weekStart))})`
              : undefined
          }
          icon={CalendarDays}
        />
        <MetricCard
          label="Body weight"
          value={`${latestWeight?.bodyWeightLb ?? profile.bodyWeightLb} lb`}
          detail={
            latestWeight
              ? `Logged ${shortDate.format(noonOf(latestWeight.date))}`
              : "From the training profile"
          }
          icon={Scale}
        />
      </section>

      <section className="mt-8 grid gap-4 xl:grid-cols-2">
        <div className="min-w-0">
          <SectionHeading
            title="Training calendar"
            description={
              undatedCount
                ? `${undatedCount} undated sessions stay in the history without invented dates.`
                : undefined
            }
          />
          <WorkoutCalendar
            workouts={workouts}
            nutritionEntries={nutritionEntries}
            compact
          />
        </div>
        <div className="min-w-0">
          <SectionHeading
            title="Progress"
            description="Unknown values stay blank; hover or focus a point for its context."
            action={
              <ButtonLink to="/exercises" variant="ghost" className="shrink-0">
                All exercises <ChevronRight size={14} aria-hidden="true" />
              </ButtonLink>
            }
          />
          <div className="grid gap-4">
            <ProgressChart
              title="Smith bench estimated 1RM"
              description="Epley estimate from the best completed set; not a tested maximum."
              data={benchChart}
              valueSuffix="lb estimated"
              secondaryLabel="Top-set load (lb)"
              height={190}
            />
            <ProgressChart
              title="Strict pull-ups"
              description="Best set and session total; set counts differ between sessions."
              data={pullUpChart}
              valueSuffix="best-set reps"
              secondaryLabel="Session total"
              height={190}
            />
          </div>
        </div>
      </section>

      <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-[var(--muted)]">
        <CircleAlert size={14} aria-hidden="true" />
        Data stays in this browser and does not sync.
        <ButtonLink to="/settings" variant="ghost" size="sm">
          Back up your entries
        </ButtonLink>
      </p>

      <ActionBar className="lg:hidden" label="Primary actions">
        <ButtonLink to="/suggested" variant="ghost">
          <Sparkles size={16} aria-hidden="true" /> Plan session
        </ButtonLink>
        <ButtonLink to="/add" variant="primary">
          <Plus size={16} aria-hidden="true" /> Log workout
        </ButtonLink>
      </ActionBar>
    </>
  );
}
