import {
  ArrowRight,
  BarChart3,
  CalendarCheck2,
  ChevronRight,
  CircleAlert,
  Dumbbell,
  Flame,
  Gauge,
  HeartPulse,
  Plus,
  Sparkles,
  Trophy,
  TrendingUp,
} from "lucide-react";

import ProgressChart from "../components/ProgressChart";
import WorkoutCalendar from "../components/WorkoutCalendar";
import { Badge, MetricCard, PageHeader, SectionHeading, Surface } from "../components/ui";
import { benchGoal, goals } from "../data/goals";
import { compareWorkoutsNewestFirst, workouts as seedWorkouts } from "../data/workouts";
import type { Workout } from "../lib/types";
import { Link } from "../router";
import { useAppState } from "../state/AppState";

const benchProgress = [
  { label: "Jul 14", value: 19, secondary: 1805 },
  { label: "Jul 16", value: 20, secondary: 1900 },
  {
    label: "Jul 27",
    value: 5,
    secondary: 475,
    context: "Single 95 lb ramp-up set during mild illness; not a matched test.",
  },
];

const inclineProgress = [
  { label: "Early", value: 7 },
  { label: "Jul 14", value: 8 },
  { label: "Jul 16", value: 11 },
  {
    label: "Jul 27",
    value: 10,
    context: "65 lb top set after travel; best recorded incline top set.",
  },
];

const benchEstimateProgress = [
  { label: "Jul 14", value: 117.2, secondary: 95 },
  { label: "Jul 16", value: 117.2, secondary: 95 },
  {
    label: "Jul 27",
    value: 110.8,
    secondary: 95,
    context: "Estimated from a single ramp-up top set during mild illness.",
  },
];

const pullUpProgress = [
  {
    label: "Baseline",
    value: 5,
    secondary: 13,
    context: "Exact date was not recorded.",
  },
];

const pushdownProgress = [
  {
    label: "Travel return",
    value: 23,
    secondary: 690,
    context: "Exact date was not recorded.",
  },
  { label: "Jul 27", value: 30, secondary: 900 },
];

function recentTrainingWeeks(workouts: Workout[]) {
  const dated = workouts
    .filter((workout): workout is Workout & { date: string } => Boolean(workout.date))
    .sort((left, right) => left.date.localeCompare(right.date));
  const anchor = dated.length
    ? new Date(`${dated[dated.length - 1]?.date ?? "2026-07-28"}T12:00:00`)
    : new Date("2026-07-28T12:00:00");
  const anchorMonday = new Date(anchor);
  const anchorDay = anchorMonday.getDay();
  anchorMonday.setDate(anchorMonday.getDate() - (anchorDay === 0 ? 6 : anchorDay - 1));

  return Array.from({ length: 6 }, (_, index) => {
    const start = new Date(anchorMonday);
    start.setDate(start.getDate() - (5 - index) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const count = dated.filter((workout) => {
      const workoutDate = new Date(`${workout.date}T12:00:00`);
      return workoutDate >= start && workoutDate < end;
    }).length;
    return {
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(start),
      count,
    };
  });
}

function GoalMiniCard({
  title,
  current,
  target,
  unit,
  detail,
}: {
  title: string;
  current: number;
  target: number;
  unit: string;
  detail: string;
}) {
  const percent = Math.min(100, Math.round((current / target) * 100));
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold">{title}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>
        </div>
        <span className="text-sm font-black">{percent}%</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]">
        <div
          className="h-full rounded-full bg-[var(--accent)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[0.67rem] font-bold text-[var(--muted)]">
        <span>
          {current} {unit}
        </span>
        <span>
          {target} {unit}
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { workouts, nutritionEntries } = useAppState();
  const latestWorkout =
    workouts.filter((workout) => workout.date).sort(compareWorkoutsNewestFirst)[0] ??
    seedWorkouts[seedWorkouts.length - 1];
  const goalCount = goals.filter((goal) => goal.status === "in-progress").length;
  const trainingWeeks = recentTrainingWeeks(workouts);
  const latestDateLabel = latestWorkout?.date
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date(`${latestWorkout.date}T12:00:00`))
    : "Undated training history";
  const benchCurrent = benchGoal.currentValue ?? 115;
  const benchTarget = benchGoal.targetValue ?? 145;
  const benchPercent = Math.min(100, Math.round((benchCurrent / benchTarget) * 100));
  const benchRemaining = Math.max(0, benchTarget - benchCurrent);

  return (
    <>
      <PageHeader
        eyebrow={`${latestDateLabel} · Latest log`}
        title="Build the next rep."
        description="Your dashboard keeps performance and context together, so one hard day never gets mistaken for a trend."
        actions={
          <>
            <Link to="/suggested" className="button-secondary">
              <Sparkles size={16} /> Build next session
            </Link>
            <Link to="/add" className="button-primary">
              <Plus size={16} /> Log workout
            </Link>
          </>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.7fr)]">
        <Surface
          raised
          className="relative min-h-[20rem] overflow-hidden bg-[var(--accent)] p-5 text-[var(--accent-ink)] sm:min-h-[22rem] sm:p-7"
        >
          <div
            className="absolute inset-y-0 right-0 w-1/2 opacity-15 dot-grid"
            aria-hidden="true"
          />
          <div className="relative flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="!border-white/15 !bg-white/10 !text-current">
                <HeartPulse size={12} /> Recovery-aware
              </Badge>
              <Badge className="!border-white/15 !bg-white/10 !text-current">
                Push → Pull next
              </Badge>
            </div>
            <div className="mt-8 max-w-xl sm:mt-10">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] opacity-70">
                Suggested next session
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.055em] sm:text-5xl">
                Pull, with room in the tank.
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-6 opacity-75">
                Start with five submaximal pull-up sets around 3 reps. Add only one clean
                rep across the session, then use supported rows and pulldowns.
              </p>
            </div>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-4 pt-8">
              <div className="flex items-center gap-5">
                <div>
                  <p className="text-2xl font-black">45</p>
                  <p className="text-[0.66rem] font-bold uppercase tracking-wide opacity-65">
                    minutes
                  </p>
                </div>
                <div className="h-9 w-px bg-current opacity-20" />
                <div>
                  <p className="text-2xl font-black">3–4</p>
                  <p className="text-[0.66rem] font-bold uppercase tracking-wide opacity-65">
                    target RIR
                  </p>
                </div>
              </div>
              <Link
                to="/suggested"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent-ink)] px-4 text-sm font-extrabold text-[var(--accent)]"
              >
                Tune readiness <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </Surface>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Surface className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Bench trajectory</p>
                <h2 className="mt-1 text-lg font-black">
                  {benchCurrent} → {benchTarget} lb
                </h2>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--acid-soft)]">
                <Trophy size={18} />
              </span>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-[var(--surface-soft)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${benchPercent}%` }}
              />
            </div>
            <div className="mt-3 flex items-start justify-between gap-3 text-xs">
              <span className="text-[var(--muted)]">Confirmed single</span>
              <strong>{benchRemaining} lb to goal</strong>
            </div>
            <div className="mt-4 rounded-2xl bg-[var(--surface-soft)] p-3">
              <p className="text-xs font-extrabold">Next controlled checkpoint</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Reach at least 21 total reps at 95 lb; build toward 8 / 8 / 8 before the
                10 lb jump.
              </p>
            </div>
          </Surface>

          <Surface className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">July 27 context</p>
                <h2 className="mt-1 text-lg font-black">Return, don’t regress</h2>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-orange-500/12 text-[var(--orange)]">
                <Gauge size={18} />
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              Travel and mild illness make July 27 a contextual session—not proof of
              strength loss.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="warm">recent travel</Badge>
              <Badge tone="warm">mild illness</Badge>
              <Badge tone="quality">scores not quantified</Badge>
            </div>
          </Surface>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Bench single"
          value="115 lb"
          detail="Confirmed · Smith machine"
          icon={Trophy}
          accent="var(--acid-soft)"
        />
        <MetricCard
          label="Pull-up best"
          value="5 reps"
          detail="13 strict reps in best session"
          icon={Flame}
        />
        <MetricCard
          label="Incline top set"
          value="65 × 10"
          detail="Best documented top set"
          icon={TrendingUp}
        />
        <MetricCard
          label="Active goals"
          value={`${goalCount}`}
          detail="Plus back-safe leg foundation"
          icon={CalendarCheck2}
        />
      </section>
      <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Best bench set"
          value="95 × 7"
          detail="Best recent working set"
          icon={Dumbbell}
        />
        <MetricCard
          label="Best bench 3-set"
          value="7 / 7 / 6"
          detail="95 lb · 20 completed reps"
          icon={BarChart3}
        />
        <MetricCard
          label="Lat pulldown top"
          value="110 × 10"
          detail="Machine-specific record"
          icon={TrendingUp}
        />
        <MetricCard
          label="Pushdown"
          value="30 × 10"
          detail="Three completed sets"
          icon={Flame}
        />
      </section>

      <section className="mt-8">
        <SectionHeading
          title="Training calendar"
          description="Dated sessions land on the calendar; five undated sessions stay visible without invented dates."
          action={
            <Link
              to="/workouts"
              className="hidden items-center gap-1 text-xs font-extrabold text-[var(--muted)] hover:text-[var(--ink)] sm:flex"
            >
              Full history <ChevronRight size={14} />
            </Link>
          }
        />
        <WorkoutCalendar
          workouts={workouts}
          nutritionEntries={nutritionEntries}
          compact
        />
        <Surface className="mt-4 p-4 sm:p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Weekly training frequency</p>
              <h3 className="mt-1 text-lg font-black tracking-[-0.025em]">
                Rhythm, not perfection
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Only dated sessions are counted; undated history is excluded.
              </p>
            </div>
            <div
              className="grid h-28 min-w-0 flex-1 grid-cols-6 items-end gap-2 sm:max-w-xl"
              role="img"
              aria-label={`Weekly workout counts: ${trainingWeeks
                .map((week) => `${week.label}, ${week.count}`)
                .join("; ")}`}
            >
              {trainingWeeks.map((week) => (
                <div key={week.label} className="flex h-full flex-col justify-end">
                  <span className="mb-1 text-center text-xs font-black">
                    {week.count || "—"}
                  </span>
                  <span
                    className="min-h-1 rounded-t-lg bg-[var(--accent)]"
                    style={{
                      height: `${Math.max(6, Math.min(100, (week.count / 5) * 100))}%`,
                      opacity: week.count ? 1 : 0.18,
                    }}
                  />
                  <span className="mt-2 truncate text-center text-[0.58rem] font-bold text-[var(--faint)]">
                    {week.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Surface>
      </section>

      <section className="mt-8">
        <SectionHeading
          title="Progress, with the footnotes"
          description="Unknown values stay blank; context appears where comparisons are not like-for-like."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          <ProgressChart
            title="Bench completed reps at 95 lb"
            description="The dashed series is known completed volume, not an estimate."
            data={benchProgress}
            valueSuffix="reps"
            secondaryLabel="Known volume (lb)"
          />
          <ProgressChart
            title="Smith incline best set"
            description="Highest completed reps in each documented session."
            data={inclineProgress}
            valueSuffix="reps"
            variant="area"
          />
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-3">
        <ProgressChart
          title="Bench estimated 1RM"
          description="Epley estimate only—not a confirmed record or a test recommendation."
          data={benchEstimateProgress}
          valueSuffix="lb estimated"
          secondaryLabel="Top-set load"
          height={190}
        />
        <ProgressChart
          title="Strict pull-up baseline"
          description="Best set and session total; one honest data point is still one data point."
          data={pullUpProgress}
          valueSuffix="best-set reps"
          secondaryLabel="Session total"
          height={190}
        />
        <ProgressChart
          title="Triceps pushdown at 30 lb"
          description="Completed repetitions increased without a load change."
          data={pushdownProgress}
          valueSuffix="reps"
          secondaryLabel="Known volume"
          height={190}
        />
      </section>

      <section className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
        <div>
          <SectionHeading
            title="Improvement ledger"
            description="Matched comparisons that show real, specific progress."
          />
          <Surface className="overflow-hidden">
            <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2">
              <div className="bg-[var(--surface)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <Badge tone="accent">+1 rep</Badge>
                  <BarChart3 size={18} className="text-[var(--muted)]" />
                </div>
                <h3 className="mt-6 text-xl font-black tracking-[-0.035em]">
                  Bench at 95 lb
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">Jul 14 → Jul 16</p>
                <div className="mt-5 flex items-center gap-3 text-sm font-extrabold">
                  <span>7 / 7 / 5</span>
                  <ArrowRight size={15} className="text-[var(--faint)]" />
                  <span>7 / 7 / 6</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                  19 → 20 reps · 1,805 → 1,900 lb known volume
                </p>
              </div>
              <div className="bg-[var(--surface)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <Badge tone="accent">+7 reps</Badge>
                  <Dumbbell size={18} className="text-[var(--muted)]" />
                </div>
                <h3 className="mt-6 text-xl font-black tracking-[-0.035em]">
                  Pushdown at 30 lb
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">Travel return → Jul 27</p>
                <div className="mt-5 flex items-center gap-3 text-sm font-extrabold">
                  <span>10 / 8 / 5</span>
                  <ArrowRight size={15} className="text-[var(--faint)]" />
                  <span>10 / 10 / 10</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                  23 → 30 reps · 690 → 900 lb known volume
                </p>
              </div>
            </div>
          </Surface>
        </div>

        <div>
          <SectionHeading title="Nearest milestones" description="What to earn next." />
          <Surface className="space-y-3 p-4">
            <GoalMiniCard
              title="Smith-machine bench"
              current={benchCurrent}
              target={benchTarget}
              unit="lb"
              detail="Smith machine · confirmed"
            />
            <GoalMiniCard
              title="10 strict pull-ups"
              current={5}
              target={10}
              unit="reps"
              detail="Full range · no partials"
            />
            <Link
              to="/goals"
              className="button-ghost w-full justify-between !px-2 text-xs"
            >
              View every goal <ChevronRight size={15} />
            </Link>
          </Surface>
        </div>
      </section>

      <Surface className="mt-8 flex flex-col gap-4 border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--surface-soft)]">
            <CircleAlert size={18} />
          </span>
          <div>
            <p className="text-sm font-extrabold">Data stays in this browser</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Local entries do not sync automatically. Export a backup before changing
              devices or clearing browser data.
            </p>
          </div>
        </div>
        <Link to="/settings" className="button-secondary shrink-0 text-xs">
          Review backup options
        </Link>
      </Surface>

      <span className="sr-only">
        Latest workout: {latestWorkout?.title ?? "No workout recorded"}.
      </span>
    </>
  );
}
