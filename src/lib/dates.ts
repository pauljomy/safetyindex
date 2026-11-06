// Dates in frontmatter are calendar days (UTC).
const formats: Record<string, Intl.DateTimeFormat> = {};
export function formatDate(date: Date | string, locale = "en-US"): string {
  return (formats[locale] ??= new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })).format(new Date(date));
}
export const isoDate = (date: Date | string) => new Date(date).toISOString().slice(0, 10);
export const latest = (...dates: (Date | string | undefined)[]) =>
  new Date(Math.max(...dates.filter(Boolean).map((d) => new Date(d!).getTime())));
