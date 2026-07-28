import { AlertTriangle, Beaker, Check, Info, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { ScoreControl } from "../components/ScoreControl";
import { PageHeader, SectionHeading, Surface } from "../components/ui";
import { creatineNotice } from "../data/nutrition";
import type {
  DataQuality,
  NutritionEntry,
  Scale0To6,
  SupplementEntry,
} from "../lib/types";
import { validateNutritionEntry } from "../lib/validation";
import { useNavigate } from "../router";
import { useAppState } from "../state/AppState";

function localToday(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numericValue(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function newId(): string {
  return `local-nutrition-${crypto.randomUUID()}`;
}

export default function AddNutrition() {
  const navigate = useNavigate();
  const { saveNutritionEntry } = useAppState();
  const [date, setDate] = useState(localToday());
  const [bodyWeightLb, setBodyWeightLb] = useState<number>();
  const [calories, setCalories] = useState<number>();
  const [proteinG, setProteinG] = useState<number>();
  const [carbsG, setCarbsG] = useState<number>();
  const [fatG, setFatG] = useState<number>();
  const [fiberG, setFiberG] = useState<number>();
  const [waterOz, setWaterOz] = useState<number>();
  const [creatineG, setCreatineG] = useState<number>();
  const [appetite, setAppetite] = useState<Scale0To6>();
  const [mealQuality, setMealQuality] = useState<Scale0To6>();
  const [illness, setIllness] = useState<Scale0To6>();
  const [travelImpact, setTravelImpact] = useState<Scale0To6>();
  const [supplements, setSupplements] = useState<SupplementEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [dataQuality, setDataQuality] = useState<DataQuality>("complete");
  const [message, setMessage] = useState<string>();

  const entry = useMemo<NutritionEntry>(
    () => ({
      id: newId(),
      date,
      bodyWeightLb,
      calories,
      proteinG,
      carbsG,
      fatG,
      fiberG,
      waterOz,
      creatineG,
      otherSupplements: supplements.length ? supplements : undefined,
      appetite,
      mealQuality,
      illness,
      travelImpact,
      notes: notes.trim() || undefined,
      dataQuality,
    }),
    [
      appetite,
      bodyWeightLb,
      calories,
      carbsG,
      creatineG,
      dataQuality,
      date,
      fatG,
      fiberG,
      illness,
      mealQuality,
      notes,
      proteinG,
      supplements,
      travelImpact,
      waterOz,
    ],
  );
  const validation = validateNutritionEntry(entry);
  const highDose = creatineG !== undefined && creatineG >= 15;

  function handleSave() {
    if (!validation.valid) {
      setMessage("Review the validation issues before saving.");
      return;
    }
    saveNutritionEntry({ ...entry, id: newId() });
    setMessage("Nutrition entry saved in this browser.");
    window.setTimeout(() => navigate("/nutrition"), 450);
  }

  return (
    <>
      <PageHeader
        eyebrow="Daily nutrition"
        title="Log what you know."
        description="Blank means unknown. Targets stay yours to choose, and supplement tracking never turns into a prescription."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
          <Surface className="p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label>
                <span className="label">Date</span>
                <input
                  className="field"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label>
                <span className="label">Morning body weight (lb)</span>
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={bodyWeightLb ?? ""}
                  onChange={(event) => setBodyWeightLb(numericValue(event.target.value))}
                  placeholder="Not recorded"
                />
              </label>
              <label>
                <span className="label">Calories</span>
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={calories ?? ""}
                  onChange={(event) => setCalories(numericValue(event.target.value))}
                  placeholder="No target inferred"
                />
              </label>
            </div>
          </Surface>

          <div className="mt-5">
            <SectionHeading
              title="Macros & hydration"
              description="All values are optional; unrecorded nutrients do not become zero."
            />
            <Surface className="p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                  ["Protein", "g", proteinG, setProteinG],
                  ["Carbohydrates", "g", carbsG, setCarbsG],
                  ["Fat", "g", fatG, setFatG],
                  ["Fiber", "g", fiberG, setFiberG],
                  ["Water", "oz", waterOz, setWaterOz],
                ].map(([label, unit, value, setter]) => (
                  <label key={label as string}>
                    <span className="label">
                      {label as string} ({unit as string})
                    </span>
                    <input
                      className="field"
                      type="number"
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      value={(value as number | undefined) ?? ""}
                      onChange={(event) =>
                        (
                          setter as React.Dispatch<
                            React.SetStateAction<number | undefined>
                          >
                        )(numericValue(event.target.value))
                      }
                      placeholder="—"
                    />
                  </label>
                ))}
              </div>
            </Surface>
          </div>

          <div className="mt-5">
            <SectionHeading
              title="Daily context · 0–6"
              description="Appetite and meal quality run low → high. Illness and travel run none → severe."
            />
            <div className="grid gap-3 md:grid-cols-2">
              <ScoreControl
                id="nutrition-appetite"
                label="Appetite"
                value={appetite}
                onChange={setAppetite}
                onClear={() => setAppetite(undefined)}
                lowLabel="very low"
                highLabel="strong"
              />
              <ScoreControl
                id="nutrition-meal-quality"
                label="Meal quality"
                value={mealQuality}
                onChange={setMealQuality}
                onClear={() => setMealQuality(undefined)}
                lowLabel="poor"
                highLabel="excellent"
              />
              <ScoreControl
                id="nutrition-illness"
                label="Illness impact"
                value={illness}
                onChange={setIllness}
                onClear={() => setIllness(undefined)}
                lowLabel="none"
                highLabel="severe"
                direction="negative"
              />
              <ScoreControl
                id="nutrition-travel"
                label="Travel impact"
                value={travelImpact}
                onChange={setTravelImpact}
                onClear={() => setTravelImpact(undefined)}
                lowLabel="none"
                highLabel="major"
                direction="negative"
              />
            </div>
          </div>

          <div className="mt-5">
            <SectionHeading
              title="Supplements"
              description="Personal observations only—never a recommendation."
            />
            <Surface className="p-4 sm:p-5">
              <label className="block max-w-xs">
                <span className="label">Creatine (g)</span>
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={creatineG ?? ""}
                  onChange={(event) => setCreatineG(numericValue(event.target.value))}
                  placeholder="Not recorded"
                />
              </label>

              {highDose ? (
                <div className="mt-4 flex items-start gap-3 rounded-2xl bg-orange-500/10 p-4">
                  <AlertTriangle
                    size={17}
                    className="mt-0.5 shrink-0 text-[var(--orange)]"
                  />
                  <div>
                    <p className="text-sm font-extrabold">Review the duration and plan</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      {creatineNotice.message} Entry is still allowed. Consider discussing
                      prolonged high-dose use with a qualified clinician.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {supplements.map((supplement, index) => (
                  <div
                    key={`supplement-${index}`}
                    className="grid gap-2 rounded-2xl border border-[var(--line)] p-3 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_auto]"
                  >
                    <input
                      className="field"
                      value={supplement.name}
                      onChange={(event) =>
                        setSupplements((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Supplement name"
                      aria-label={`Supplement ${index + 1} name`}
                    />
                    <input
                      className="field"
                      type="number"
                      min="0"
                      step="0.1"
                      value={supplement.dose ?? ""}
                      onChange={(event) =>
                        setSupplements((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  dose: numericValue(event.target.value),
                                }
                              : item,
                          ),
                        )
                      }
                      placeholder="Dose"
                      aria-label={`Supplement ${index + 1} dose`}
                    />
                    <input
                      className="field"
                      value={supplement.unit ?? ""}
                      onChange={(event) =>
                        setSupplements((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, unit: event.target.value || undefined }
                              : item,
                          ),
                        )
                      }
                      placeholder="Unit"
                      aria-label={`Supplement ${index + 1} unit`}
                    />
                    <button
                      type="button"
                      className="button-ghost !h-11 !min-h-11 !w-11 !p-0 hover:!text-[var(--danger)]"
                      onClick={() =>
                        setSupplements((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      aria-label={`Remove supplement ${index + 1}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="button-secondary mt-3 border-dashed text-xs"
                onClick={() => setSupplements((current) => [...current, { name: "" }])}
              >
                <Plus size={14} /> Add another supplement
              </button>
            </Surface>
          </div>

          <Surface className="mt-5 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
              <label>
                <span className="label">Notes</span>
                <textarea
                  className="field min-h-28 resize-y"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Meals, appetite, timing, travel context…"
                />
              </label>
              <label>
                <span className="label">Data quality</span>
                <select
                  className="field"
                  value={dataQuality}
                  onChange={(event) => setDataQuality(event.target.value as DataQuality)}
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

        <aside className="self-start xl:sticky xl:top-24">
          <Surface className="p-4">
            <div className="flex items-center gap-2">
              <Beaker size={17} />
              <h2 className="text-sm font-extrabold">Entry check</h2>
            </div>
            <div className="mt-4 space-y-2">
              {validation.valid ? (
                <div className="flex items-center gap-2 rounded-xl bg-[var(--acid-soft)] p-3 text-xs font-extrabold">
                  <Check size={14} /> Ready to save
                </div>
              ) : (
                validation.errors.map((error) => (
                  <div
                    key={`${error.path}-${error.message}`}
                    className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs leading-5 text-[var(--danger)]"
                  >
                    <AlertTriangle size={13} className="mt-1 shrink-0" />
                    {error.message}
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              className="button-primary mt-4 w-full"
              onClick={handleSave}
            >
              <Save size={16} /> Save nutrition
            </button>
            {message ? (
              <p className="mt-3 text-center text-xs font-bold text-[var(--muted)]">
                {message}
              </p>
            ) : null}
            <div className="mt-4 flex items-start gap-2 border-t border-[var(--line)] pt-4">
              <Info size={14} className="mt-0.5 shrink-0 text-[var(--muted)]" />
              <p className="text-[0.68rem] leading-5 text-[var(--muted)]">
                Saved entries remain in this browser until you export or commit them.
              </p>
            </div>
          </Surface>
        </aside>
      </div>
    </>
  );
}
