const DAY = 86_400_000;
export const midnight = (date: string) => Date.parse(date + "T00:00:00+09:00");
export const dateJST = (ms: number) =>
  new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
export const dateOffset = (date: string, days: number) =>
  dateJST(midnight(date) + days * DAY);
export const weekday = (date: string) =>
  new Date(date + "T12:00:00Z").getUTCDay() || 7;
export const minuteOf = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export function clock(minute: number, dayLabel = false) {
  const total = Math.floor(minute + 1e-7),
    days = Math.floor(total / 1440);
  const t = ((total % 1440) + 1440) % 1440;
  const digits = (v: number) => String(v).padStart(2, "0");
  const label =
    !dayLabel || days === 0
      ? ""
      : days === 1
        ? "翌 "
        : days === -1
          ? "前日 "
          : days + "日 ";
  return label + digits(Math.floor(t / 60)) + ":" + digits(t % 60);
}
