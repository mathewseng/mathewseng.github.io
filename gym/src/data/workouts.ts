import type { Workout } from "../lib/types";

/**
 * The eight source workouts, in the order they were recorded.
 *
 * chronologyIndex preserves relative ordering for the five undated sessions.
 * It must never be converted into a fabricated calendar date.
 */
export const workouts = [
  {
    id: "initial-bench-test",
    type: "push",
    title: "Initial Bench Test",
    chronologyIndex: 1,
    dataQuality: "partial",
    exercises: [
      {
        exerciseId: "smith-flat-bench",
        name: "Smith-Machine Flat Bench",
        equipment: "Smith machine",
        machineId: "primary-smith-machine",
        dataQuality: "partial",
        notes:
          "All weights include the 25 lb Smith bar. Intermediate loads were not tested, so this did not establish a precise maximum.",
        sets: [
          {
            id: "initial-bench-115",
            weightLb: 115,
            reps: 1,
            completed: true,
            notes: "Completed and described as easy; confirmed heavy single.",
            dataQuality: "complete",
          },
          {
            id: "initial-bench-135-fail",
            weightLb: 135,
            attemptedReps: 1,
            completed: false,
            failedAttempt: true,
            notes: "Failed attempt.",
            dataQuality: "complete",
          },
        ],
      },
    ],
    notes:
      "Exact date unknown. Confirmed successful heavy single: 115 lb. The 135 lb attempt was above current strength on that day.",
  },
  {
    id: "early-bench-incline-session",
    type: "push",
    title: "Early Bench and Incline Session",
    chronologyIndex: 2,
    dataQuality: "partial",
    context: {
      notes:
        "Long rests were taken. The failed 135 lb attempt likely affected later performance.",
    },
    exercises: [
      {
        exerciseId: "smith-flat-bench",
        name: "Smith-Machine Flat Bench",
        equipment: "Smith machine",
        machineId: "primary-smith-machine",
        dataQuality: "partial",
        notes:
          "The source says 115 lb was completed but does not record a repetition count; it remains unknown.",
        sets: [
          {
            id: "early-flat-115",
            weightLb: 115,
            completed: true,
            notes: "Completed; repetition count not recorded.",
            dataQuality: "partial",
          },
          {
            id: "early-flat-135-fail",
            weightLb: 135,
            attemptedReps: 1,
            completed: false,
            failedAttempt: true,
            dataQuality: "complete",
          },
          {
            id: "early-flat-95-1",
            weightLb: 95,
            reps: 5,
            completed: true,
            dataQuality: "complete",
          },
          {
            id: "early-flat-95-2",
            weightLb: 95,
            reps: 4,
            completed: true,
            dataQuality: "complete",
          },
          {
            id: "early-flat-95-3",
            weightLb: 95,
            reps: 3,
            completed: true,
            dataQuality: "complete",
          },
        ],
      },
      {
        exerciseId: "smith-incline-bench",
        name: "Smith-Machine Incline Bench",
        equipment: "Smith machine",
        machineId: "primary-smith-machine",
        dataQuality: "complete",
        sets: [
          {
            id: "early-incline-65-1",
            weightLb: 65,
            reps: 5,
            completed: true,
          },
          {
            id: "early-incline-65-2",
            weightLb: 65,
            reps: 5,
            completed: true,
          },
          {
            id: "early-incline-65-3",
            weightLb: 65,
            reps: 7,
            completed: true,
          },
        ],
      },
    ],
    notes: "Exact date unknown.",
  },
  {
    id: "poor-performance-bench-session",
    type: "push",
    title: "Poor-Performance Bench Session",
    chronologyIndex: 3,
    dataQuality: "partial",
    context: {
      daysSinceLastWorkout: 2,
      notes:
        "Occurred after approximately two days away from the gym. Several heavy attempts preceded the volume work.",
      sourceLabels: ["approximately-two-days-away", "repeated-heavy-attempts"],
    },
    exercises: [
      {
        exerciseId: "smith-flat-bench",
        name: "Smith-Machine Flat Bench",
        equipment: "Smith machine",
        machineId: "primary-smith-machine",
        dataQuality: "partial",
        sets: [
          {
            id: "poor-flat-135-fail",
            weightLb: 135,
            attemptedReps: 1,
            completed: false,
            failedAttempt: true,
            notes: "User reported barely being able to move the weight.",
          },
          {
            id: "poor-flat-125-fail",
            weightLb: 125,
            attemptedReps: 1,
            completed: false,
            failedAttempt: true,
            notes: "User reported barely being able to move the weight.",
          },
          {
            id: "poor-flat-115-fail",
            weightLb: 115,
            attemptedReps: 1,
            completed: false,
            failedAttempt: true,
            notes: "User reported barely being able to move the weight.",
          },
          {
            id: "poor-flat-95",
            weightLb: 95,
            reps: 3,
            completed: true,
          },
          {
            id: "poor-flat-75-1",
            weightLb: 75,
            reps: 10,
            completed: true,
          },
          {
            id: "poor-flat-75-2",
            weightLb: 75,
            completed: true,
            notes: "Completed set; exact repetition count unknown.",
            dataQuality: "partial",
          },
          {
            id: "poor-flat-75-3",
            weightLb: 75,
            completed: true,
            notes: "Completed set; exact repetition count unknown.",
            dataQuality: "partial",
          },
        ],
        notes:
          "The three failures likely caused substantial acute fatigue. The later work was intentionally converted to lighter volume.",
      },
    ],
    notes:
      "Exact date unknown. The sudden result should not be interpreted as proven long-term strength loss.",
  },
  {
    id: "push-2026-07-14",
    date: "2026-07-14",
    type: "push",
    title: "Push Workout",
    chronologyIndex: 4,
    dataQuality: "partial",
    exercises: [
      {
        exerciseId: "smith-flat-bench",
        name: "Smith-Machine Flat Bench",
        equipment: "Smith machine",
        machineId: "primary-smith-machine",
        dataQuality: "complete",
        sets: [
          {
            id: "2026-07-14-flat-1",
            weightLb: 95,
            reps: 7,
            completed: true,
          },
          {
            id: "2026-07-14-flat-1-fail",
            weightLb: 95,
            attemptedReps: 1,
            completed: false,
            failedAttempt: true,
            notes: "Attempted repetition 8.",
          },
          {
            id: "2026-07-14-flat-2",
            weightLb: 95,
            reps: 7,
            completed: true,
          },
          {
            id: "2026-07-14-flat-2-fail",
            weightLb: 95,
            attemptedReps: 1,
            completed: false,
            failedAttempt: true,
            notes: "Attempted repetition 8.",
          },
          {
            id: "2026-07-14-flat-3",
            weightLb: 95,
            reps: 5,
            completed: true,
          },
          {
            id: "2026-07-14-flat-3-fail",
            weightLb: 95,
            attemptedReps: 1,
            completed: false,
            failedAttempt: true,
            notes: "Attempted repetition 6.",
          },
        ],
        notes: "19 completed repetitions and 1,805 lb completed volume.",
      },
      {
        exerciseId: "smith-incline-bench",
        name: "Smith-Machine Incline Bench",
        equipment: "Smith machine",
        machineId: "primary-smith-machine",
        dataQuality: "estimated",
        sets: [
          {
            id: "2026-07-14-incline-1",
            weightLb: 55,
            reps: 8,
            completed: true,
            rirRange: [1, 2],
          },
          {
            id: "2026-07-14-incline-2",
            weightLb: 55,
            reps: 8,
            completed: true,
            rirRange: [1, 2],
          },
          {
            id: "2026-07-14-incline-3",
            weightLb: 55,
            reps: 8,
            completed: true,
            rirRange: [1, 2],
          },
        ],
        notes:
          "24 completed repetitions and 1,320 lb volume. Effort was estimated at approximately 1–2 reps from failure.",
      },
      {
        exerciseId: "triceps-pushdown",
        name: "Triceps Pushdown",
        equipment: "Cable machine",
        dataQuality: "complete",
        sets: [
          {
            id: "2026-07-14-pushdown-1",
            weightLb: 25,
            reps: 10,
            completed: true,
          },
          {
            id: "2026-07-14-pushdown-2",
            weightLb: 25,
            reps: 10,
            completed: true,
          },
          {
            id: "2026-07-14-pushdown-3",
            weightLb: 25,
            reps: 10,
            completed: true,
          },
        ],
        notes: "750 lb completed volume.",
      },
      {
        exerciseId: "overhead-triceps-extension",
        name: "Overhead Triceps Extension",
        dataQuality: "ambiguous",
        sets: [
          {
            id: "2026-07-14-overhead-1",
            weightLb: 15,
            completed: true,
            dataQuality: "partial",
          },
          {
            id: "2026-07-14-overhead-2",
            weightLb: 15,
            completed: true,
            dataQuality: "partial",
          },
          {
            id: "2026-07-14-overhead-3",
            weightLb: 15,
            completed: true,
            dataQuality: "partial",
          },
        ],
        notes:
          "Three sets were completed. Repetitions ranged approximately from 10 down to 6, but exact set-by-set counts and equipment were not recorded.",
      },
      {
        exerciseId: "shoulder-cable-work",
        name: "Shoulder Cable Work",
        equipment: "Cable machine",
        dataQuality: "partial",
        sets: [],
        notes:
          "Three different shoulder cable exercises were performed at approximately 2–5 reps from failure. Names, weights, set counts, and repetitions are incomplete.",
      },
    ],
  },
  {
    id: "push-2026-07-16",
    date: "2026-07-16",
    type: "push",
    title: "Push Workout",
    chronologyIndex: 5,
    dataQuality: "ambiguous",
    exercises: [
      {
        exerciseId: "smith-flat-bench",
        name: "Smith-Machine Flat Bench",
        equipment: "Smith machine",
        machineId: "primary-smith-machine",
        dataQuality: "complete",
        sets: [
          {
            id: "2026-07-16-flat-1",
            weightLb: 95,
            reps: 7,
            completed: true,
          },
          {
            id: "2026-07-16-flat-2",
            weightLb: 95,
            reps: 7,
            completed: true,
          },
          {
            id: "2026-07-16-flat-3",
            weightLb: 95,
            reps: 6,
            completed: true,
          },
        ],
        notes:
          "20 completed repetitions and 1,900 lb volume: +1 rep and +95 lb volume versus July 14.",
      },
      {
        exerciseId: "smith-incline-bench",
        name: "Smith-Machine Incline Bench",
        equipment: "Smith machine",
        machineId: "primary-smith-machine",
        dataQuality: "complete",
        sets: [
          {
            id: "2026-07-16-incline-1",
            weightLb: 55,
            reps: 9,
            completed: true,
          },
          {
            id: "2026-07-16-incline-2",
            weightLb: 55,
            reps: 10,
            completed: true,
          },
          {
            id: "2026-07-16-incline-3",
            weightLb: 55,
            reps: 11,
            completed: true,
          },
        ],
        notes: "30 completed repetitions and 1,650 lb volume.",
      },
      {
        exerciseId: "shoulder-press",
        name: "Shoulder Press",
        dataQuality: "ambiguous",
        sets: [
          {
            id: "2026-07-16-shoulder-1",
            weightLb: 30,
            reps: 10,
            completed: true,
            dataQuality: "ambiguous",
          },
          {
            id: "2026-07-16-shoulder-2",
            weightLb: 30,
            reps: 10,
            completed: true,
            dataQuality: "ambiguous",
          },
          {
            id: "2026-07-16-shoulder-3",
            weightLb: 30,
            reps: 12,
            completed: true,
            dataQuality: "ambiguous",
          },
        ],
        notes:
          "32 completed repetitions and 960 lb nominal volume. Equipment and whether 30 lb was a per-side load were not recorded.",
      },
      {
        exerciseId: "triceps-pushdown",
        name: "Triceps Pushdown",
        equipment: "Cable machine",
        dataQuality: "complete",
        sets: [
          {
            id: "2026-07-16-pushdown-1",
            weightLb: 25,
            reps: 12,
            completed: true,
          },
          {
            id: "2026-07-16-pushdown-2",
            weightLb: 25,
            reps: 11,
            completed: true,
          },
          {
            id: "2026-07-16-pushdown-3",
            weightLb: 25,
            reps: 9,
            completed: true,
          },
        ],
        notes: "32 completed repetitions and 800 lb volume.",
      },
      {
        exerciseId: "cable-lateral-raise",
        name: "Cable Lateral Raise",
        equipment: "Cable machine",
        dataQuality: "complete",
        sets: [
          {
            id: "2026-07-16-lateral-1",
            weightLb: 7.5,
            reps: 10,
            completed: true,
            perSide: true,
          },
          {
            id: "2026-07-16-lateral-2",
            weightLb: 7.5,
            reps: 10,
            completed: true,
            perSide: true,
          },
          {
            id: "2026-07-16-lateral-3",
            weightLb: 7.5,
            reps: 10,
            completed: true,
            perSide: true,
          },
        ],
        notes: "Performed one arm at a time; all three sets were 10 reps per arm.",
      },
      {
        exerciseId: "overhead-triceps-extension",
        name: "Overhead Triceps Extension",
        dataQuality: "ambiguous",
        sets: [
          {
            id: "2026-07-16-overhead-1",
            weightLb: 20,
            reps: 12,
            completed: true,
            dataQuality: "ambiguous",
          },
          {
            id: "2026-07-16-overhead-2",
            weightLb: 20,
            reps: 6,
            completed: true,
            dataQuality: "ambiguous",
          },
          {
            id: "2026-07-16-overhead-3",
            weightLb: 20,
            reps: 4,
            completed: true,
            dataQuality: "ambiguous",
          },
        ],
        notes:
          "22 completed repetitions and 440 lb nominal volume. Equipment and per-side loading were not recorded.",
      },
    ],
  },
  {
    id: "strict-pull-up-baseline",
    type: "pull",
    title: "Strict Pull-Up Baseline",
    chronologyIndex: 6,
    dataQuality: "estimated",
    exercises: [
      {
        exerciseId: "strict-pull-up",
        name: "Strict Pull-Up",
        equipment: "Pull-up bar",
        dataQuality: "estimated",
        sets: [
          {
            id: "pullup-baseline-1",
            reps: 5,
            completed: true,
          },
          {
            id: "pullup-baseline-2",
            reps: 5,
            completed: true,
          },
          {
            id: "pullup-baseline-3",
            reps: 3,
            completed: true,
          },
          {
            id: "pullup-baseline-fail",
            attemptedReps: 1,
            completed: false,
            failedAttempt: true,
            notes: "The following repetition could not be completed fully.",
          },
        ],
        notes:
          "Full descent to a dead hang, chin at or near the bar, and no partial repetition counted. Considerable rest between sets. Session total: 13. Estimated fresh maximum: approximately 5–6.",
      },
    ],
    notes: "Exact date unknown.",
  },
  {
    id: "return-from-travel-upper",
    type: "upper",
    title: "Return-from-Travel Upper-Body Session",
    chronologyIndex: 7,
    dataQuality: "ambiguous",
    context: {
      daysSinceLastWorkout: 10,
      notes:
        "Approximately 10 days without gym training; recently returned from travel; felt tired and sore. No numeric readiness ratings were recorded. Intended as a quick, easy full-body workout, but the actual session was primarily upper body. Creatine had not been taken during travel.",
      sourceLabels: [
        "recent-travel",
        "approximately-10-day-gym-break",
        "tired",
        "sore",
        "creatine-paused-during-travel",
      ],
    },
    exercises: [
      {
        exerciseId: "lat-pulldown",
        name: "Lat Pulldown",
        equipment: "Cable machine",
        dataQuality: "complete",
        sets: [
          {
            id: "return-pulldown-70",
            weightLb: 70,
            reps: 10,
            completed: true,
          },
          {
            id: "return-pulldown-90",
            weightLb: 90,
            reps: 10,
            completed: true,
          },
          {
            id: "return-pulldown-110",
            weightLb: 110,
            reps: 10,
            completed: true,
          },
        ],
        notes:
          "2,700 lb completed volume. Loads ascended, but the source did not classify individual sets as working or ramp-up.",
      },
      {
        exerciseId: "incline-bench-machine",
        name: "Incline Bench Machine",
        equipment: "Chest press machine",
        dataQuality: "complete",
        sets: [
          {
            id: "return-incline-30",
            weightLb: 30,
            reps: 10,
            completed: true,
          },
          {
            id: "return-incline-40",
            weightLb: 40,
            reps: 10,
            completed: true,
          },
          {
            id: "return-incline-50",
            weightLb: 50,
            reps: 10,
            completed: true,
          },
          {
            id: "return-incline-60",
            weightLb: 60,
            reps: 10,
            completed: true,
          },
        ],
        notes:
          "1,800 lb completed volume. Loads ascended, but the source did not classify individual sets as working or ramp-up.",
      },
      {
        exerciseId: "spider-curl",
        name: "Spider Curl",
        dataQuality: "ambiguous",
        sets: [
          {
            id: "return-spider-1",
            weightLb: 15,
            reps: 10,
            completed: true,
            dataQuality: "ambiguous",
          },
          {
            id: "return-spider-2",
            weightLb: 15,
            reps: 10,
            completed: true,
            dataQuality: "ambiguous",
          },
          {
            id: "return-spider-3",
            weightLb: 15,
            reps: 10,
            completed: true,
            dataQuality: "ambiguous",
          },
        ],
        notes: "It is unclear whether 15 lb was per hand.",
      },
      {
        exerciseId: "incline-curl",
        name: "Incline Curl",
        dataQuality: "ambiguous",
        sets: [
          {
            id: "return-incline-curl-1",
            weightLb: 15,
            reps: 10,
            completed: true,
            dataQuality: "ambiguous",
          },
          {
            id: "return-incline-curl-2",
            weightLb: 15,
            reps: 10,
            completed: true,
            dataQuality: "ambiguous",
          },
          {
            id: "return-incline-curl-3",
            weightLb: 15,
            reps: 10,
            completed: true,
            dataQuality: "ambiguous",
          },
        ],
        notes: "It is unclear whether 15 lb was per hand.",
      },
      {
        exerciseId: "triceps-pushdown",
        name: "Triceps Pushdown",
        equipment: "Cable machine",
        dataQuality: "complete",
        sets: [
          {
            id: "return-pushdown-1",
            weightLb: 30,
            reps: 10,
            completed: true,
          },
          {
            id: "return-pushdown-2",
            weightLb: 30,
            reps: 8,
            completed: true,
          },
          {
            id: "return-pushdown-3",
            weightLb: 30,
            reps: 5,
            completed: true,
          },
        ],
        notes: "690 lb completed volume.",
      },
      {
        exerciseId: "cable-lateral-raise",
        name: "Cable Lateral Raise",
        equipment: "Cable machine",
        dataQuality: "ambiguous",
        sets: [
          {
            id: "return-lateral-1",
            weightLb: 10,
            reps: 10,
            completed: true,
            perSide: true,
          },
          {
            id: "return-lateral-2",
            weightLb: 10,
            reps: 10,
            completed: true,
            perSide: true,
          },
          {
            id: "return-lateral-3",
            weightLb: 10,
            reps: 10,
            completed: true,
            perSide: true,
          },
        ],
        notes:
          "Three logical sets per movement are represented. The source reported 12 total shoulder sets, likely counting individual sides separately.",
      },
      {
        exerciseId: "cable-front-raise",
        name: "Cable Front Raise",
        equipment: "Cable machine",
        dataQuality: "ambiguous",
        sets: [
          {
            id: "return-front-1",
            weightLb: 10,
            reps: 10,
            completed: true,
            perSide: true,
          },
          {
            id: "return-front-2",
            weightLb: 10,
            reps: 10,
            completed: true,
            perSide: true,
          },
          {
            id: "return-front-3",
            weightLb: 10,
            reps: 10,
            completed: true,
            perSide: true,
          },
        ],
        notes:
          "Three logical sets per movement are represented. The source reported 12 total shoulder sets, likely counting individual sides separately.",
      },
    ],
    notes: "Exact date unknown.",
  },
  {
    id: "push-2026-07-28",
    date: "2026-07-28",
    type: "push",
    title: "Push Workout After Travel and Mild Illness",
    chronologyIndex: 8,
    dataQuality: "ambiguous",
    context: {
      notes:
        "Recently returned from travel and felt mildly sick/under the weather. No numeric context rating was supplied, so illness and travel impact remain unscored.",
      sourceLabels: ["recent-travel", "mild-illness", "under-the-weather"],
    },
    exercises: [
      {
        exerciseId: "smith-flat-bench",
        name: "Smith-Machine Flat Bench",
        equipment: "Smith machine",
        machineId: "primary-smith-machine",
        dataQuality: "complete",
        sets: [
          {
            id: "2026-07-28-flat-25",
            weightLb: 25,
            reps: 10,
            completed: true,
            warmup: true,
          },
          {
            id: "2026-07-28-flat-75",
            weightLb: 75,
            reps: 10,
            completed: true,
            rampUp: true,
          },
          {
            id: "2026-07-28-flat-85",
            weightLb: 85,
            reps: 9,
            completed: true,
            rampUp: true,
          },
          {
            id: "2026-07-28-flat-95",
            weightLb: 95,
            reps: 5,
            completed: true,
          },
        ],
        notes:
          "Ramp-up structure rather than multiple working sets at one weight. Do not interpret 95 lb × 5 as definite regression during illness.",
      },
      {
        exerciseId: "smith-incline-bench",
        name: "Smith-Machine Incline Bench",
        equipment: "Smith machine",
        machineId: "primary-smith-machine",
        dataQuality: "complete",
        sets: [
          {
            id: "2026-07-28-incline-25",
            weightLb: 25,
            reps: 10,
            completed: true,
            warmup: true,
          },
          {
            id: "2026-07-28-incline-45",
            weightLb: 45,
            reps: 10,
            completed: true,
            rampUp: true,
          },
          {
            id: "2026-07-28-incline-55",
            weightLb: 55,
            reps: 10,
            completed: true,
            rampUp: true,
          },
          {
            id: "2026-07-28-incline-65",
            weightLb: 65,
            reps: 10,
            completed: true,
          },
        ],
        notes: "65 lb × 10 is the best recorded incline top set.",
      },
      {
        exerciseId: "triceps-pushdown",
        name: "Triceps Pushdown",
        equipment: "Cable machine",
        dataQuality: "complete",
        sets: [
          {
            id: "2026-07-28-pushdown-1",
            weightLb: 30,
            reps: 10,
            completed: true,
          },
          {
            id: "2026-07-28-pushdown-2",
            weightLb: 30,
            reps: 10,
            completed: true,
          },
          {
            id: "2026-07-28-pushdown-3",
            weightLb: 30,
            reps: 10,
            completed: true,
          },
        ],
        notes:
          "900 lb completed volume. Previous return-from-travel result was 10, 8, 5 at the same weight.",
      },
      {
        exerciseId: "overhead-triceps-extension",
        name: "Overhead Triceps Extension",
        dataQuality: "ambiguous",
        sets: [
          {
            id: "2026-07-28-overhead-1",
            weightLb: 20,
            reps: 7,
            completed: true,
            dataQuality: "ambiguous",
          },
        ],
        notes: "Only one set was recorded; equipment was not specified.",
      },
      {
        exerciseId: "lateral-raise-unspecified",
        name: "Lateral Raise",
        dataQuality: "ambiguous",
        sets: [
          {
            id: "2026-07-28-lateral-1",
            weightLb: 10,
            reps: 20,
            completed: true,
            dataQuality: "ambiguous",
          },
          {
            id: "2026-07-28-lateral-2",
            weightLb: 15,
            reps: 15,
            completed: true,
            dataQuality: "ambiguous",
          },
          {
            id: "2026-07-28-lateral-3",
            weightLb: 15,
            reps: 15,
            completed: true,
            dataQuality: "ambiguous",
          },
        ],
        notes:
          "It is unclear whether this was dumbbell or cable resistance and whether the load was per side.",
      },
    ],
  },
] satisfies Workout[];

export const datedWorkouts = workouts.filter(
  (workout): workout is (typeof workouts)[number] & { date: string } =>
    workout.date !== undefined,
);

export const undatedWorkouts = workouts.filter((workout) => workout.date === undefined);

export const workoutsNewestFirst = [...workouts].sort((a, b) => {
  if (a.date && b.date) {
    return b.date.localeCompare(a.date);
  }

  return b.chronologyIndex - a.chronologyIndex;
});

export const workoutById = new Map(
  workouts.map((workout) => [workout.id, workout] as const),
);
