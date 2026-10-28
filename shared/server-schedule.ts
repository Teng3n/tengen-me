export const SERVER_SCHEDULE_TIME_ZONE = "America/Los_Angeles";

export const SERVER_SCHEDULE = {
  dailyStartLabel: "12:00 PM",
  weekdayShutdownLabel: "12:00 AM",
  weekendShutdownLabel: "2:00 AM",
  timeZoneLabel: "Pacific time",
} as const;

const localPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SERVER_SCHEDULE_TIME_ZONE,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function localParts(date: Date) {
  const parts = Object.fromEntries(localPartsFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    weekday: parts.weekday,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

export function serverScheduleDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return localParts(date).dateKey;
}

export function isServerScheduledOnline(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const { weekday, hour } = localParts(date);
  if (hour >= 12) return true;
  return hour < 2 && (weekday === "Sat" || weekday === "Sun");
}
