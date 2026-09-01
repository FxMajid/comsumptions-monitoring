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
