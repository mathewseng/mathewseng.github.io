import type { TrainingProfile } from "../lib/types";

export const profile: TrainingProfile = {
  bodyWeightLb: 140,
  bodyWeightApproximate: true,
  partnerBodyWeightLb: 120,
  partnerBodyWeightApproximate: true,
  trainingDaysPerWeek: [4, 5],
  split: ["push", "pull", "legs"],
  currentTrainingHistory:
    "Resumed consistent lifting approximately two months before these logs.",
  previousExperience:
    "Lifted recreationally in high school, then stopped for several years.",
  primaryGoalStyle: "Muscle growth with measurable strength and skill goals.",
  equipmentContext: [
    "Primary bench press equipment is a Smith machine.",
    "The Smith-machine bar weighs 25 lb.",
    "All reported Smith-machine weights already include the 25 lb bar.",
    "Smith-machine numbers remain separate from free-weight barbell numbers.",
    "The smallest normal bench-loading increase available is 10 lb total.",
    "The gym does not have 2.5 lb plates for normal progression.",
  ],
  currentConstraints: [
    "A previous back injury caused at least one skipped leg day.",
    "Back-sensitive movements should be modified when symptoms are active.",
    "Recent travel caused an approximately 10-day break from gym training.",
    "Tiredness, soreness, and mild illness were reported after returning.",
    "Recommendations should account for sleep, travel, illness, soreness, and back discomfort.",
  ],
  mainGoalIds: [
    "bench-body-weight",
    "ten-strict-pullups",
    "build-muscle",
    "carry-partner",
    "consistent-ppl",
    "back-safe-legs",
  ],
};

export const smithMachineContext = {
  machineId: "primary-smith-machine",
  barWeightLb: 25,
  smallestNormalTotalIncreaseLb: 10,
  hasTwoAndAHalfPoundPlates: false,
  reportedWeightsIncludeBar: true,
} as const;
