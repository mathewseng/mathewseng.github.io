import type { Goal, NutritionEntry, Scale0To6, Workout } from "./types";
import {
  ImportValidationError,
  assertValidImport,
  validateAppData,
  validateNutritionEntry,
  validateWorkout,
} from "./validation";

export const STORAGE_KEY = "mathewseng-gym-data";
export const SCHEMA_VERSION = 2;

export interface LocalNote {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
}

export interface GymSettings {
  theme?: "light" | "dark" | "system";
  multiplyPerSideVolume?: boolean;
  creatineTargetG?: number;
  creatineNoticeAcknowledged?: boolean;
  [key: string]: unknown;
}

export interface PersistedGymData {
  schemaVersion: typeof SCHEMA_VERSION;
  workouts: Workout[];
  nutritionEntries: NutritionEntry[];
  goals: Goal[];
  notes: LocalNote[];
  settings: GymSettings;
  exportedAt?: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StorageLoadResult {
  data: PersistedGymData;
  recoveredFromInvalidData: boolean;
  error?: Error;
}

function storageOrGlobal(storage?: StorageLike): StorageLike | undefined {
  if (storage) {
    return storage;
  }
  return typeof globalThis.localStorage === "undefined"
    ? undefined
    : globalThis.localStorage;
}

export function createEmptyAppData(): PersistedGymData {
  return {
    schemaVersion: SCHEMA_VERSION,
    workouts: [],
    nutritionEntries: [],
    goals: [],
    notes: [],
    settings: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRating(value: unknown): Scale0To6 | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6) {
    return value as Scale0To6;
  }
  return undefined;
}

function firstBoolean(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean | undefined {
  for (const key of keys) {
    if (typeof record[key] === "boolean") {
      return record[key] as boolean;
    }
  }
  return undefined;
}

function firstRating(
  record: Record<string, unknown>,
  keys: readonly string[],
): Scale0To6 | undefined {
  for (const key of keys) {
    const converted = asRating(record[key]);
    if (converted !== undefined) {
      return converted;
    }
  }
  return undefined;
}

function migrateContext(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const migrated: Record<string, unknown> = {};
  const ratings: Array<[string, readonly string[]]> = [
    ["energy", ["energy"]],
    ["sleepQuality", ["sleepQuality", "sleep"]],
    ["soreness", ["soreness"]],
    ["appetite", ["appetite"]],
    ["illness", ["illness", "sick"]],
    ["travelImpact", ["travelImpact", "traveling", "travelingOrRecentlyReturned"]],
    ["backPain", ["backPain"]],
    ["generalPain", ["generalPain", "pain"]],
  ];
  for (const [target, sources] of ratings) {
    const converted = firstRating(value, sources);
    if (converted !== undefined) {
      migrated[target] = converted;
    }
  }
  const legacyAdverseFlags: Array<[string, readonly string[]]> = [
    ["illness", ["illness", "sick"]],
    ["travelImpact", ["travelImpact", "traveling", "travelingOrRecentlyReturned"]],
    ["backPain", ["backPain"]],
    ["generalPain", ["generalPain", "pain"]],
  ];
  const sourceLabels = Array.isArray(value.sourceLabels)
    ? value.sourceLabels.filter((label): label is string => typeof label === "string")
    : [];
  for (const [target, sources] of legacyAdverseFlags) {
    if (migrated[target] !== undefined) {
      continue;
    }
    const legacyValue = firstBoolean(value, sources);
    if (legacyValue === false) {
      migrated[target] = 0;
    } else if (legacyValue === true) {
      sourceLabels.push(`legacy-${target}-present-severity-unknown`);
    }
  }
  if (typeof value.daysSinceLastWorkout === "number" && value.daysSinceLastWorkout >= 0) {
    migrated.daysSinceLastWorkout = value.daysSinceLastWorkout;
  }
  if (typeof value.notes === "string") {
    migrated.notes = value.notes;
  }
  if (sourceLabels.length > 0) {
    migrated.sourceLabels = [...new Set(sourceLabels)];
  }
  return migrated;
}

function migrateWorkout(value: unknown, index: number): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const exercises = Array.isArray(value.exercises)
    ? value.exercises.map((entry) => {
        if (!isRecord(entry)) {
          return entry;
        }
        const sets = Array.isArray(entry.sets)
          ? entry.sets.map((set, setIndex) => {
              if (!isRecord(set)) {
                return set;
              }
              const failed = set.failedAttempt === true;
              return {
                ...set,
                id:
                  typeof set.id === "string"
                    ? set.id
                    : `${String(value.id ?? `workout-${index}`)}-set-${setIndex}`,
                completed:
                  typeof set.completed === "boolean"
                    ? set.completed
                    : !failed && typeof set.reps === "number",
                rir: asRating(set.rir),
              };
            })
          : [];
        return { ...entry, sets };
      })
    : [];
  return {
    ...value,
    chronologyIndex:
      typeof value.chronologyIndex === "number" ? value.chronologyIndex : index,
    context: migrateContext(value.context),
    exercises,
  };
}

function slug(value: string, index: number): string {
  const base = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `milestone-${index + 1}`;
}

function migrateGoal(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const milestones = Array.isArray(value.milestones)
    ? value.milestones.map((milestone, index) =>
        typeof milestone === "string"
          ? {
              id: slug(milestone, index),
              label: milestone,
            }
          : milestone,
      )
    : value.milestones;
  return { ...value, milestones };
}

function migrateNutritionEntry(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const legacyIllness = firstBoolean(value, ["illness", "sick"]);
  const legacyTravel = firstBoolean(value, ["travelImpact", "traveling"]);
  const migrationNotes = [
    legacyIllness === true
      ? "Legacy illness flag was present; severity was not recorded."
      : undefined,
    legacyTravel === true
      ? "Legacy travel flag was present; impact severity was not recorded."
      : undefined,
  ].filter((note): note is string => note !== undefined);
  const existingNotes = typeof value.notes === "string" ? value.notes : undefined;
  const preserved = Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !["sick", "traveling", "illness", "travelImpact"].includes(key),
    ),
  );
  const illness =
    firstRating(value, ["illness", "sick"]) ?? (legacyIllness === false ? 0 : undefined);
  const travelImpact =
    firstRating(value, ["travelImpact", "traveling"]) ??
    (legacyTravel === false ? 0 : undefined);
  return {
    ...preserved,
    appetite: asRating(value.appetite),
    mealQuality: asRating(value.mealQuality),
    ...(illness === undefined ? {} : { illness }),
    ...(travelImpact === undefined ? {} : { travelImpact }),
    notes:
      migrationNotes.length > 0
        ? [existingNotes, ...migrationNotes].filter(Boolean).join(" ")
        : existingNotes,
    dataQuality: migrationNotes.length > 0 ? "partial" : (value.dataQuality ?? "partial"),
  };
}

function migrateNote(value: unknown, index: number): unknown {
  if (typeof value === "string") {
    return {
      id: `migrated-note-${index + 1}`,
      title: "Migrated note",
      body: value,
      createdAt: "unknown",
    };
  }
  if (!isRecord(value)) {
    return value;
  }
  return {
    ...value,
    title: typeof value.title === "string" ? value.title : "Migrated note",
    body:
      typeof value.body === "string"
        ? value.body
        : typeof value.text === "string"
          ? value.text
          : "",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "unknown",
  };
}

/**
 * Migrates older browser backups into the current numeric-context schema.
 * Version 1 used boolean illness/travel/back flags and 1–5 recovery ratings.
 * A legacy `false` adverse flag becomes an explicit zero. A legacy `true`
 * flag is preserved as an unscored source label/note because it contains no
 * severity information and must not be invented as 6/6.
 */
export function migrateAppData(payload: unknown): PersistedGymData {
  if (!isRecord(payload)) {
    throw new ImportValidationError(
      validateAppData(payload, { expectedSchemaVersion: SCHEMA_VERSION }),
    );
  }
  const sourceVersion =
    typeof payload.schemaVersion === "number" ? payload.schemaVersion : 1;
  if (sourceVersion > SCHEMA_VERSION || sourceVersion < 1) {
    throw new Error(`Unsupported schema version: ${sourceVersion}.`);
  }

  const workouts = Array.isArray(payload.workouts)
    ? payload.workouts.map(migrateWorkout)
    : [];
  const nutritionSource = Array.isArray(payload.nutritionEntries)
    ? payload.nutritionEntries
    : Array.isArray(payload.nutrition)
      ? payload.nutrition
      : [];
  const nutritionEntries = nutritionSource.map(migrateNutritionEntry);
  const goals = Array.isArray(payload.goals) ? payload.goals.map(migrateGoal) : [];
  const notes = Array.isArray(payload.notes) ? payload.notes.map(migrateNote) : [];
  const settings = isRecord(payload.settings) ? payload.settings : {};
  const migrated = {
    schemaVersion: SCHEMA_VERSION,
    workouts,
    nutritionEntries,
    goals,
    notes,
    settings,
  } as PersistedGymData;

  assertValidImport(migrated, { expectedSchemaVersion: SCHEMA_VERSION });
  return migrated;
}

export function loadAppDataWithStatus(storage?: StorageLike): StorageLoadResult {
  const target = storageOrGlobal(storage);
  if (!target) {
    return {
      data: createEmptyAppData(),
      recoveredFromInvalidData: false,
    };
  }
  const raw = target.getItem(STORAGE_KEY);
  if (raw === null) {
    return {
      data: createEmptyAppData(),
      recoveredFromInvalidData: false,
    };
  }
  try {
    return {
      data: migrateAppData(JSON.parse(raw) as unknown),
      recoveredFromInvalidData: false,
    };
  } catch (error) {
    return {
      data: createEmptyAppData(),
      recoveredFromInvalidData: true,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export function loadAppData(storage?: StorageLike): PersistedGymData {
  return loadAppDataWithStatus(storage).data;
}

export function saveAppData(
  data: PersistedGymData,
  storage?: StorageLike,
): PersistedGymData {
  const validation = validateAppData(data, {
    expectedSchemaVersion: SCHEMA_VERSION,
  });
  if (!validation.valid) {
    throw new ImportValidationError(validation);
  }
  const target = storageOrGlobal(storage);
  if (!target) {
    throw new Error("localStorage is not available in this environment.");
  }
  const cleanData: PersistedGymData = {
    ...data,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: undefined,
  };
  target.setItem(STORAGE_KEY, JSON.stringify(cleanData));
  return cleanData;
}

function assertUnique(
  collections: ReadonlyArray<readonly { id: string }[]>,
  id: string,
): void {
  if (collections.some((items) => items.some((item) => item.id === id))) {
    throw new Error(`An item with ID "${id}" already exists.`);
  }
}

export function addWorkout(workout: Workout, storage?: StorageLike): PersistedGymData {
  const validation = validateWorkout(workout);
  if (!validation.valid) {
    throw new ImportValidationError(validation);
  }
  const data = loadAppData(storage);
  assertUnique(
    [data.workouts, data.nutritionEntries, data.goals, data.notes],
    workout.id,
  );
  return saveAppData({ ...data, workouts: [...data.workouts, workout] }, storage);
}

export function updateWorkout(workout: Workout, storage?: StorageLike): PersistedGymData {
  const validation = validateWorkout(workout);
  if (!validation.valid) {
    throw new ImportValidationError(validation);
  }
  const data = loadAppData(storage);
  if (!data.workouts.some((item) => item.id === workout.id)) {
    throw new Error(`Workout "${workout.id}" was not found.`);
  }
  return saveAppData(
    {
      ...data,
      workouts: data.workouts.map((item) => (item.id === workout.id ? workout : item)),
    },
    storage,
  );
}

export function deleteWorkout(id: string, storage?: StorageLike): PersistedGymData {
  const data = loadAppData(storage);
  return saveAppData(
    {
      ...data,
      workouts: data.workouts.filter((item) => item.id !== id),
    },
    storage,
  );
}

export function addNutritionEntry(
  entry: NutritionEntry,
  storage?: StorageLike,
): PersistedGymData {
  const validation = validateNutritionEntry(entry);
  if (!validation.valid) {
    throw new ImportValidationError(validation);
  }
  const data = loadAppData(storage);
  assertUnique([data.workouts, data.nutritionEntries, data.goals, data.notes], entry.id);
  return saveAppData(
    {
      ...data,
      nutritionEntries: [...data.nutritionEntries, entry],
    },
    storage,
  );
}

export function updateNutritionEntry(
  entry: NutritionEntry,
  storage?: StorageLike,
): PersistedGymData {
  const validation = validateNutritionEntry(entry);
  if (!validation.valid) {
    throw new ImportValidationError(validation);
  }
  const data = loadAppData(storage);
  if (!data.nutritionEntries.some((item) => item.id === entry.id)) {
    throw new Error(`Nutrition entry "${entry.id}" was not found.`);
  }
  return saveAppData(
    {
      ...data,
      nutritionEntries: data.nutritionEntries.map((item) =>
        item.id === entry.id ? entry : item,
      ),
    },
    storage,
  );
}

export function deleteNutritionEntry(
  id: string,
  storage?: StorageLike,
): PersistedGymData {
  const data = loadAppData(storage);
  return saveAppData(
    {
      ...data,
      nutritionEntries: data.nutritionEntries.filter((item) => item.id !== id),
    },
    storage,
  );
}

export function addGoal(goal: Goal, storage?: StorageLike): PersistedGymData {
  const data = loadAppData(storage);
  assertUnique([data.workouts, data.nutritionEntries, data.goals, data.notes], goal.id);
  return saveAppData({ ...data, goals: [...data.goals, goal] }, storage);
}

export function updateGoal(goal: Goal, storage?: StorageLike): PersistedGymData {
  const data = loadAppData(storage);
  if (!data.goals.some((item) => item.id === goal.id)) {
    throw new Error(`Goal "${goal.id}" was not found.`);
  }
  return saveAppData(
    {
      ...data,
      goals: data.goals.map((item) => (item.id === goal.id ? goal : item)),
    },
    storage,
  );
}

export function deleteGoal(id: string, storage?: StorageLike): PersistedGymData {
  const data = loadAppData(storage);
  return saveAppData(
    { ...data, goals: data.goals.filter((item) => item.id !== id) },
    storage,
  );
}

export function addNote(note: LocalNote, storage?: StorageLike): PersistedGymData {
  const data = loadAppData(storage);
  assertUnique([data.workouts, data.nutritionEntries, data.goals, data.notes], note.id);
  return saveAppData({ ...data, notes: [...data.notes, note] }, storage);
}

export function updateNote(note: LocalNote, storage?: StorageLike): PersistedGymData {
  const data = loadAppData(storage);
  if (!data.notes.some((item) => item.id === note.id)) {
    throw new Error(`Note "${note.id}" was not found.`);
  }
  return saveAppData(
    {
      ...data,
      notes: data.notes.map((item) => (item.id === note.id ? note : item)),
    },
    storage,
  );
}

export function deleteNote(id: string, storage?: StorageLike): PersistedGymData {
  const data = loadAppData(storage);
  return saveAppData(
    { ...data, notes: data.notes.filter((item) => item.id !== id) },
    storage,
  );
}

export function updateSettings(
  settings: Partial<GymSettings>,
  storage?: StorageLike,
): PersistedGymData {
  const data = loadAppData(storage);
  return saveAppData({ ...data, settings: { ...data.settings, ...settings } }, storage);
}

export function clearLocalData(storage?: StorageLike): void {
  storageOrGlobal(storage)?.removeItem(STORAGE_KEY);
}

export function exportDataAsJson(data: PersistedGymData, pretty = true): string {
  return JSON.stringify(
    { ...data, schemaVersion: SCHEMA_VERSION },
    null,
    pretty ? 2 : undefined,
  );
}

export function exportStoredDataAsJson(storage?: StorageLike, pretty = true): string {
  return exportDataAsJson(loadAppData(storage), pretty);
}

export const createJsonBackup = exportDataAsJson;

export function importDataFromJson(
  json: string,
  storage?: StorageLike,
): PersistedGymData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error("The selected backup is not valid JSON.");
  }
  const migrated = migrateAppData(parsed);
  return saveAppData(migrated, storage);
}

export const restoreFromBackup = importDataFromJson;

function backupDate(now: Date): string {
  return Number.isNaN(now.valueOf()) ? "undated" : now.toISOString().slice(0, 10);
}

export function downloadBackup(
  data: PersistedGymData,
  filename = `gym-backup-${backupDate(new Date())}.json`,
): string {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof Blob === "undefined"
  ) {
    throw new Error("Backup downloads require a browser.");
  }
  const blob = new Blob([exportDataAsJson(data)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return filename;
}
