import type { WeekStart } from "@/masroof/types";

export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(now = new Date()): string {
  return fmtDate(now);
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return fmtDate(d);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const d = parseIsoDate(iso);
  return fmtDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function addMonths(iso: string, n: number): string {
  const d = parseIsoDate(iso);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const dim = daysInMonth(target.getFullYear(), target.getMonth());
  target.setDate(Math.min(day, dim));
  return fmtDate(target);
}

export type Range = { start: string; end: string; key: string };

export function monthRange(iso: string): Range {
  return { start: startOfMonth(iso), end: endOfMonth(iso), key: monthKey(iso) };
}

export function weekRange(iso: string, weekStartsOn: WeekStart): Range {
  const d = parseIsoDate(iso);
  const delta = (d.getDay() - weekStartsOn + 7) % 7;
  const start = addDays(iso, -delta);
  const end = addDays(start, 6);
  return { start, end, key: `w:${start}` };
}

export function previousRange(range: Range, period: "monthly" | "weekly", weekStartsOn: WeekStart): Range {
  if (period === "weekly") return weekRange(addDays(range.start, -1), weekStartsOn);
  return monthRange(addDays(range.start, -1));
}

export function daysInclusive(from: string, to: string): number {
  const a = parseIsoDate(from).getTime();
  const b = parseIsoDate(to).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export function calendarCells(year: number, monthIndex: number, weekStartsOn: WeekStart): (string | null)[] {
  const first = new Date(year, monthIndex, 1);
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const dim = daysInMonth(year, monthIndex);
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let d = 1; d <= dim; d += 1) cells.push(fmtDate(new Date(year, monthIndex, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function clampMonthDay(year: number, monthIndex: number, day: number): string {
  const dim = daysInMonth(year, monthIndex);
  return fmtDate(new Date(year, monthIndex, Math.min(Math.max(1, day), dim)));
}

const SUNDAY = new Date(2023, 0, 1);

export function weekdayLabels(weekStartsOn: WeekStart, locale: "en" | "ar"): string[] {
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en", { weekday: "narrow" });
  const labels: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(SUNDAY);
    d.setDate(SUNDAY.getDate() + ((weekStartsOn + i) % 7));
    labels.push(fmt.format(d));
  }
  return labels;
}

export function formatMonthTitle(year: number, monthIndex: number, locale: "en" | "ar", eastern = false): string {
  const raw = new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));
  return eastern ? toEasternDigits(raw) : raw;
}

export function formatPrettyDate(iso: string, locale: "en" | "ar", eastern = false): string {
  const raw = new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parseIsoDate(iso));
  return eastern ? toEasternDigits(raw) : raw;
}

export function toEasternDigits(value: string): string {
  const east = "٠١٢٣٤٥٦٧٨٩";
  return value.replace(/\d/g, (d) => east[Number(d)] ?? d);
}

export function zoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
