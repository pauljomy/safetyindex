// Release schedule (brief section 14): a page is built only once its release date
// has passed. Pages from before the build use their publish date. A generated page
// (it has `generatedOn`) without a `releaseDate` waits for scripts/release/release.mjs.
//   BUILD_DATE=2026-12-01  build as of that day
//   PREVIEW_ALL=1          build every page, released or not (local review only; never deploy)

const day = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const buildDay = day(process.env.BUILD_DATE ? new Date(process.env.BUILD_DATE) : new Date());
export const previewAll = process.env.PREVIEW_ALL === "1";

interface Dated { date?: Date; generatedOn?: Date; releaseDate?: Date }

export function releaseOf(d: Dated): Date | undefined {
  if (d.releaseDate) return d.releaseDate;
  if (d.generatedOn) return undefined;
  return d.date;
}

export function isReleased(d: Dated): boolean {
  if (previewAll) return true;
  const r = releaseOf(d);
  return !!r && day(r) <= buildDay;
}
