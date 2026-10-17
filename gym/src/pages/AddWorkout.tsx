import {
  AlertCircle,
  Check,
  Clipboard,
  Download,
  Dumbbell,
  Eye,
  FileJson,
  Info,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ScoreControl } from "../components/ScoreControl";
import WorkoutCard from "../components/WorkoutCard";
import { useConfirm } from "../components/confirm";
import { useToast } from "../components/toast";
import { Button, PageHeader, SectionHeading, Surface, Toggle } from "../components/ui";
import { exercises as exerciseRegistry } from "../data/exercises";
import { workoutToMarkdown } from "../lib/markdownExport";
import type {
  DataQuality,
  ExerciseEntry,
  ExerciseSet,
  Scale0To6,
  Workout,
  WorkoutContext,
  WorkoutType,
} from "../lib/types";
import { validateWorkout } from "../lib/validation";
import { useNavigate, useSearchParams } from "../router";
import { useAppState } from "../state/AppState";

const workoutTypes: WorkoutType[] = [
  "push",
  "pull",
  "legs",
  "full-body",
  "upper",
  "other",
];

type ContextScoreKey =
  | "energy"
  | "sleepQuality"
  | "soreness"
  | "appetite"
  | "illness"
  | "travelImpact"
  | "backPain"
  | "generalPain";

type EditableSet = ExerciseSet;
type EditableExercise = ExerciseEntry;

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function localToday(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeNow(): string {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function newSet(): EditableSet {
  return {
    id: newId("set"),
    completed: true,
    dataQuality: "complete",
  };
}

function newExercise(exerciseId = "smith-flat-bench"): EditableExercise {
  const definition = exerciseRegistry.find((item) => item.id === exerciseId);
  return {
    exerciseId,
    name: definition?.canonicalName ?? "Exercise",
    equipment: definition?.equipment[0],
    machineId: exerciseId.startsWith("smith-") ? "primary-smith-machine" : undefined,
    sets: [newSet()],
    dataQuality: "complete",
  };
}

function numericValue(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SetEditor({
  set,
  index,
  onChange,
  onDelete,
}: {
  set: EditableSet;
  index: number;
  onChange: (next: EditableSet) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold">Set {index + 1}</p>
        <Button
          variant="ghost"
          size="icon"
          className="hover:text-[var(--bad)]"
          onClick={onDelete}
          aria-label={`Remove set ${index + 1}`}
        >
          <X size={15} aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label>
          <span className="label">Weight (lb)</span>
          <input
            className="field"
            inputMode="decimal"
            type="number"
            min="0"
            step="0.5"
            value={set.weightLb ?? ""}
            onChange={(event) =>
              onChange({ ...set, weightLb: numericValue(event.target.value) })
            }
            placeholder="Bodyweight"
          />
        </label>
        <label>
          <span className="label">{set.failedAttempt ? "Attempted reps" : "Reps"}</span>
          <input
            className="field"
            inputMode="numeric"
            type="number"
            min="0"
            step="1"
            value={set.failedAttempt ? (set.attemptedReps ?? "") : (set.reps ?? "")}
            onChange={(event) => {
              const value = numericValue(event.target.value);
              onChange(
                set.failedAttempt
                  ? { ...set, attemptedReps: value, reps: undefined }
                  : { ...set, reps: value, attemptedReps: undefined },
              );
            }}
          />
        </label>
        <label>
          <span className="label">RIR · 0–6</span>
          <select
            className="field"
            value={set.rir ?? ""}
            onChange={(event) =>
              onChange({
                ...set,
                rir:
                  event.target.value === ""
                    ? undefined
                    : (Number(event.target.value) as Scale0To6),
              })
            }
          >
            <option value="">Not recorded</option>
            {[0, 1, 2, 3, 4, 5, 6].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Quality</span>
          <select
            className="field"
            value={set.dataQuality ?? "complete"}
            onChange={(event) =>
              onChange({
                ...set,
                dataQuality: event.target.value as DataQuality,
              })
            }
          >
            <option value="complete">Complete</option>
            <option value="partial">Partial</option>
            <option value="estimated">Estimated</option>
            <option value="ambiguous">Ambiguous</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Toggle
          checked={set.warmup ?? false}
          onChange={(checked) => onChange({ ...set, warmup: checked || undefined })}
          label="Warm-up"
          tone="warn"
        />
        <Toggle
          checked={set.rampUp ?? false}
          onChange={(checked) => onChange({ ...set, rampUp: checked || undefined })}
          label="Ramp-up"
          tone="warn"
        />
        <Toggle
          checked={set.perSide ?? false}
          onChange={(checked) => onChange({ ...set, perSide: checked || undefined })}
          label="Per side"
        />
        <Toggle
          checked={set.failedAttempt ?? false}
          onChange={(checked) =>
            onChange({
              ...set,
              failedAttempt: checked || undefined,
              completed: !checked,
              attemptedReps: checked ? (set.attemptedReps ?? set.reps) : undefined,
              reps: checked ? undefined : (set.reps ?? set.attemptedReps),
            })
          }
          label="Failed attempt"
          tone="danger"
        />
        <Toggle
          checked={set.technicalFailure ?? false}
          onChange={(checked) =>
            onChange({ ...set, technicalFailure: checked || undefined })
          }
          label="Technical failure"
          tone="danger"
        />
      </div>
      <label className="mt-3 block">
        <span className="label">Set note</span>
        <input
          className="field"
          value={set.notes ?? ""}
          onChange={(event) =>
            onChange({ ...set, notes: event.target.value || undefined })
          }
          placeholder="Form cue, range, machine setting…"
        />
      </label>
    </div>
  );
}

function ExerciseEditor({
  exercise,
  index,
  onChange,
  onDelete,
}: {
  exercise: EditableExercise;
  index: number;
  onChange: (next: EditableExercise) => void;
  onDelete: () => void;
}) {
  const definition = exerciseRegistry.find((item) => item.id === exercise.exerciseId);
  return (
    <Surface className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-[var(--accent)] text-xs font-bold text-[var(--on-accent)]"
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{exercise.name}</p>
            <p className="truncate text-xs text-[var(--muted)]">
              {definition?.category ?? "other"} · {exercise.sets.length} sets
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="hover:text-[var(--bad)]"
          onClick={onDelete}
          aria-label={`Remove ${exercise.name}`}
        >
          <Trash2 size={15} aria-hidden="true" />
        </Button>
      </div>
      <div className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="label">Exercise</span>
            <div className="relative">
              <select
                className="field"
                value={exercise.exerciseId}
                onChange={(event) => {
                  const nextDefinition = exerciseRegistry.find(
                    (item) => item.id === event.target.value,
                  );
                  onChange({
                    ...exercise,
                    exerciseId: event.target.value,
                    name: nextDefinition?.canonicalName ?? event.target.value,
                    equipment: nextDefinition?.equipment[0],
                    machineId: event.target.value.startsWith("smith-")
                      ? "primary-smith-machine"
                      : undefined,
                  });
                }}
              >
                {exerciseRegistry.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.canonicalName}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label>
            <span className="label">Equipment / machine</span>
            <input
              className="field"
              value={exercise.equipment ?? ""}
              onChange={(event) =>
                onChange({
                  ...exercise,
                  equipment: event.target.value || undefined,
                })
              }
              placeholder="Specific machine or setup"
            />
          </label>
        </div>

        {definition?.weightMayBePerSide ? (
          <div className="well mt-3 flex items-start gap-2 p-3">
            <Info
              size={14}
              className="mt-0.5 shrink-0 text-[var(--warn)]"
              aria-hidden="true"
            />
            <p className="text-xs leading-5 text-[var(--muted)]">
              This movement may be logged per side. Mark each relevant set explicitly;
              volume will not double it unless you choose that policy.
            </p>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {exercise.sets.map((set, setIndex) => (
            <SetEditor
              key={set.id}
              set={set}
              index={setIndex}
              onChange={(next) =>
                onChange({
                  ...exercise,
                  sets: exercise.sets.map((item) => (item.id === set.id ? next : item)),
                })
              }
              onDelete={() =>
                onChange({
                  ...exercise,
                  sets: exercise.sets.filter((item) => item.id !== set.id),
                })
              }
            />
          ))}
        </div>
        <Button
          block
          dashed
          className="mt-3"
          onClick={() => onChange({ ...exercise, sets: [...exercise.sets, newSet()] })}
        >
          <Plus size={14} aria-hidden="true" /> Add set
        </Button>
        <label className="mt-3 block">
          <span className="label">Exercise note</span>
          <textarea
            className="field min-h-20 resize-y"
            value={exercise.notes ?? ""}
            onChange={(event) =>
              onChange({ ...exercise, notes: event.target.value || undefined })
            }
            placeholder="Technique, machine identity, ambiguity…"
          />
        </label>
      </div>
    </Surface>
  );
}

export default function AddWorkout() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();
  const { workouts, getLocalWorkout, saveWorkout } = useAppState();
  const editId = searchParams.get("edit");
  const existing = editId ? getLocalWorkout(editId) : undefined;
  const queryDate = searchParams.get("date");
  const [workoutId] = useState(existing?.id ?? newId("local-workout"));

  const [date, setDate] = useState(existing?.date ?? queryDate ?? localToday());
  const [startTime, setStartTime] = useState(
    existing?.startTime ?? (existing ? "" : localTimeNow()),
  );
  const [durationMinutes, setDurationMinutes] = useState<number | undefined>(
    existing?.durationMinutes,
  );
  const [type, setType] = useState<WorkoutType>(existing?.type ?? "push");
  const [title, setTitle] = useState(existing?.title ?? "Push Workout");
  const [exercises, setExercises] = useState<EditableExercise[]>(
    existing?.exercises ?? [newExercise()],
  );
  const [context, setContext] = useState<WorkoutContext>(existing?.context ?? {});
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [dataQuality, setDataQuality] = useState<DataQuality>(
    existing?.dataQuality ?? "complete",
  );
  const [preview, setPreview] = useState(false);

  const workout = useMemo<Workout>(
    () => ({
      id: workoutId,
      date: date || undefined,
      startTime: startTime || undefined,
      durationMinutes,
      type,
      title: title.trim() || `${type[0]?.toUpperCase()}${type.slice(1)} Workout`,
      context: Object.keys(context).length ? context : undefined,
      exercises,
      notes: notes.trim() || undefined,
      dataQuality,
      chronologyIndex:
        existing?.chronologyIndex ??
        Math.max(0, ...workouts.map((item) => item.chronologyIndex)) + 1,
    }),
    [
      context,
      dataQuality,
      date,
      durationMinutes,
      exercises,
      existing?.chronologyIndex,
      notes,
      startTime,
      title,
      type,
      workoutId,
      workouts,
    ],
  );
  const validation = validateWorkout(workout);
  const errors = validation.issues.filter((issue) => issue.severity === "error");

  function setContextScore(key: ContextScoreKey, value: Scale0To6) {
    setContext((current) => ({ ...current, [key]: value }));
  }

  function clearContextScore(key: ContextScoreKey) {
    setContext((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updateExercise(id: string, next: EditableExercise) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.exerciseId + exercise.sets[0]?.id === id ? next : exercise,
      ),
    );
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(workoutToMarkdown(workout));
      toast("Markdown copied.", "good");
    } catch {
      toast("The clipboard is not available; download the Markdown instead.", "alert");
    }
  }

  function handleSave() {
    if (errors.length) {
      toast("Review the validation issues before saving.", "alert");
      return;
    }
    try {
      saveWorkout(workout);
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "The workout could not be saved.",
        "alert",
      );
      return;
    }
    toast(
      existing ? "Workout updated in this browser." : "Workout saved in this browser.",
      "good",
    );
    window.setTimeout(() => navigate("/workouts"), 450);
  }

  async function clearForm() {
    const confirmed = await confirm({
      title: "Clear the form?",
      description:
        "Exercises, sets, context scores and notes typed so far are discarded.",
      confirmLabel: "Clear form",
      tone: "danger",
    });
    if (!confirmed) return;
    setExercises([newExercise()]);
    setContext({});
    setNotes("");
    setStartTime(localTimeNow());
    setDurationMinutes(undefined);
  }

  return (
    <>
      <PageHeader
        eyebrow={existing ? "Edit local entry" : "Logging"}
        title={existing ? "Update workout" : "Log a workout"}
        description="Every readiness signal is numeric from 0–6. Set-state toggles describe what happened; they are not recovery context."
        actions={
          <Button onClick={() => setPreview((value) => !value)}>
            <Eye size={16} aria-hidden="true" /> {preview ? "Edit form" : "Preview"}
          </Button>
        }
      />

      {preview ? (
        <div className="mx-auto max-w-4xl">
          <SectionHeading
            title="Entry preview"
            description="This is how the workout will appear in history."
          />
          <WorkoutCard workout={workout} defaultExpanded />
          <Button
            variant="primary"
            className="mt-4 w-full sm:w-auto"
            onClick={handleSave}
          >
            <Save size={16} aria-hidden="true" />{" "}
            {existing ? "Update workout" : "Save workout"}
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <Surface className="p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                  <span className="label">Start time</span>
                  <input
                    className="field"
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                  />
                </label>
                <label>
                  <span className="label">Duration (minutes)</span>
                  <input
                    className="field"
                    inputMode="numeric"
                    type="number"
                    min="1"
                    step="15"
                    value={durationMinutes ?? ""}
                    onChange={(event) =>
                      setDurationMinutes(numericValue(event.target.value))
                    }
                    placeholder="60"
                  />
                </label>
                <label>
                  <span className="label">Workout type</span>
                  <select
                    className="field capitalize"
                    value={type}
                    onChange={(event) => setType(event.target.value as WorkoutType)}
                  >
                    {workoutTypes.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sm:col-span-2 xl:col-span-4">
                  <span className="label">Title</span>
                  <input
                    className="field"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Push Workout"
                  />
                </label>
              </div>
            </Surface>

            <div className="mt-5">
              <SectionHeading
                title="Exercises & sets"
                description="Unknown values can stay blank; do not use zero as a stand-in."
              />
              <div className="space-y-4">
                {exercises.map((exercise, index) => {
                  const identity = exercise.exerciseId + exercise.sets[0]?.id;
                  return (
                    <ExerciseEditor
                      key={identity}
                      exercise={exercise}
                      index={index}
                      onChange={(next) => updateExercise(identity, next)}
                      onDelete={() =>
                        setExercises((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    />
                  );
                })}
              </div>
              <Button
                block
                dashed
                className="mt-4"
                onClick={() => setExercises((current) => [...current, newExercise()])}
              >
                <Plus size={16} aria-hidden="true" /> Add exercise
              </Button>
            </div>

            <div className="mt-6">
              <SectionHeading
                title="Workout context · 0–6"
                description="For energy, sleep, and appetite, 6 is better. For symptoms and disruption, 6 is more severe."
              />
              <div className="grid gap-3 md:grid-cols-2">
                <ScoreControl
                  id="log-energy"
                  label="Energy"
                  value={context.energy}
                  onChange={(value) => setContextScore("energy", value)}
                  onClear={() => clearContextScore("energy")}
                  lowLabel="empty"
                  highLabel="excellent"
                />
                <ScoreControl
                  id="log-sleep"
                  label="Sleep quality"
                  value={context.sleepQuality}
                  onChange={(value) => setContextScore("sleepQuality", value)}
                  onClear={() => clearContextScore("sleepQuality")}
                  lowLabel="very poor"
                  highLabel="excellent"
                />
                <ScoreControl
                  id="log-soreness"
                  label="Soreness"
                  value={context.soreness}
                  onChange={(value) => setContextScore("soreness", value)}
                  onClear={() => clearContextScore("soreness")}
                  lowLabel="none"
                  highLabel="very high"
                  direction="negative"
                />
                <ScoreControl
                  id="log-appetite"
                  label="Appetite"
                  value={context.appetite}
                  onChange={(value) => setContextScore("appetite", value)}
                  onClear={() => clearContextScore("appetite")}
                  lowLabel="very low"
                  highLabel="strong"
                />
                <ScoreControl
                  id="log-illness"
                  label="Illness impact"
                  value={context.illness}
                  onChange={(value) => setContextScore("illness", value)}
                  onClear={() => clearContextScore("illness")}
                  lowLabel="none"
                  highLabel="severe"
                  direction="negative"
                />
                <ScoreControl
                  id="log-travel"
                  label="Travel impact"
                  value={context.travelImpact}
                  onChange={(value) => setContextScore("travelImpact", value)}
                  onClear={() => clearContextScore("travelImpact")}
                  lowLabel="none"
                  highLabel="major"
                  direction="negative"
                />
                <ScoreControl
                  id="log-back"
                  label="Back pain"
                  value={context.backPain}
                  onChange={(value) => setContextScore("backPain", value)}
                  onClear={() => clearContextScore("backPain")}
                  lowLabel="none"
                  highLabel="severe"
                  direction="negative"
                />
                <ScoreControl
                  id="log-general-pain"
                  label="General pain"
                  value={context.generalPain}
                  onChange={(value) => setContextScore("generalPain", value)}
                  onClear={() => clearContextScore("generalPain")}
                  lowLabel="none"
                  highLabel="severe"
                  direction="negative"
                />
              </div>
            </div>

            <Surface className="mt-5 p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
                <label>
                  <span className="label">Workout notes</span>
                  <textarea
                    className="field min-h-28 resize-y"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="How the session felt, what changed, what to remember next time…"
                  />
                </label>
                <label>
                  <span className="label">Overall data quality</span>
                  <select
                    className="field"
                    value={dataQuality}
                    onChange={(event) =>
                      setDataQuality(event.target.value as DataQuality)
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

          <aside className="self-start xl:sticky xl:top-24">
            <Surface className="p-4">
              <div className="flex items-center gap-2">
                <Dumbbell size={17} aria-hidden="true" />
                <h2 className="text-sm font-bold">Entry summary</h2>
              </div>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--muted)]">Exercises</dt>
                  <dd className="font-extrabold">{exercises.length}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--muted)]">Sets</dt>
                  <dd className="font-extrabold">
                    {exercises.reduce((total, item) => total + item.sets.length, 0)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--muted)]">Context fields</dt>
                  <dd className="font-extrabold">
                    {
                      Object.values(context).filter((value) => typeof value === "number")
                        .length
                    }{" "}
                    numeric
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--muted)]">Storage</dt>
                  <dd className="font-extrabold">This browser</dd>
                </div>
              </dl>

              {errors.length ? (
                <div className="mt-4 rounded-sm bg-[var(--bad-soft)] p-3">
                  <div className="flex items-center gap-2 text-[var(--bad)]">
                    <AlertCircle size={14} aria-hidden="true" />
                    <p className="text-xs font-bold">
                      {errors.length} issue{errors.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--muted)]">
                    {errors.slice(0, 5).map((error) => (
                      <li key={`${error.path}-${error.message}`}>{error.message}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-2 rounded-sm bg-[var(--accent-soft)] p-3 text-xs font-bold">
                  <Check size={14} aria-hidden="true" /> Ready to save
                </div>
              )}

              <Button variant="primary" block className="mt-4" onClick={handleSave}>
                <Save size={16} aria-hidden="true" />{" "}
                {existing ? "Update workout" : "Save workout"}
              </Button>
              <Button block className="mt-2" onClick={copyMarkdown}>
                <Clipboard size={14} aria-hidden="true" /> Copy Markdown
              </Button>
              <Button
                block
                className="mt-2"
                onClick={() =>
                  downloadText(
                    `${workout.date ?? "undated"}-workout.md`,
                    workoutToMarkdown(workout),
                    "text/markdown",
                  )
                }
              >
                <Download size={14} aria-hidden="true" /> Download Markdown
              </Button>
              <Button
                block
                className="mt-2"
                onClick={() =>
                  downloadText(
                    `${workout.date ?? "undated"}-workout.json`,
                    JSON.stringify(workout, null, 2),
                    "application/json",
                  )
                }
              >
                <FileJson size={14} aria-hidden="true" /> Download JSON
              </Button>
            </Surface>

            <Button
              variant="ghost"
              block
              className="mt-2"
              onClick={() => void clearForm()}
            >
              <RotateCcw size={14} aria-hidden="true" /> Clear form
            </Button>
          </aside>
        </div>
      )}
    </>
  );
}
