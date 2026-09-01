export type Scale0To6 = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DataQuality = "complete" | "partial" | "estimated" | "ambiguous";

export type WorkoutType = "push" | "pull" | "legs" | "full-body" | "upper" | "other";

/**
 * Readiness and recovery signals are intentionally numeric.
 *
 * Higher is better for energy, sleepQuality, and appetite.
 * Higher is more impactful/severe for soreness, illness, travelImpact,
 * backPain, and generalPain. Historical scores stay undefined when the source
 * log did not provide enough information to place them on the scale.
 */
export interface WorkoutContext {
  energy?: Scale0To6;
  sleepQuality?: Scale0To6;
  soreness?: Scale0To6;
  appetite?: Scale0To6;
  illness?: Scale0To6;
  travelImpact?: Scale0To6;
  backPain?: Scale0To6;
  generalPain?: Scale0To6;
  daysSinceLastWorkout?: number;
  notes?: string;
  sourceLabels?: string[];
}

export interface ExerciseSet {
  id: string;
  weightLb?: number;
  reps?: number;
  /** Attempts that did not become completed repetitions. */
  attemptedReps?: number;
  rir?: Scale0To6;
  rirRange?: readonly [Scale0To6, Scale0To6];
  completed: boolean;
  failedAttempt?: boolean;
  technicalFailure?: boolean;
  warmup?: boolean;
  rampUp?: boolean;
  perSide?: boolean;
  durationSeconds?: number;
  distanceFeet?: number;
  assistedWeightLb?: number;
  notes?: string;
  dataQuality?: DataQuality;
}

export interface ExerciseEntry {
  exerciseId: string;
  name: string;
  equipment?: string;
  machineId?: string;
  sets: ExerciseSet[];
  notes?: string;
  dataQuality?: DataQuality;
}

export interface Workout {
  id: string;
  /** ISO YYYY-MM-DD. Absent means the source did not contain a date. */
  date?: string;
  /** Local wall-clock time in 24-hour HH:mm format. */
  startTime?: string;
  /** Total elapsed workout time, when supplied. */
  durationMinutes?: number;
  type: WorkoutType;
  title: string;
  context?: WorkoutContext;
  exercises: ExerciseEntry[];
  notes?: string;
  dataQuality: DataQuality;
  /** Preserves source chronology without assigning dates to undated sessions. */
  chronologyIndex: number;
}

export type GoalStatus =
  | "not-started"
  | "building-foundation"
  | "in-progress"
  | "near-milestone"
  | "achieved"
  | "paused"
  | "limited";

export type GoalCategory =
  "strength" | "hypertrophy" | "skill" | "consistency" | "recovery" | "nutrition";

export interface GoalMilestone {
  id: string;
  label: string;
  value?: number;
  unit?: string;
  achieved?: boolean;
}

export interface Goal {
  id: string;
  title: string;
  category: GoalCategory;
  status: GoalStatus;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  milestones?: GoalMilestone[];
  supportingExercises?: string[];
  successCriteria?: string[];
  progressionRules?: string[];
  safetyNotes?: string[];
  notes?: string;
}

export interface SupplementEntry {
  name: string;
  dose?: number;
  unit?: string;
  notes?: string;
}

export interface NutritionEntry {
  id: string;
  date: string;
  bodyWeightLb?: number;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  waterOz?: number;
  creatineG?: number;
  otherSupplements?: SupplementEntry[];
  appetite?: Scale0To6;
  mealQuality?: Scale0To6;
  illness?: Scale0To6;
  travelImpact?: Scale0To6;
  notes?: string;
  dataQuality: DataQuality;
}

export interface NutritionObservation {
  id: string;
  title: string;
  value?: number;
  valueRange?: readonly [number, number];
  unit?: string;
  status?: "reported" | "unknown" | "paused";
  notes: string;
  dataQuality: DataQuality;
}

export interface ReadinessInput {
  energy?: Scale0To6;
  sleepQuality?: Scale0To6;
  soreness?: Scale0To6;
  appetite?: Scale0To6;
  illness?: Scale0To6;
  travelImpact?: Scale0To6;
  backPain?: Scale0To6;
  generalPain?: Scale0To6;
  daysSinceLastWorkout?: number;
  lastWorkoutType?: WorkoutType;
}

export type ExerciseCategory =
  "chest" | "back" | "arms" | "shoulders" | "legs" | "carries" | "core";

export interface ExerciseDefinition {
  id: string;
  canonicalName: string;
  aliases: string[];
  category: ExerciseCategory;
  muscleGroups: string[];
  equipment: string[];
  weightMayBePerSide: boolean;
  volumeCalculationMeaningful: boolean;
  estimatedOneRepMaxAppropriate: boolean;
  failureRelativelySafe: boolean;
  mayStressBack: boolean;
  defaultRepRange?: readonly [number, number];
  defaultDurationRangeSeconds?: readonly [number, number];
  notes: string;
}

export interface TrainingProfile {
  bodyWeightLb: number;
  bodyWeightApproximate: boolean;
  partnerBodyWeightLb: number;
  partnerBodyWeightApproximate: boolean;
  trainingDaysPerWeek: readonly [number, number];
  split: readonly ["push", "pull", "legs"];
  currentTrainingHistory: string;
  previousExperience: string;
  primaryGoalStyle: string;
  equipmentContext: string[];
  currentConstraints: string[];
  mainGoalIds: string[];
}

export interface TrainingNote {
  id: string;
  category:
    | "equipment"
    | "exercise-standard"
    | "programming"
    | "recovery"
    | "data-quality"
    | "safety";
  title: string;
  points: string[];
}

export interface ProgramExercise {
  exerciseId: string;
  label: string;
  sets?: number;
  setRange?: readonly [number, number];
  reps?: number;
  repRange?: readonly [number, number];
  weightLb?: number;
  rirRange?: readonly [Scale0To6, Scale0To6];
  durationRangeSeconds?: readonly [number, number];
  optional?: boolean;
  alternatives?: string[];
  notes?: string;
}

export interface ProgramTemplate {
  id: string;
  title: string;
  type: WorkoutType;
  summary: string;
  exercises: ProgramExercise[];
  useWhen?: string[];
  avoidWhen?: string[];
  rules: string[];
}

export interface Benchmark {
  id: string;
  exerciseId: string;
  label: string;
  value: number;
  unit: "lb" | "reps" | "lb-volume";
  confirmed: boolean;
  workoutId?: string;
  notes?: string;
}
