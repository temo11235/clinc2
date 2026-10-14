import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const CLINIC_TZ = "Africa/Cairo";

/** Build a UTC Date from a Cairo-local "YYYY-MM-DD" + "HH:mm". */
export function cairoToUtc(dateStr: string, timeStr: string): Date {
  return fromZonedTime(`${dateStr}T${timeStr.length === 5 ? timeStr : timeStr.slice(0, 5)}:00`, CLINIC_TZ);
}

export function utcToCairo(d: Date): Date {
  return toZonedTime(d, CLINIC_TZ);
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return formatInTimeZone(new Date(d), CLINIC_TZ, "yyyy-MM-dd");
}

export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return formatInTimeZone(new Date(d), CLINIC_TZ, "HH:mm");
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return formatInTimeZone(new Date(d), CLINIC_TZ, "yyyy-MM-dd HH:mm");
}

/** Cairo calendar day string for a given instant. */
export function cairoDayString(d: Date = new Date()): string {
  return formatInTimeZone(d, CLINIC_TZ, "yyyy-MM-dd");
}

/** Start (inclusive) and end (exclusive) UTC instants of a Cairo calendar day. */
export function cairoDayBounds(dateStr: string): { start: Date; end: Date } {
  const start = cairoToUtc(dateStr, "00:00");
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function cairoRangeBounds(fromStr: string, toStr: string): { start: Date; end: Date } {
  const start = cairoDayBounds(fromStr).start;
  const end = cairoDayBounds(toStr).end;
  return { start, end };
}

export function addDaysStr(dateStr: string, days: number): string {
  const d = cairoDayBounds(dateStr).start;
  return cairoDayString(new Date(d.getTime() + days * 86400000));
}

/** 0 = Sunday ... 6 = Saturday, in Cairo. */
export function cairoWeekday(d: Date): number {
  return Number(formatInTimeZone(d, CLINIC_TZ, "i")) % 7;
}

export const WEEKDAY_NAMES_AR = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

/** Normalize an Egyptian phone number to E.164 (+20...). */
export function normalizeEgyptPhone(raw: string): string | null {
  const digits = String(raw ?? "")
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+");
  let d = digits.replace(/^\+/, "");
  if (d.startsWith("20")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  if (!/^1[0-25]\d{8}$/.test(d)) {
    // allow Cairo landlines (2 + 8 digits)
    if (/^2\d{7,8}$/.test(d)) return `+20${d}`;
    return null;
  }
  return `+20${d}`;
}

export function displayPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  return e164.startsWith("+20") ? `0${e164.slice(3)}` : e164;
}

/** Current epoch ms — wrapped so server components stay lint-clean. */
export function nowMs(): number {
  return new Date().getTime();
}
