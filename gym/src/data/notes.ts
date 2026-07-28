import type { TrainingNote } from "../lib/types";

export const trainingNotes: TrainingNote[] = [
  {
    id: "smith-loading",
    category: "equipment",
    title: "Smith Machine and Loading",
    points: [
      "The primary bench is a Smith machine with a 25 lb bar.",
      "All Smith-machine weights in the history already include the bar.",
      "Smith-machine records must not be silently compared with free-weight barbell records.",
      "The gym does not have 2.5 lb plates, so bench and similar bar-loading exercises normally increase by 10 lb total.",
      "Use rep progression before increasing load.",
      "Different machines may have different cable ratios or resistance curves; track stack values by machine.",
    ],
  },
  {
    id: "smith-bench-standard",
    category: "exercise-standard",
    title: "Smith-Machine Bench Standard",
    points: [
      "Use a consistent bench position.",
      "Lower under control to the normal intended chest position.",
      "Press to full lockout without assistance.",
      "Do not count partial repetitions.",
    ],
  },
  {
    id: "strict-pullup-standard",
    category: "exercise-standard",
    title: "Strict Pull-Up Standard",
    points: [
      "Begin from a dead hang or controlled near-dead hang.",
      "Maintain shoulder control and avoid excessive kicking or swinging.",
      "Bring the chin to or above the bar.",
      "Lower under control.",
      "Do not count partial repetitions.",
    ],
  },
  {
    id: "programming-principles",
    category: "programming",
    title: "Programming Principles",
    points: [
      "Primary objective is muscle growth with strength progression.",
      "Most compound sets should finish around 1–3 reps in reserve.",
      "Most isolation sets should finish around 0–2 reps in reserve.",
      "Repeated failed repetitions are discouraged.",
      "Prefer technical failure over an obviously impossible repetition.",
      "Do not test a one-repetition maximum every workout.",
      "Because weight jumps are large, progress through added repetitions.",
      "Show temporary reductions after travel, poor sleep, soreness, illness, or failed lifts with context.",
    ],
  },
  {
    id: "recovery-history",
    category: "recovery",
    title: "Recovery Context",
    points: [
      "A roughly 10-day gym break occurred during travel.",
      "No creatine was taken during that travel period.",
      "Mild illness and fatigue occurred after returning.",
      "Back pain has previously affected exercise selection.",
      "Reduced-volume recovery workouts should remain available.",
    ],
  },
  {
    id: "historical-data-quality",
    category: "data-quality",
    title: "Historical Data Quality",
    points: [
      "Five historical workouts have no exact date.",
      "Some final-set repetition counts were not recorded.",
      "Some cable and dumbbell weights may be per arm.",
      "Some shoulder sets were counted separately by side.",
      "Several entries are ramp-up sets rather than true working sets.",
      "Unknown values must remain unknown and uncertain entries stay explicitly marked.",
    ],
  },
  {
    id: "back-warning-signs",
    category: "safety",
    title: "Back-Pain Warning Signs",
    points: [
      "Stop for sharp pain, worsening pain, radiating symptoms, numbness, or weakness.",
      "Avoid heavy deadlifts and painful Romanian deadlifts when symptoms are active.",
      "Prefer supported or machine movements and reduce range, load, and volume.",
      "Seek qualified medical assessment for severe or neurological symptoms.",
    ],
  },
];

export const trainingNoteById = new Map(
  trainingNotes.map((note) => [note.id, note] as const),
);
