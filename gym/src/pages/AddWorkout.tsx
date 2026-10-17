import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clipboard,
  Download,
  Dumbbell,
  Eye,
  FileJson,
  FileQuestion,
  Info,
  Lightbulb,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { ScoreControl } from "../components/ScoreControl";
import WorkoutCard from "../components/WorkoutCard";
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
  Toggle,
  fieldA11y,
  focusIssue,
  groupIssuesByPath,
} from "../components/ui";
import { exercises as exerciseRegistry } from "../data/exercises";
import {
  downloadText,
  errorMessage,
  localTimeNow,
  localToday,
  numericValue,
} from "../lib/formUtils";
import { workoutToMarkdown } from "../lib/markdownExport";
import { parsePlan, type PlanHandoff } from "../lib/planHandoff";
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
import { useNavigate, useNavigationGuard, useSearchParams } from "../router";
import { useAppState } from "../state/AppState";

const FORM_ID = "log";

const workoutTypes: WorkoutType[] = [
  "push",
  "pull",
  "legs",
  "full-body",
  "upper",
  "other",
];

const knownExerciseIds = new Set(exerciseRegistry.map((item) => item.id));

type ContextScoreKey =
  | "energy"
  | "sleepQuality"
  | "soreness"
  | "appetite"
  | "illness"
  | "travelImpact"
  | "backPain"
  | "generalPain";

type ErrorMap = Map<string, string[]>;

/** A form-only key keeps each exercise editor mounted while its fields change;
    it is stripped before the workout is validated or saved. */
type EditableExercise = ExerciseEntry & { clientKey: string };

interface WorkoutForm {
  date: string;
  startTime: string;
  durationMinutes?: number;
  type: WorkoutType;
  title: string;
  exercises: EditableExercise[];
  context: WorkoutContext;
  notes: string;
  dataQuality: DataQuality;
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function typeTitle(type: WorkoutType): string {
  return `${type[0]?.toUpperCase() ?? ""}${type.slice(1)} Workout`;
}

function newSet(weightLb?: number): ExerciseSet {
  return {
    id: newId("set"),
    completed: true,
    dataQuality: "complete",
    ...(weightLb !== undefined ? { weightLb } : {}),
  };
}

function newExercise(exerciseId = "smith-flat-bench", sets = 1, weightLb?: number) {
  const definition = exerciseRegistry.find((item) => item.id === exerciseId);
  return {
    clientKey: newId("exercise"),
    exerciseId,
    name: definition?.canonicalName ?? "Exercise",
    equipment: definition?.equipment[0],
    machineId: exerciseId.startsWith("smith-") ? "primary-smith-machine" : undefined,
    sets: Array.from({ length: Math.max(1, sets) }, () => newSet(weightLb)),
    dataQuality: "complete" as DataQuality,
  } satisfies EditableExercise;
}

function stripClientKey(exercise: EditableExercise): ExerciseEntry {
  const entry: Partial<EditableExercise> = { ...exercise };
  delete entry.clientKey;
  return entry as ExerciseEntry;
}

function blankForm(date?: string): WorkoutForm {
  return {
    date: date ?? localToday(),
    startTime: localTimeNow(),
    durationMinutes: undefined,
    type: "push",
    title: "Push Workout",
    exercises: [newExercise()],
    context: {},
    notes: "",
    dataQuality: "complete",
  };
}

function formFromWorkout(workout: Workout): WorkoutForm {
  return {
    date: workout.date ?? "",
    startTime: workout.startTime ?? "",
    durationMinutes: workout.durationMinutes,
    type: workout.type,
    title: workout.title,
    exercises: workout.exercises.map((entry) => ({
      ...entry,
      clientKey: newId("exercise"),
    })),
    context: workout.context ?? {},
    notes: workout.notes ?? "",
    dataQuality: workout.dataQuality,
  };
}

function formFromPlan(plan: PlanHandoff, date?: string): WorkoutForm {
  const base = blankForm(date);
  const type = plan.type ?? base.type;
  return {
    ...base,
    type,
    title: plan.title ?? typeTitle(type),
    durationMinutes: plan.durationMinutes,
    exercises: plan.exercises.length
      ? plan.exercises.map((item) =>
          newExercise(item.exerciseId, item.sets, item.weightLb),
        )
      : base.exercises,
  };
}

function SetEditor({
  set,
  index,
  path,
  errors,
  onChange,
  onDelete,
}: {
  set: ExerciseSet;
  index: number;
  path: string;
  errors: ErrorMap;
  onChange: (next: ExerciseSet) => void;
  onDelete: () => void;
}) {
  const weight = fieldA11y(FORM_ID, errors, `${path}.weightLb`);
  const reps = fieldA11y(
    FORM_ID,
    errors,
    `${path}.${set.failedAttempt ? "attemptedReps" : "reps"}`,
  );
  const rir = fieldA11y(FORM_ID, errors, `${path}.rir`);
  const group = fieldA11y(FORM_ID, errors, path);
  return (
    <div
      id={group.props.id}
      tabIndex={-1}
      className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3 sm:p-4"
      data-invalid={group.messages.length ? true : undefined}
    >
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
      <FieldError id={group.errorId} messages={group.messages} />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor={weight.props.id}>
            Weight (lb)
          </label>
          <input
            {...weight.props}
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
          <FieldError id={weight.errorId} messages={weight.messages} />
        </div>
        <div>
          <label className="label" htmlFor={reps.props.id}>
            {set.failedAttempt ? "Attempted reps" : "Reps"}
          </label>
          <input
            {...reps.props}
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
          <FieldError id={reps.errorId} messages={reps.messages} />
        </div>
        <div>
          <label className="label" htmlFor={rir.props.id}>
            RIR · 0–6
          </label>
          <select
            {...rir.props}
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
          <FieldError id={rir.errorId} messages={rir.messages} />
        </div>
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
  errors,
  onChange,
  onDelete,
}: {
  exercise: EditableExercise;
  index: number;
  errors: ErrorMap;
  onChange: (next: EditableExercise) => void;
  onDelete: () => void;
}) {
  const definition = exerciseRegistry.find((item) => item.id === exercise.exerciseId);
  const path = `exercises[${index}]`;
  const exerciseField = fieldA11y(FORM_ID, errors, `${path}.exerciseId`);
  const setsField = fieldA11y(FORM_ID, errors, `${path}.sets`);
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
            <h3 className="truncate text-sm font-bold">{exercise.name}</h3>
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
          <div>
            <label className="label" htmlFor={exerciseField.props.id}>
              Exercise
            </label>
            <select
              {...exerciseField.props}
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
            <FieldError id={exerciseField.errorId} messages={exerciseField.messages} />
          </div>
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

        <div id={setsField.props.id} tabIndex={-1} className="mt-4 space-y-3">
          <FieldError id={setsField.errorId} messages={setsField.messages} />
          {exercise.sets.map((set, setIndex) => (
            <SetEditor
              key={set.id}
              set={set}
              index={setIndex}
              path={`${path}.sets[${setIndex}]`}
              errors={errors}
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

function EditNotFound({ id, seedTitle }: { id: string; seedTitle?: string }) {
  return (
    <>
      <PageHeader eyebrow="Edit local entry" title="Workout not found" />
      <Surface>
        <EmptyState
          icon={FileQuestion}
          title={
            seedTitle
              ? "Bundled history can’t be edited here"
              : "No saved workout has this link"
          }
          description={
            seedTitle
              ? `“${seedTitle}” is part of the bundled training history. It is changed in the repository logs, not in this browser.`
              : `Nothing saved in this browser has the id “${id}”. It may have been deleted, or saved on another device.`
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink to="/workouts">
                <ArrowLeft size={15} aria-hidden="true" /> Open calendar
              </ButtonLink>
              <ButtonLink to="/add" variant="primary">
                <Plus size={15} aria-hidden="true" /> Log a new workout
              </ButtonLink>
            </div>
          }
        />
      </Surface>
    </>
  );
}

export default function AddWorkout() {
  const [searchParams] = useSearchParams();
  const { workouts, getLocalWorkout } = useAppState();
  const editId = searchParams.get("edit");
  const existing = editId ? getLocalWorkout(editId) : undefined;

  if (editId && !existing) {
    return (
      <EditNotFound
        id={editId}
        seedTitle={workouts.find((workout) => workout.id === editId)?.title}
      />
    );
  }

  return (
    <WorkoutEditor
      key={editId ?? searchParams.toString()}
      existing={existing}
      searchParams={searchParams}
    />
  );
}

function WorkoutEditor({
  existing,
  searchParams,
}: {
  existing?: Workout;
  searchParams: URLSearchParams;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { workouts, saveWorkout } = useAppState();
  const queryDate = searchParams.get("date") ?? undefined;
  const [plan] = useState(() =>
    existing ? undefined : parsePlan(searchParams, knownExerciseIds),
  );
  const [workoutId] = useState(existing?.id ?? newId("local-workout"));
  const [form, setForm] = useState<WorkoutForm>(() =>
    existing
      ? formFromWorkout(existing)
      : plan
        ? formFromPlan(plan, queryDate)
        : blankForm(queryDate),
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(form));
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const dirty = !saved && JSON.stringify(form) !== baseline;

  const update = (patch: Partial<WorkoutForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const askToLeave = useCallback(
    () =>
      confirm({
        title: "Leave without saving?",
        description:
          "This workout has changes that are not saved yet. Leaving discards them.",
        confirmLabel: "Leave",
        cancelLabel: "Keep editing",
        tone: "danger",
      }),
    [confirm],
  );
  useNavigationGuard(dirty, askToLeave);

  const nextChronologyIndex = useMemo(
    () => Math.max(0, ...workouts.map((item) => item.chronologyIndex)) + 1,
    [workouts],
  );

  const workout = useMemo<Workout>(
    () => ({
      id: workoutId,
      date: form.date || undefined,
      startTime: form.startTime || undefined,
      durationMinutes: form.durationMinutes,
      type: form.type,
      title: form.title.trim() || typeTitle(form.type),
      context: Object.keys(form.context).length ? form.context : undefined,
      exercises: form.exercises.map(stripClientKey),
      notes: form.notes.trim() || undefined,
      dataQuality: form.dataQuality,
      chronologyIndex: existing?.chronologyIndex ?? nextChronologyIndex,
    }),
    [existing?.chronologyIndex, form, nextChronologyIndex, workoutId],
  );
  const validation = validateWorkout(workout);
  const errors = validation.issues.filter((issue) => issue.severity === "error");
  const errorMap = groupIssuesByPath(errors);
  const field = (path: string) => fieldA11y(FORM_ID, errorMap, path);
  const setCount = form.exercises.reduce((total, item) => total + item.sets.length, 0);
  const saveLabel = existing ? "Update workout" : "Save workout";

  function setContextScore(key: ContextScoreKey, value: Scale0To6) {
    setForm((current) => ({ ...current, context: { ...current.context, [key]: value } }));
  }

  function clearContextScore(key: ContextScoreKey) {
    setForm((current) => {
      const context = { ...current.context };
      delete context[key];
      return { ...current, context };
    });
  }

  function updateExercise(clientKey: string, next: EditableExercise) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.clientKey === clientKey ? next : exercise,
      ),
    }));
  }

  function showFirstIssue() {
    const first = errors[0];
    if (first) focusIssue(FORM_ID, first.path);
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(workoutToMarkdown(workout));
      toast("Markdown copied.", "good");
    } catch {
      toast("The clipboard is not available; download the Markdown instead.", "alert");
    }
  }

  function download(kind: "md" | "json") {
    try {
      downloadText(
        `${workout.date ?? "undated"}-workout.${kind}`,
        kind === "md" ? workoutToMarkdown(workout) : JSON.stringify(workout, null, 2),
        kind === "md" ? "text/markdown" : "application/json",
      );
    } catch (caught) {
      toast(errorMessage(caught, "The file could not be downloaded."), "alert");
    }
  }

  function handleSave() {
    if (errors.length) {
      toast(
        `Fix ${errors.length} issue${errors.length === 1 ? "" : "s"} before saving.`,
        "alert",
      );
      if (preview) setPreview(false);
      window.requestAnimationFrame(showFirstIssue);
      return;
    }
    try {
      saveWorkout(workout);
    } catch (caught) {
      toast(
        `Not saved: ${errorMessage(caught, "the browser refused the write.")} Copy or download the entry so it is not lost.`,
        "alert",
      );
      return;
    }
    setSaved(true);
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
        "Date, type, title, exercises, sets, context scores and notes typed so far are discarded.",
      confirmLabel: "Clear form",
      tone: "danger",
    });
    if (!confirmed) return;
    const fresh = blankForm();
    setForm(fresh);
    setBaseline(JSON.stringify(fresh));
    setPreview(false);
    toast("Form cleared.");
  }

  const issueSummary = errors.length ? (
    <div className="mt-4 rounded-sm bg-[var(--bad-soft)] p-3">
      <div className="flex items-center gap-2 text-[var(--bad)]">
        <AlertCircle size={14} aria-hidden="true" />
        <p className="text-xs font-bold">
          {errors.length} issue{errors.length === 1 ? "" : "s"} to fix
        </p>
      </div>
      <ul className="mt-1 space-y-0.5">
        {errors.slice(0, 5).map((error) => (
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
  ) : (
    <div className="mt-4 flex items-center gap-2 rounded-sm bg-[var(--good-soft)] p-3 text-xs font-bold">
      <Check size={14} className="text-[var(--good)]" aria-hidden="true" /> Ready to save
    </div>
  );

  const scores: Array<{
    key: ContextScoreKey;
    id: string;
    label: string;
    lowLabel: string;
    highLabel: string;
    negative?: boolean;
  }> = [
    {
      key: "energy",
      id: "log-energy",
      label: "Energy",
      lowLabel: "empty",
      highLabel: "excellent",
    },
    {
      key: "sleepQuality",
      id: "log-sleep",
      label: "Sleep quality",
      lowLabel: "very poor",
      highLabel: "excellent",
    },
    {
      key: "soreness",
      id: "log-soreness",
      label: "Soreness",
      lowLabel: "none",
      highLabel: "very high",
      negative: true,
    },
    {
      key: "appetite",
      id: "log-appetite",
      label: "Appetite",
      lowLabel: "very low",
      highLabel: "strong",
    },
    {
      key: "illness",
      id: "log-illness",
      label: "Illness impact",
      lowLabel: "none",
      highLabel: "severe",
      negative: true,
    },
    {
      key: "travelImpact",
      id: "log-travel",
      label: "Travel impact",
      lowLabel: "none",
      highLabel: "major",
      negative: true,
    },
    {
      key: "backPain",
      id: "log-back",
      label: "Back pain",
      lowLabel: "none",
      highLabel: "severe",
      negative: true,
    },
    {
      key: "generalPain",
      id: "log-general-pain",
      label: "General pain",
      lowLabel: "none",
      highLabel: "severe",
      negative: true,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={existing ? "Edit local entry" : "Logging"}
        title={existing ? "Update workout" : "Log a workout"}
        description="Every readiness signal is numeric from 0–6. Set-state toggles describe what happened; they are not recovery context."
        actions={
          <Button onClick={() => setPreview((value) => !value)} aria-pressed={preview}>
            <Eye size={16} aria-hidden="true" /> {preview ? "Edit form" : "Preview"}
          </Button>
        }
      />

      {plan ? (
        <div className="well mb-5 flex items-start gap-3 p-3 sm:p-4">
          <Lightbulb
            size={16}
            className="mt-0.5 shrink-0 text-[var(--info)]"
            aria-hidden="true"
          />
          <p className="min-w-0 flex-1 text-sm leading-6 text-[var(--muted)]">
            <strong className="text-[var(--ink)]">
              Started from the suggested plan.
            </strong>{" "}
            Type, duration, exercises, set counts and planned loads are filled in; reps
            stay blank until you record what you completed.
          </p>
        </div>
      ) : null}

      {preview ? (
        <div className="mx-auto max-w-4xl">
          <SectionHeading
            title="Entry preview"
            description="This is how the workout will appear in history."
          />
          <WorkoutCard workout={workout} defaultExpanded />
          <Button
            variant="primary"
            className="mt-4 hidden w-full sm:w-auto xl:inline-flex"
            onClick={handleSave}
          >
            <Save size={16} aria-hidden="true" /> {saveLabel}
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <Surface className="p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="label" htmlFor={field("date").props.id}>
                    Date
                  </label>
                  <input
                    {...field("date").props}
                    className="field"
                    type="date"
                    value={form.date}
                    onChange={(event) => update({ date: event.target.value })}
                  />
                  <FieldError {...errorProps(field("date"))} />
                </div>
                <div>
                  <label className="label" htmlFor={field("startTime").props.id}>
                    Start time
                  </label>
                  <input
                    {...field("startTime").props}
                    className="field"
                    type="time"
                    value={form.startTime}
                    onChange={(event) => update({ startTime: event.target.value })}
                  />
                  <FieldError {...errorProps(field("startTime"))} />
                </div>
                <div>
                  <label className="label" htmlFor={field("durationMinutes").props.id}>
                    Duration (minutes)
                  </label>
                  <input
                    {...field("durationMinutes").props}
                    className="field"
                    inputMode="numeric"
                    type="number"
                    min="1"
                    step="15"
                    value={form.durationMinutes ?? ""}
                    onChange={(event) =>
                      update({ durationMinutes: numericValue(event.target.value) })
                    }
                    placeholder="60"
                  />
                  <FieldError {...errorProps(field("durationMinutes"))} />
                </div>
                <div>
                  <label className="label" htmlFor={field("type").props.id}>
                    Workout type
                  </label>
                  <select
                    {...field("type").props}
                    className="field capitalize"
                    value={form.type}
                    onChange={(event) =>
                      update({ type: event.target.value as WorkoutType })
                    }
                  >
                    {workoutTypes.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <FieldError {...errorProps(field("type"))} />
                </div>
                <div className="sm:col-span-2 xl:col-span-4">
                  <label className="label" htmlFor={field("title").props.id}>
                    Title
                  </label>
                  <input
                    {...field("title").props}
                    className="field"
                    value={form.title}
                    onChange={(event) => update({ title: event.target.value })}
                    placeholder="Push Workout"
                  />
                  <FieldError {...errorProps(field("title"))} />
                </div>
              </div>
            </Surface>

            <div className="mt-5">
              <SectionHeading
                title="Exercises & sets"
                description="Unknown values can stay blank; do not use zero as a stand-in."
              />
              <div id={field("exercises").props.id} tabIndex={-1} className="space-y-4">
                <FieldError {...errorProps(field("exercises"))} />
                {form.exercises.map((exercise, index) => (
                  <ExerciseEditor
                    key={exercise.clientKey}
                    exercise={exercise}
                    index={index}
                    errors={errorMap}
                    onChange={(next) => updateExercise(exercise.clientKey, next)}
                    onDelete={() =>
                      setForm((current) => ({
                        ...current,
                        exercises: current.exercises.filter(
                          (item) => item.clientKey !== exercise.clientKey,
                        ),
                      }))
                    }
                  />
                ))}
              </div>
              <Button
                block
                dashed
                className="mt-4"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    exercises: [...current.exercises, newExercise()],
                  }))
                }
              >
                <Plus size={16} aria-hidden="true" /> Add exercise
              </Button>
            </div>

            <div className="mt-6">
              <SectionHeading
                title="Workout context · 0–6"
                description="For energy, sleep, and appetite, 6 is better. For symptoms and disruption, 6 is more severe."
              />
              <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
                {scores.map((score) => (
                  <ScoreControl
                    key={score.key}
                    id={score.id}
                    label={score.label}
                    value={form.context[score.key]}
                    onChange={(value) => setContextScore(score.key, value)}
                    onClear={() => clearContextScore(score.key)}
                    lowLabel={score.lowLabel}
                    highLabel={score.highLabel}
                    direction={score.negative ? "negative" : undefined}
                  />
                ))}
              </div>
            </div>

            <Surface className="mt-5 p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
                <label>
                  <span className="label">Workout notes</span>
                  <textarea
                    className="field min-h-28 resize-y"
                    value={form.notes}
                    onChange={(event) => update({ notes: event.target.value })}
                    placeholder="How the session felt, what changed, what to remember next time…"
                  />
                </label>
                <label>
                  <span className="label">Overall data quality</span>
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

          <aside className="self-start xl:sticky xl:top-24" aria-label="Entry summary">
            <Surface className="p-4">
              <div className="flex items-center gap-2">
                <Dumbbell size={17} aria-hidden="true" />
                <h2 className="text-sm font-bold">Entry summary</h2>
              </div>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--muted)]">Exercises</dt>
                  <dd className="font-extrabold">{form.exercises.length}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--muted)]">Sets</dt>
                  <dd className="font-extrabold">{setCount}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--muted)]">Context fields</dt>
                  <dd className="font-extrabold">
                    {
                      Object.values(form.context).filter(
                        (value) => typeof value === "number",
                      ).length
                    }{" "}
                    numeric
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--muted)]">Storage</dt>
                  <dd className="font-extrabold">This browser</dd>
                </div>
              </dl>

              {issueSummary}

              <Button
                variant="primary"
                block
                className="mt-4 hidden xl:flex"
                onClick={handleSave}
              >
                <Save size={16} aria-hidden="true" /> {saveLabel}
              </Button>
              <Button block className="mt-2" onClick={() => void copyMarkdown()}>
                <Clipboard size={14} aria-hidden="true" /> Copy Markdown
              </Button>
              <Button block className="mt-2" onClick={() => download("md")}>
                <Download size={14} aria-hidden="true" /> Download Markdown
              </Button>
              <Button block className="mt-2" onClick={() => download("json")}>
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

      <ActionBar className="xl:hidden" label="Save workout">
        {errors.length ? (
          <button type="button" className="action-bar-status" onClick={showFirstIssue}>
            <AlertCircle size={15} className="text-[var(--bad)]" aria-hidden="true" />
            {errors.length} issue{errors.length === 1 ? "" : "s"}
          </button>
        ) : (
          <span className="action-bar-status">
            <Check size={15} className="text-[var(--good)]" aria-hidden="true" />
            {form.exercises.length} exercise{form.exercises.length === 1 ? "" : "s"} ·{" "}
            {setCount} set{setCount === 1 ? "" : "s"}
          </span>
        )}
        <Button variant="primary" onClick={handleSave}>
          <Save size={16} aria-hidden="true" /> {saveLabel}
        </Button>
      </ActionBar>
    </>
  );
}

function errorProps(field: ReturnType<typeof fieldA11y>) {
  return { id: field.errorId, messages: field.messages };
}
