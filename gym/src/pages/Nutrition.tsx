import {
  AlertTriangle,
  Apple,
  Beaker,
  CircleAlert,
  Droplets,
  Plus,
  Scale,
  Trash2,
  Utensils,
} from "lucide-react";

import ProgressChart from "../components/ProgressChart";
import {
  Badge,
  EmptyState,
  MetricCard,
  PageHeader,
  SectionHeading,
  Surface,
} from "../components/ui";
import { creatineNotice, nutritionObservations } from "../data/nutrition";
import { Link } from "../router";
import { useAppState } from "../state/AppState";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );

function average(values: Array<number | undefined>): number | undefined {
  const recorded = values.filter((value): value is number => value !== undefined);
  return recorded.length
    ? recorded.reduce((total, value) => total + value, 0) / recorded.length
    : undefined;
}

export default function Nutrition() {
  const { nutritionEntries, isLocalNutritionEntry, deleteNutritionEntry } = useAppState();
  const sorted = [...nutritionEntries].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-7);
  const latest = sorted[sorted.length - 1];
  const avgWeight = average(recent.map((entry) => entry.bodyWeightLb));
  const avgProtein = average(recent.map((entry) => entry.proteinG));
  const avgCalories = average(recent.map((entry) => entry.calories));
  const avgWater = average(recent.map((entry) => entry.waterOz));

  return (
    <>
      <PageHeader
        eyebrow="Fuel & recovery"
        title="Nutrition, without the guilt."
        description="Track what you know, leave unknowns blank, and view supplement observations as context—not prescriptions."
        actions={
          <Link to="/add-nutrition" className="button-primary">
            <Plus size={16} /> Add nutrition
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="7-day avg weight"
          value={avgWeight !== undefined ? `${avgWeight.toFixed(1)} lb` : "—"}
          detail={
            avgWeight === undefined ? "No dated weigh-ins yet" : "Recorded days only"
          }
          icon={Scale}
        />
        <MetricCard
          label="Avg protein"
          value={avgProtein !== undefined ? `${Math.round(avgProtein)} g` : "—"}
          detail="No target inferred"
          icon={Utensils}
        />
        <MetricCard
          label="Avg calories"
          value={avgCalories !== undefined ? `${Math.round(avgCalories)}` : "—"}
          detail="Recorded days only"
          icon={Apple}
        />
        <MetricCard
          label="Avg water"
          value={avgWater !== undefined ? `${Math.round(avgWater)} oz` : "—"}
          detail="Recorded days only"
          icon={Droplets}
        />
      </div>

      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
        <div className="grid min-w-0 gap-4">
          <ProgressChart
            title="Body-weight trend"
            description="Only dated, recorded weigh-ins appear. The undated ~140 lb observation is not plotted."
            data={sorted.map((entry) => ({
              label: dateLabel(entry.date),
              value: entry.bodyWeightLb,
              context:
                (entry.travelImpact ?? 0) > 0
                  ? `Travel impact ${entry.travelImpact}/6`
                  : (entry.illness ?? 0) > 0
                    ? `Illness impact ${entry.illness}/6`
                    : undefined,
            }))}
            valueSuffix="lb"
            variant="area"
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <ProgressChart
              title="Calories"
              description="Recorded days only; no target is inferred."
              data={sorted.map((entry) => ({
                label: dateLabel(entry.date),
                value: entry.calories,
              }))}
              valueSuffix="kcal"
              height={210}
            />
            <ProgressChart
              title="Protein"
              description="No target line until you choose one."
              data={sorted.map((entry) => ({
                label: dateLabel(entry.date),
                value: entry.proteinG,
              }))}
              valueSuffix="g"
              height={210}
            />
            <ProgressChart
              title="Creatine dose"
              description="A personal observation only; gaps are not scored as failures."
              data={sorted.map((entry) => ({
                label: dateLabel(entry.date),
                value: entry.creatineG,
              }))}
              valueSuffix="g"
              height={210}
            />
          </div>
        </div>

        <div className="space-y-4">
          <Surface className="overflow-hidden border-[color-mix(in_srgb,var(--orange)_35%,var(--line))]">
            <div className="bg-orange-500/10 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge tone="warm">review notice</Badge>
                  <h2 className="mt-3 text-xl font-black tracking-[-0.03em]">
                    {creatineNotice.reportedDose}
                  </h2>
                  <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                    Reported intake · start date unknown
                  </p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-orange-500/15 text-[var(--orange)]">
                  <Beaker size={18} />
                </span>
              </div>
            </div>
            <div className="p-5">
              <p className="text-xs leading-6 text-[var(--muted)]">
                {creatineNotice.message}
              </p>
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-[var(--surface-soft)] p-3">
                <AlertTriangle
                  size={15}
                  className="mt-0.5 shrink-0 text-[var(--orange)]"
                />
                <p className="text-[0.7rem] leading-5 text-[var(--muted)]">
                  {creatineNotice.safety}
                </p>
              </div>
            </div>
          </Surface>

          <Surface className="p-5">
            <p className="eyebrow">Known travel gap</p>
            <h3 className="mt-2 text-lg font-black">~10 days paused</h3>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              No creatine was reported during travel. Exact dates are unknown, so the
              calendar does not fabricate ten missed entries.
            </p>
            <Badge tone="quality" className="mt-4">
              undated annotation
            </Badge>
          </Surface>

          <Surface className="p-5">
            <p className="eyebrow">Data quality</p>
            <div className="mt-3 space-y-2">
              {nutritionObservations
                .filter((item) => item.status === "unknown")
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 text-xs leading-5 text-[var(--muted)]"
                  >
                    <CircleAlert size={13} className="mt-1 shrink-0" />
                    {item.title} not yet recorded
                  </div>
                ))}
            </div>
          </Surface>
        </div>
      </section>

      <section className="mt-7">
        <SectionHeading
          title="Daily entries"
          description="Local entries remain in this browser until exported."
        />
        {nutritionEntries.length ? (
          <Surface className="overflow-hidden">
            <div className="divide-y divide-[var(--line)]">
              {[...nutritionEntries]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-extrabold">
                          {new Intl.DateTimeFormat("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          }).format(new Date(`${entry.date}T12:00:00`))}
                        </p>
                        <Badge
                          tone={entry.dataQuality === "complete" ? "neutral" : "quality"}
                        >
                          {entry.dataQuality}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                        {[
                          entry.bodyWeightLb && `${entry.bodyWeightLb} lb`,
                          entry.calories && `${entry.calories} kcal`,
                          entry.proteinG && `${entry.proteinG} g protein`,
                          entry.waterOz && `${entry.waterOz} oz water`,
                          entry.creatineG !== undefined &&
                            `${entry.creatineG} g creatine`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {isLocalNutritionEntry(entry.id) ? (
                      <button
                        type="button"
                        className="button-danger self-start text-xs sm:self-auto"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Delete this nutrition entry from this browser?",
                            )
                          ) {
                            deleteNutritionEntry(entry.id);
                          }
                        }}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    ) : null}
                  </div>
                ))}
            </div>
          </Surface>
        ) : (
          <Surface>
            <EmptyState
              icon={Apple}
              title="No dated nutrition entries yet"
              description="The known body weight and creatine observations are undated, so they stay out of trend charts."
              action={
                <Link to="/add-nutrition" className="button-primary text-xs">
                  Add the first day
                </Link>
              }
            />
          </Surface>
        )}
      </section>

      <span className="sr-only">Latest nutrition entry: {latest?.date ?? "none"}.</span>
    </>
  );
}
