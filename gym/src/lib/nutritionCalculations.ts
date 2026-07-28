import type { NutritionEntry } from "./types";

export type NumericNutritionField =
  | "bodyWeightLb"
  | "calories"
  | "proteinG"
  | "carbsG"
  | "fatG"
  | "fiberG"
  | "waterOz"
  | "creatineG"
  | "appetite"
  | "mealQuality"
  | "illness"
  | "travelImpact";

export interface MovingAveragePoint {
  date: string;
  value: number;
  sampleCount: number;
}

export interface BodyWeightTrend {
  periodDays: number;
  startDate?: string;
  endDate?: string;
  earliestWeightLb?: number;
  latestWeightLb?: number;
  averageWeightLb?: number;
  changeLb?: number;
  slopeLbPerWeek?: number;
  direction: "up" | "down" | "stable" | "unknown";
  recordedDays: number;
  missingDays: number;
}

export interface NutritionSummary {
  periodStart?: string;
  periodEnd?: string;
  recordedEntryCount: number;
  averageBodyWeightLb?: number;
  averageCalories?: number;
  averageProteinG?: number;
  averageCarbsG?: number;
  averageFatG?: number;
  averageFiberG?: number;
  averageWaterOz?: number;
  averageCreatineG?: number;
  fieldsMissingAllData: NumericNutritionField[];
}

export interface CreatineNotice {
  show: boolean;
  level: "none" | "review";
  title: string;
  message: string;
  requiresAcknowledgement: boolean;
}

export interface CreatineTravelGapAnnotation {
  id: string;
  startDate?: string;
  endDate?: string;
  approximateDays?: number;
  reason: string;
  doseStatus: "paused" | "unknown";
  notes?: string;
}

export interface CreatineAdherence {
  targetG: number;
  recordedDays: number;
  daysMeetingPlan: number;
  adherencePercent?: number;
}

const DAY_MS = 86_400_000;

function dateValue(date: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return undefined;
  }
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function isoDate(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function numericValue(
  entry: NutritionEntry,
  field: NumericNutritionField,
): number | undefined {
  const value = entry[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function averageRecorded(
  entries: readonly NutritionEntry[],
  field: NumericNutritionField,
): number | undefined {
  const values = entries
    .map((entry) => numericValue(entry, field))
    .filter((value): value is number => value !== undefined);
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export const calculateAverage = averageRecorded;

function latestEntryDate(entries: readonly NutritionEntry[]): string | undefined {
  return entries
    .map((entry) => entry.date)
    .filter((date) => dateValue(date) !== undefined)
    .sort()
    .at(-1);
}

export function getEntriesInDateWindow(
  entries: readonly NutritionEntry[],
  days: number,
  asOf = latestEntryDate(entries),
): NutritionEntry[] {
  const end = asOf ? dateValue(asOf) : undefined;
  if (end === undefined || !Number.isInteger(days) || days < 1) {
    return [];
  }
  const start = end - (days - 1) * DAY_MS;

  return entries
    .filter((entry) => {
      const timestamp = dateValue(entry.date);
      return timestamp !== undefined && timestamp >= start && timestamp <= end;
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function getSevenDayAverageBodyWeight(
  entries: readonly NutritionEntry[],
  asOf?: string,
): number | undefined {
  return averageRecorded(
    getEntriesInDateWindow(entries, 7, asOf ?? latestEntryDate(entries)),
    "bodyWeightLb",
  );
}

export function calculateMovingAverage(
  entries: readonly NutritionEntry[],
  field: NumericNutritionField,
  windowDays: number,
): MovingAveragePoint[] {
  const dated = entries
    .filter((entry) => dateValue(entry.date) !== undefined)
    .sort((left, right) => left.date.localeCompare(right.date));

  return dated.flatMap((entry) => {
    const average = averageRecorded(
      getEntriesInDateWindow(dated, windowDays, entry.date),
      field,
    );
    if (average === undefined) {
      return [];
    }
    const sampleCount = getEntriesInDateWindow(dated, windowDays, entry.date).filter(
      (item) => numericValue(item, field) !== undefined,
    ).length;
    return [{ date: entry.date, value: average, sampleCount }];
  });
}

function linearSlopePerDay(
  points: ReadonlyArray<{ timestamp: number; value: number }>,
): number | undefined {
  if (points.length < 2) {
    return undefined;
  }
  const xValues = points.map(
    (point) => (point.timestamp - points[0]!.timestamp) / DAY_MS,
  );
  const xMean = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
  const yMean = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < points.length; index += 1) {
    const xDelta = xValues[index]! - xMean;
    numerator += xDelta * (points[index]!.value - yMean);
    denominator += xDelta ** 2;
  }
  return denominator === 0 ? undefined : numerator / denominator;
}

export function getThirtyDayBodyWeightTrend(
  entries: readonly NutritionEntry[],
  asOf?: string,
): BodyWeightTrend {
  const window = getEntriesInDateWindow(entries, 30, asOf ?? latestEntryDate(entries));
  const points = window.flatMap((entry) => {
    const timestamp = dateValue(entry.date);
    return timestamp !== undefined &&
      typeof entry.bodyWeightLb === "number" &&
      Number.isFinite(entry.bodyWeightLb)
      ? [{ timestamp, value: entry.bodyWeightLb, date: entry.date }]
      : [];
  });
  const slopePerDay = linearSlopePerDay(points);
  const earliest = points[0];
  const latest = points.at(-1);
  const change = earliest && latest ? latest.value - earliest.value : undefined;
  const slopeLbPerWeek =
    slopePerDay === undefined ? undefined : Math.round(slopePerDay * 7 * 100) / 100;
  const direction =
    slopeLbPerWeek === undefined
      ? "unknown"
      : slopeLbPerWeek > 0.1
        ? "up"
        : slopeLbPerWeek < -0.1
          ? "down"
          : "stable";

  return {
    periodDays: 30,
    startDate: earliest?.date,
    endDate: latest?.date,
    earliestWeightLb: earliest?.value,
    latestWeightLb: latest?.value,
    averageWeightLb: averageRecorded(window, "bodyWeightLb"),
    changeLb: change === undefined ? undefined : Math.round(change * 100) / 100,
    slopeLbPerWeek,
    direction,
    recordedDays: points.length,
    missingDays: Math.max(0, 30 - points.length),
  };
}

export function getNutritionSummary(
  entries: readonly NutritionEntry[],
  asOf?: string,
  windowDays = 7,
): NutritionSummary {
  const window = getEntriesInDateWindow(
    entries,
    windowDays,
    asOf ?? latestEntryDate(entries),
  );
  const fields: NumericNutritionField[] = [
    "bodyWeightLb",
    "calories",
    "proteinG",
    "carbsG",
    "fatG",
    "fiberG",
    "waterOz",
    "creatineG",
  ];

  return {
    periodStart: window[0]?.date,
    periodEnd: window.at(-1)?.date,
    recordedEntryCount: window.length,
    averageBodyWeightLb: averageRecorded(window, "bodyWeightLb"),
    averageCalories: averageRecorded(window, "calories"),
    averageProteinG: averageRecorded(window, "proteinG"),
    averageCarbsG: averageRecorded(window, "carbsG"),
    averageFatG: averageRecorded(window, "fatG"),
    averageFiberG: averageRecorded(window, "fiberG"),
    averageWaterOz: averageRecorded(window, "waterOz"),
    averageCreatineG: averageRecorded(window, "creatineG"),
    fieldsMissingAllData: fields.filter(
      (field) => averageRecorded(window, field) === undefined,
    ),
  };
}

export function getCreatineNotice(
  source: number | Pick<NutritionEntry, "creatineG"> | undefined,
): CreatineNotice {
  const dose = typeof source === "number" ? source : source?.creatineG;
  if (dose === undefined || dose < 15) {
    return {
      show: false,
      level: "none",
      title: "No dose review notice",
      message: "",
      requiresAcknowledgement: false,
    };
  }

  return {
    show: true,
    level: "review",
    title: "Review the duration of this creatine plan",
    message:
      "A dose of 15–20 g/day resembles commonly studied short loading protocols, while lower maintenance amounts are commonly used afterward. This is background information, not a personalized prescription. Consider reviewing prolonged high-dose use and relevant medical concerns with a qualified clinician.",
    requiresAcknowledgement: true,
  };
}

export const getHighDoseCreatineNotice = getCreatineNotice;

export function getCreatineTravelGaps(
  entries: readonly NutritionEntry[],
  annotations: readonly CreatineTravelGapAnnotation[] = [],
): CreatineTravelGapAnnotation[] {
  const exactZeroTravelDays = entries
    .filter(
      (entry) =>
        entry.travelImpact !== undefined &&
        entry.travelImpact > 0 &&
        entry.creatineG === 0 &&
        dateValue(entry.date) !== undefined,
    )
    .sort((left, right) => left.date.localeCompare(right.date));
  const inferred: CreatineTravelGapAnnotation[] = [];

  for (const entry of exactZeroTravelDays) {
    const previous = inferred.at(-1);
    const timestamp = dateValue(entry.date)!;
    const previousEnd = previous?.endDate ? dateValue(previous.endDate) : undefined;
    if (previous && previousEnd !== undefined && timestamp - previousEnd === DAY_MS) {
      previous.endDate = entry.date;
      previous.approximateDays =
        Math.round((timestamp - dateValue(previous.startDate!)!) / DAY_MS) + 1;
    } else {
      inferred.push({
        id: `travel-gap-${entry.date}`,
        startDate: entry.date,
        endDate: entry.date,
        approximateDays: 1,
        reason: "travel",
        doseStatus: "paused",
        notes: "Derived only from an explicitly recorded zero-dose travel day.",
      });
    }
  }

  return [...annotations, ...inferred];
}

export function calculateCreatineAdherence(
  entries: readonly NutritionEntry[],
  targetG: number,
  toleranceG = 0,
): CreatineAdherence {
  const recorded = entries.filter(
    (entry): entry is NutritionEntry & { creatineG: number } =>
      typeof entry.creatineG === "number" &&
      Number.isFinite(entry.creatineG) &&
      entry.creatineG >= 0,
  );
  const daysMeetingPlan = recorded.filter(
    (entry) => Math.abs(entry.creatineG - targetG) <= toleranceG,
  ).length;

  return {
    targetG,
    recordedDays: recorded.length,
    daysMeetingPlan,
    adherencePercent:
      recorded.length === 0
        ? undefined
        : Math.round((daysMeetingPlan / recorded.length) * 1000) / 10,
  };
}

export function dateRangeForDays(
  endDate: string,
  days: number,
): { startDate: string; endDate: string } | undefined {
  const end = dateValue(endDate);
  if (end === undefined || !Number.isInteger(days) || days < 1) {
    return undefined;
  }
  return {
    startDate: isoDate(end - (days - 1) * DAY_MS),
    endDate,
  };
}
