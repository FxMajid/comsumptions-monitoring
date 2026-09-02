const RUPIAH = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const NUMBER = new Intl.NumberFormat("id-ID");

/** Postgres numeric arrives as a string so precision is not lost in transit. */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatRupiah(value: string | number | null | undefined): string {
  return RUPIAH.format(toNumber(value));
}

export function formatNumber(value: string | number | null | undefined): string {
  return NUMBER.format(toNumber(value));
}

export function formatPercent(value: string | number | null | undefined): string {
  return `${NUMBER.format(toNumber(value))}%`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

/**
 * The event runs on Jakarta time. A timestamptz is stored in UTC, so anything
 * shown to or typed by a committee member is converted through this zone rather
 * than the browser's or the server's, which would drift by deployment region.
 */
export const EVENT_TIME_ZONE = "Asia/Jakarta";
export const EVENT_UTC_OFFSET = "+07:00";

const DATE_TIME = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: EVENT_TIME_ZONE,
});

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? "—" : `${DATE_TIME.format(parsed)} WIB`;
}

/** Postgres `time` arrives as "11:00:00"; only hours and minutes are shown. */
export function formatTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "—";
}

export function formatTimeRange(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): string {
  if (!startsAt && !endsAt) {
    return "—";
  }

  if (startsAt && endsAt) {
    return `${formatTime(startsAt)}–${formatTime(endsAt)}`;
  }

  return startsAt ? `mulai ${formatTime(startsAt)}` : `sampai ${formatTime(endsAt)}`;
}

/**
 * Fills a datetime-local input. The stored instant is rendered in Jakarta time
 * so the value shown matches the value the user originally typed.
 */
export function toDateTimeInputValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: EVENT_TIME_ZONE,
  }).formatToParts(parsed);

  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const hour = lookup("hour") === "24" ? "00" : lookup("hour");

  return `${lookup("year")}-${lookup("month")}-${lookup("day")}T${hour}:${lookup("minute")}`;
}
