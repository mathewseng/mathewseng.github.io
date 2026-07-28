import { describe, expect, it } from "vitest";

import {
  averageRecorded,
  calculateCreatineAdherence,
  calculateMovingAverage,
  getCreatineNotice,
  getCreatineTravelGaps,
  getNutritionSummary,
  getSevenDayAverageBodyWeight,
  getThirtyDayBodyWeightTrend,
} from "../src/lib/nutritionCalculations";
import type { NutritionEntry } from "../src/lib/types";

function entry(
  id: string,
  date: string,
  values: Partial<NutritionEntry> = {},
): NutritionEntry {
  return {
    id,
    date,
    dataQuality: "complete",
    ...values,
  };
}

describe("nutrition averages and trends", () => {
  const entries = [
    entry("1", "2026-07-01", {
      bodyWeightLb: 139,
      calories: 2_000,
      proteinG: 120,
    }),
    entry("2", "2026-07-25", {
      bodyWeightLb: 140,
      calories: 2_200,
    }),
    entry("3", "2026-07-26", {
      bodyWeightLb: 141,
      proteinG: 140,
    }),
    entry("4", "2026-07-28", {
      bodyWeightLb: 142,
      calories: 2_400,
      proteinG: 160,
    }),
  ];

  it("averages only recorded values and never turns missing values into zero", () => {
    expect(averageRecorded(entries, "calories")).toBe(2_200);
    expect(averageRecorded([entry("missing", "2026-07-28")], "proteinG")).toBeUndefined();

    const summary = getNutritionSummary(entries, "2026-07-28");
    expect(summary.averageBodyWeightLb).toBe(141);
    expect(summary.averageCalories).toBe(2_300);
    expect(summary.averageProteinG).toBe(150);
    expect(summary.fieldsMissingAllData).toContain("waterOz");
  });

  it("calculates a trailing seven-day body-weight average", () => {
    expect(getSevenDayAverageBodyWeight(entries, "2026-07-28")).toBe(141);
  });

  it("produces a 30-day descriptive weight trend with missing-data counts", () => {
    const trend = getThirtyDayBodyWeightTrend(entries, "2026-07-28");

    expect(trend).toMatchObject({
      periodDays: 30,
      earliestWeightLb: 139,
      latestWeightLb: 142,
      changeLb: 3,
      direction: "up",
      recordedDays: 4,
      missingDays: 26,
    });
    expect(trend.slopeLbPerWeek).toBeGreaterThan(0);
  });

  it("returns moving-average samples only where data exists", () => {
    const points = calculateMovingAverage(entries, "proteinG", 7);

    expect(points.at(-1)).toMatchObject({
      date: "2026-07-28",
      value: 150,
      sampleCount: 2,
    });
    expect(points.every((point) => point.value !== 0)).toBe(true);
  });
});

describe("creatine tracking", () => {
  it("shows a neutral review notice at 15 g without blocking the entry", () => {
    expect(getCreatineNotice(14.9).show).toBe(false);
    expect(getCreatineNotice(15)).toMatchObject({
      show: true,
      level: "review",
      requiresAcknowledgement: true,
    });
    expect(getCreatineNotice(20).message).toMatch(
      /short loading protocols.*not a personalized prescription/i,
    );
  });

  it("represents an approximate ten-day travel pause without fake daily dates", () => {
    const annotation = {
      id: "travel-pause",
      approximateDays: 10,
      reason: "Travel; no creatine was taken",
      doseStatus: "paused" as const,
      notes: "Exact start and end dates were not recorded.",
    };

    expect(getCreatineTravelGaps([], [annotation])).toEqual([annotation]);
    expect(getCreatineTravelGaps([], [annotation])[0]?.startDate).toBeUndefined();
  });

  it("groups only explicit zero-dose travel days into dated gaps", () => {
    const gaps = getCreatineTravelGaps([
      entry("a", "2026-07-01", { travelImpact: 5, creatineG: 0 }),
      entry("b", "2026-07-02", { travelImpact: 5, creatineG: 0 }),
      entry("missing-dose", "2026-07-03", { travelImpact: 5 }),
    ]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      approximateDays: 2,
      doseStatus: "paused",
    });
  });

  it("calculates adherence only after the user supplies a personal target", () => {
    const adherence = calculateCreatineAdherence(
      [
        entry("a", "2026-07-01", { creatineG: 5 }),
        entry("b", "2026-07-02"),
        entry("c", "2026-07-03", { creatineG: 4.5 }),
      ],
      5,
      0.5,
    );

    expect(adherence).toEqual({
      targetG: 5,
      recordedDays: 2,
      daysMeetingPlan: 2,
      adherencePercent: 100,
    });
  });
});
