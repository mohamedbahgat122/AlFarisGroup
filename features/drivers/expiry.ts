export type ExpiryStatus = {
  state: "valid" | "today" | "expired";
  days: number;
};

const businessTimeZone = "Asia/Riyadh";
const dayMs = 24 * 60 * 60 * 1000;

export function getBusinessDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: businessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

export function getExpiryStatus(
  expiryDate: string,
  today: string,
): ExpiryStatus {
  const days = toCalendarDay(expiryDate) - toCalendarDay(today);

  if (days > 0) {
    return { state: "valid", days };
  }

  if (days === 0) {
    return { state: "today", days: 0 };
  }

  return { state: "expired", days: Math.abs(days) };
}

function toCalendarDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / dayMs);
}
