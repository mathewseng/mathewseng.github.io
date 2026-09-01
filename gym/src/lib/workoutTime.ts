const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidWorkoutStartTime(value: unknown): value is string {
  return typeof value === "string" && LOCAL_TIME_PATTERN.test(value);
}

export function formatWorkoutStartTime(value: string): string {
  const match = LOCAL_TIME_PATTERN.exec(value);
  if (!match) return value;

  const hour = Number(match[1]);
  const minute = match[2];
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

export function formatWorkoutDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0
    ? `${hours} ${hours === 1 ? "hr" : "hrs"}`
    : `${hours} ${hours === 1 ? "hr" : "hrs"} ${remainder} min`;
}
