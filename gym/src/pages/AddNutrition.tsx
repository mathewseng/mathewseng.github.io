import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Beaker,
  Check,
  FileQuestion,
  Info,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { ScoreControl } from "../components/ScoreControl";
import { useConfirm } from "../components/confirm";
import { useToast } from "../components/toast";
import {
  ActionBar,
  Button,
  ButtonLink,
  EmptyState,
  FieldError,
  PageHeader,
  SectionHeading,
  Surface,
  fieldA11y,
  focusIssue,
  groupIssuesByPath,
} from "../components/ui";
import { creatineNotice } from "../data/nutrition";
import { errorMessage, localToday, numericValue } from "../lib/formUtils";
import type {
  DataQuality,
  NutritionEntry,
  Scale0To6,
  SupplementEntry,
} from "../lib/types";
import { validateNutritionEntry } from "../lib/validation";
import { useNavigate, useNavigationGuard, useSearchParams } from "../router";
import { useAppState } from "../state/AppState";

const FORM_ID = "nutrition";

type NumericKey =
  | "bodyWeightLb"
  | "calories"
  | "proteinG"
  | "carbsG"
  | "fatG"
  | "fiberG"
  | "waterOz"
  | "creatineG";

type RatingKey = "appetite" | "mealQuality" | "illness" | "travelImpact";

interface NutritionForm extends Partial<Record<NumericKey, number>> {
  date: string;
  appetite?: Scale0To6;
  mealQuality?: Scale0To6;
  illness?: Scale0To6;
  travelImpact?: Scale0To6;
  supplements: SupplementEntry[];
  notes: string;
  dataQuality: DataQuality;
}

function newId(): string {
  return `local-nutrition-${crypto.randomUUID()}`;
}

function blankForm(): NutritionForm {
  return { date: localToday(), supplements: [], notes: "", dataQuality: "complete" };
}

function formFromEntry(entry: NutritionEntry): NutritionForm {
  return {
    date: entry.date,
    bodyWeightLb: entry.bodyWeightLb,
    calories: entry.calories,
    proteinG: entry.proteinG,
    carbsG: entry.carbsG,
    fatG: entry.fatG,
    fiberG: entry.fiberG,
    waterOz: entry.waterOz,
    creatineG: entry.creatineG,
    appetite: entry.appetite,
    mealQuality: entry.mealQuality,
    illness: entry.illness,
    travelImpact: entry.travelImpact,
    supplements: entry.otherSupplements ?? [],
    notes: entry.notes ?? "",
    dataQuality: entry.dataQuality ?? "complete",
  };
}

function EditNotFound({ id, seedDate }: { id: string; seedDate?: string }) {
  return (
    <>
      <PageHeader title="Nutrition entry not found" />
      <Surface>
        <EmptyState
          icon={FileQuestion}
          title={
            seedDate
              ? "Bundled entries can’t be edited here"
              : "No saved entry has this link"
          }
          description={
            seedDate
              ? `The ${seedDate} entry is part of the bundled history. It is changed in the repository data, not in this browser.`
              : `Nothing saved in this browser has the id “${id}”. It may have been deleted, or saved on another device.`
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink to="/nutrition">
                <ArrowLeft size={15} aria-hidden="true" /> Open nutrition
              </ButtonLink>
              <ButtonLink to="/add-nutrition" variant="primary">
                <Plus size={15} aria-hidden="true" /> Log a new day
              </ButtonLink>
            </div>
          }
        />
      </Surface>
    </>
  );
}

export default function AddNutrition() {
  const [searchParams] = useSearchParams();
  const { nutritionEntries, getLocalNutritionEntry } = useAppState();
  const editId = searchParams.get("edit");
  const existing = editId ? getLocalNutritionEntry(editId) : undefined;

  if (editId && !existing) {
    return (
      <EditNotFound
        id={editId}
        seedDate={nutritionEntries.find((entry) => entry.id === editId)?.date}
      />
    );
  }
  return <NutritionEditor key={editId ?? "new"} existing={existing} />;
}

function NutritionEditor({ existing }: { existing?: NutritionEntry }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { saveNutritionEntry } = useAppState();
  const [entryId] = useState(() => existing?.id ?? newId());
  const [form, setForm] = useState<NutritionForm>(() =>
    existing ? formFromEntry(existing) : blankForm(),
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(form));
  const [saved, setSaved] = useState(false);
  const dirty = !saved && JSON.stringify(form) !== baseline;

  const update = (patch: Partial<NutritionForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const askToLeave = useCallback(
    () =>
      confirm({
        title: "Leave without saving?",
        description:
          "This nutrition entry has changes that are not saved yet. Leaving discards them.",
        confirmLabel: "Leave",
        cancelLabel: "Keep editing",
        tone: "danger",
      }),
    [confirm],
  );
  useNavigationGuard(dirty, askToLeave);

  const entry = useMemo<NutritionEntry>(
    () => ({
      id: entryId,
      date: form.date,
      bodyWeightLb: form.bodyWeightLb,
      calories: form.calories,
      proteinG: form.proteinG,
      carbsG: form.carbsG,
      fatG: form.fatG,
      fiberG: form.fiberG,
      waterOz: form.waterOz,
      creatineG: form.creatineG,
      otherSupplements: form.supplements.length ? form.supplements : undefined,
      appetite: form.appetite,
      mealQuality: form.mealQuality,
      illness: form.illness,
      travelImpact: form.travelImpact,
      notes: form.notes.trim() || undefined,
      dataQuality: form.dataQuality,
    }),
    [entryId, form],
  );
  const validation = validateNutritionEntry(entry);
  const errorMap = groupIssuesByPath(validation.errors);
  const field = (path: string) => fieldA11y(FORM_ID, errorMap, path);
  const highDose = form.creatineG !== undefined && form.creatineG >= 15;
  const saveLabel = existing ? "Update nutrition" : "Save nutrition";

  function setSupplement(index: number, patch: Partial<SupplementEntry>) {
    setForm((current) => ({
      ...current,
      supplements: current.supplements.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function showFirstIssue() {
    const first = validation.errors[0];
    if (first) focusIssue(FORM_ID, first.path);
  }

  function handleSave() {
    if (!validation.valid) {
      const count = validation.errors.length;
      toast(`Fix ${count} issue${count === 1 ? "" : "s"} before saving.`, "alert");
      window.requestAnimationFrame(showFirstIssue);
      return;
    }
    try {
      saveNutritionEntry(entry);
    } catch (caught) {
      toast(
        `Not saved: ${errorMessage(caught, "the browser refused the write.")}`,
        "alert",
      );
      return;
    }
    setSaved(true);
    toast(
      existing
        ? "Nutrition entry updated in this browser."
        : "Nutrition entry saved in this browser.",
      "good",
    );
    window.setTimeout(() => navigate("/nutrition"), 450);
  }

  async function clearForm() {
    const confirmed = await confirm({
      title: "Clear the form?",
      description:
        "Every value, context score, supplement and note typed so far is discarded. The date stays.",
      confirmLabel: "Clear form",
      tone: "danger",
    });
    if (!confirmed) return;
    // The date stays (as on Add workout), so clearing an edit never moves the entry.
    const fresh: NutritionForm = { ...blankForm(), date: form.date };
    setForm(fresh);
    setBaseline(JSON.stringify(fresh));
    toast("Form cleared.");
  }

  function numberField(
    key: NumericKey,
    label: string,
    step: string,
    placeholder: string,
  ) {
    const a11y = field(key);
    return (
      <div key={key}>
        <label className="label" htmlFor={a11y.props.id}>
          {label}
        </label>
        <input
          {...a11y.props}
          className="field"
          type="number"
          min="0"
          step={step}
          inputMode={step === "1" ? "numeric" : "decimal"}
          value={form[key] ?? ""}
          onChange={(event) => update({ [key]: numericValue(event.target.value) })}
          placeholder={placeholder}
        />
        <FieldError id={a11y.errorId} messages={a11y.messages} />
      </div>
    );
  }

  const ratings: Array<{
    key: RatingKey;
    id: string;
    label: string;
    lowLabel: string;
    highLabel: string;
    negative?: boolean;
  }> = [
    {
      key: "appetite",
      id: "nutrition-appetite",
      label: "Appetite",
      lowLabel: "very low",
      highLabel: "strong",
    },
    {
      key: "mealQuality",
      id: "nutrition-meal-quality",
      label: "Meal quality",
      lowLabel: "poor",
      highLabel: "excellent",
    },
    {
      key: "illness",
      id: "nutrition-illness",
      label: "Illness impact",
      lowLabel: "none",
      highLabel: "severe",
      negative: true,
    },
    {
      key: "travelImpact",
      id: "nutrition-travel",
      label: "Travel impact",
      lowLabel: "none",
      highLabel: "major",
      negative: true,
    },
  ];

  const dateField = field("date");

  return (
    <>
      <PageHeader
        title={existing ? "Update nutrition" : "Log nutrition"}
        description="Blank means unknown. Targets stay yours to choose, and supplement tracking never turns into a prescription."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
          <Surface className="p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="label" htmlFor={dateField.props.id}>
                  Date
                </label>
                <input
                  {...dateField.props}
                  className="field"
                  type="date"
                  value={form.date}
                  onChange={(event) => update({ date: event.target.value })}
                />
                <FieldError id={dateField.errorId} messages={dateField.messages} />
              </div>
              {numberField(
                "bodyWeightLb",
                "Morning body weight (lb)",
                "0.1",
                "Not recorded",
              )}
              {numberField("calories", "Calories", "1", "No target inferred")}
            </div>
          </Surface>

          <div className="mt-5">
            <SectionHeading
              title="Macros & hydration"
              description="All values are optional; unrecorded nutrients do not become zero."
            />
            <Surface className="p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {numberField("proteinG", "Protein (g)", "0.1", "—")}
                {numberField("carbsG", "Carbohydrates (g)", "0.1", "—")}
                {numberField("fatG", "Fat (g)", "0.1", "—")}
                {numberField("fiberG", "Fiber (g)", "0.1", "—")}
                {numberField("waterOz", "Water (oz)", "0.1", "—")}
              </div>
            </Surface>
          </div>

          <div className="mt-5">
            <SectionHeading
              title="Daily context · 0–6"
              description="Appetite and meal quality run low → high. Illness and travel run none → severe."
            />
            <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
              {ratings.map((rating) => (
                <ScoreControl
                  key={rating.key}
                  id={rating.id}
                  label={rating.label}
                  value={form[rating.key]}
                  onChange={(value) => update({ [rating.key]: value })}
                  onClear={() => update({ [rating.key]: undefined })}
                  lowLabel={rating.lowLabel}
                  highLabel={rating.highLabel}
                  direction={rating.negative ? "negative" : undefined}
                />
              ))}
            </div>
          </div>

          <div className="mt-5">
            <SectionHeading
              title="Supplements"
              description="Personal observations only—never a recommendation."
            />
            <Surface className="p-4 sm:p-5">
              <div className="max-w-xs">
                {numberField("creatineG", "Creatine (g)", "0.1", "Not recorded")}
              </div>

              {highDose ? (
                <div className="mt-4 flex items-start gap-3 rounded-md bg-[var(--warn-soft)] p-4">
                  <AlertTriangle
                    size={17}
                    className="mt-0.5 shrink-0 text-[var(--warn)]"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-bold">Review the duration and plan</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      {creatineNotice.message} Entry is still allowed. Consider discussing
                      prolonged high-dose use with a qualified clinician.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {form.supplements.map((supplement, index) => {
                  const name = field(`otherSupplements[${index}].name`);
                  const dose = field(`otherSupplements[${index}].dose`);
                  return (
                    <div
                      key={`supplement-${index}`}
                      className="rounded-md border border-[var(--line)] p-3"
                    >
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_auto]">
                        <input
                          {...name.props}
                          className="field"
                          value={supplement.name}
                          onChange={(event) =>
                            setSupplement(index, { name: event.target.value })
                          }
                          placeholder="Supplement name"
                          aria-label={`Supplement ${index + 1} name`}
                        />
                        <input
                          {...dose.props}
                          className="field"
                          type="number"
                          min="0"
                          step="0.1"
                          inputMode="decimal"
                          value={supplement.dose ?? ""}
                          onChange={(event) =>
                            setSupplement(index, {
                              dose: numericValue(event.target.value),
                            })
                          }
                          placeholder="Dose"
                          aria-label={`Supplement ${index + 1} dose`}
                        />
                        <input
                          className="field"
                          value={supplement.unit ?? ""}
                          onChange={(event) =>
                            setSupplement(index, {
                              unit: event.target.value || undefined,
                            })
                          }
                          placeholder="Unit"
                          aria-label={`Supplement ${index + 1} unit`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:text-[var(--bad)]"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              supplements: current.supplements.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            }))
                          }
                          aria-label={`Remove supplement ${index + 1}`}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </Button>
                      </div>
                      <FieldError id={name.errorId} messages={name.messages} />
                      <FieldError id={dose.errorId} messages={dose.messages} />
                    </div>
                  );
                })}
              </div>
              <Button
                dashed
                className="mt-3"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    supplements: [...current.supplements, { name: "" }],
                  }))
                }
              >
                <Plus size={14} aria-hidden="true" /> Add another supplement
              </Button>
            </Surface>
          </div>

          <Surface className="mt-5 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
              <label>
                <span className="label">Notes</span>
                <textarea
                  className="field min-h-28 resize-y"
                  value={form.notes}
                  onChange={(event) => update({ notes: event.target.value })}
                  placeholder="Meals, appetite, timing, travel context…"
                />
              </label>
              <label>
                <span className="label">Data quality</span>
                <select
                  className="field"
                  value={form.dataQuality}
                  onChange={(event) =>
                    update({ dataQuality: event.target.value as DataQuality })
                  }
                >
                  <option value="complete">Complete</option>
                  <option value="partial">Partial</option>
                  <option value="estimated">Estimated</option>
                  <option value="ambiguous">Ambiguous</option>
                </select>
              </label>
            </div>
          </Surface>
        </div>

        <aside className="self-start xl:sticky xl:top-24" aria-label="Entry check">
          <Surface className="p-4">
            <div className="flex items-center gap-2">
              <Beaker size={17} aria-hidden="true" />
              <h2 className="text-sm font-bold">Entry check</h2>
            </div>
            {validation.valid ? (
              <div className="mt-4 flex items-center gap-2 rounded-sm bg-[var(--good-soft)] p-3 text-xs font-bold">
                <Check size={14} className="text-[var(--good)]" aria-hidden="true" />{" "}
                Ready to save
              </div>
            ) : (
              <div className="mt-4 rounded-sm bg-[var(--bad-soft)] p-3">
                <div className="flex items-center gap-2 text-[var(--bad)]">
                  <AlertCircle size={14} aria-hidden="true" />
                  <p className="text-xs font-bold">
                    {validation.errors.length} issue
                    {validation.errors.length === 1 ? "" : "s"} to fix
                  </p>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {validation.errors.map((error) => (
                    <li key={`${error.path}-${error.message}`}>
                      <button
                        type="button"
                        className="issue-link"
                        onClick={() => focusIssue(FORM_ID, error.path)}
                      >
                        {error.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button
              variant="primary"
              block
              className="mt-4 hidden xl:flex"
              onClick={handleSave}
            >
              <Save size={16} aria-hidden="true" /> {saveLabel}
            </Button>
            <div className="mt-4 flex items-start gap-2 border-t border-[var(--line)] pt-4">
              <Info
                size={14}
                className="mt-0.5 shrink-0 text-[var(--muted)]"
                aria-hidden="true"
              />
              <p className="text-xs leading-5 text-[var(--muted)]">
                Saved entries remain in this browser until you export or commit them.
              </p>
            </div>
          </Surface>
          <Button variant="ghost" block className="mt-2" onClick={() => void clearForm()}>
            <RotateCcw size={14} aria-hidden="true" /> Clear form
          </Button>
        </aside>
      </div>

      <ActionBar className="xl:hidden" label="Save nutrition">
        {validation.valid ? (
          <span className="action-bar-status">
            <Check size={15} className="text-[var(--good)]" aria-hidden="true" />
            Ready to save
          </span>
        ) : (
          <button type="button" className="action-bar-status" onClick={showFirstIssue}>
            <AlertCircle size={15} className="text-[var(--bad)]" aria-hidden="true" />
            {validation.errors.length} issue
            {validation.errors.length === 1 ? "" : "s"}
          </button>
        )}
        <Button variant="primary" onClick={handleSave}>
          <Save size={16} aria-hidden="true" /> {saveLabel}
        </Button>
      </ActionBar>
    </>
  );
}
