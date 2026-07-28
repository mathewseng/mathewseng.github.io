import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  goals as seedGoals,
  nutritionEntries as seedNutritionEntries,
  workouts as seedWorkouts,
} from "../data";
import {
  clearLocalData,
  createEmptyAppData,
  importDataFromJson,
  loadAppDataWithStatus,
  saveAppData,
  type PersistedGymData,
} from "../lib/storage";
import type { NutritionEntry, Workout } from "../lib/types";

interface AppStateValue {
  workouts: Workout[];
  nutritionEntries: NutritionEntry[];
  localData: PersistedGymData;
  recoveredFromInvalidData: boolean;
  storageError?: string;
  isLocalWorkout: (id: string) => boolean;
  isLocalNutritionEntry: (id: string) => boolean;
  getLocalWorkout: (id: string) => Workout | undefined;
  saveWorkout: (workout: Workout) => void;
  deleteWorkout: (id: string) => void;
  saveNutritionEntry: (entry: NutritionEntry) => void;
  deleteNutritionEntry: (id: string) => void;
  importLocalData: (json: string) => PersistedGymData;
  replaceLocalData: (data: PersistedGymData) => void;
  clearAllLocalData: () => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

function mergeById<T extends { id: string }>(
  seed: readonly T[],
  local: readonly T[],
): T[] {
  const values = new Map(seed.map((item) => [item.id, item] as const));
  for (const item of local) values.set(item.id, item);
  return [...values.values()];
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const initial = useMemo(() => loadAppDataWithStatus(), []);
  const [localData, setLocalData] = useState<PersistedGymData>(initial.data);
  const [storageError, setStorageError] = useState<string | undefined>(
    initial.error?.message,
  );

  function persist(next: PersistedGymData) {
    try {
      const saved = saveAppData(next);
      setLocalData(saved);
      setStorageError(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStorageError(message);
      throw error;
    }
  }

  const value = useMemo<AppStateValue>(() => {
    const workouts = mergeById<Workout>(seedWorkouts, localData.workouts);
    const nutritionEntries = mergeById<NutritionEntry>(
      seedNutritionEntries,
      localData.nutritionEntries,
    );

    return {
      workouts,
      nutritionEntries,
      localData,
      recoveredFromInvalidData: initial.recoveredFromInvalidData,
      storageError,
      isLocalWorkout: (id) => localData.workouts.some((item) => item.id === id),
      isLocalNutritionEntry: (id) =>
        localData.nutritionEntries.some((item) => item.id === id),
      getLocalWorkout: (id) => localData.workouts.find((item) => item.id === id),
      saveWorkout: (workout) => {
        const exists = localData.workouts.some((item) => item.id === workout.id);
        persist({
          ...localData,
          workouts: exists
            ? localData.workouts.map((item) => (item.id === workout.id ? workout : item))
            : [...localData.workouts, workout],
        });
      },
      deleteWorkout: (id) => {
        persist({
          ...localData,
          workouts: localData.workouts.filter((item) => item.id !== id),
        });
      },
      saveNutritionEntry: (entry) => {
        const exists = localData.nutritionEntries.some((item) => item.id === entry.id);
        persist({
          ...localData,
          nutritionEntries: exists
            ? localData.nutritionEntries.map((item) =>
                item.id === entry.id ? entry : item,
              )
            : [...localData.nutritionEntries, entry],
        });
      },
      deleteNutritionEntry: (id) => {
        persist({
          ...localData,
          nutritionEntries: localData.nutritionEntries.filter((item) => item.id !== id),
        });
      },
      importLocalData: (json) => {
        const imported = importDataFromJson(json);
        setLocalData(imported);
        setStorageError(undefined);
        return imported;
      },
      replaceLocalData: (data) => persist(data),
      clearAllLocalData: () => {
        clearLocalData();
        setLocalData(createEmptyAppData());
        setStorageError(undefined);
      },
    };
  }, [initial.recoveredFromInvalidData, localData, storageError]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error("useAppState must be used inside AppStateProvider.");
  }
  return value;
}

export const bundledGoalCount = seedGoals.length;
