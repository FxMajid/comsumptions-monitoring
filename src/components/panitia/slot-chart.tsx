import {
  PANITIA_SLOTS,
  VOUCHER_RATE,
  type PanitiaSlotBreakdown,
} from "@/lib/domain/panitia";
import { formatNumber, formatRupiah } from "@/lib/format";

/** A round hundred above the tallest column, so the top label has room to sit. */
function scaleTop(breakdowns: PanitiaSlotBreakdown[]): number {
  const peak = Math.max(...breakdowns.map((breakdown) => breakdown.total), 1);

  return Math.max(100, Math.ceil(peak / 100) * 100);
}

/**
 * Days carry a different number of meals, so each group is given a flex weight
 * equal to its column count. Every column then ends up the same width and the
 * day rail underneath lines up with the columns it labels.
 */
function byDay(breakdowns: PanitiaSlotBreakdown[]) {
  const days: Array<{ day: string; items: PanitiaSlotBreakdown[] }> = [];

  for (const breakdown of breakdowns) {
    const last = days.at(-1);

    if (last?.day === breakdown.slot.day) last.items.push(breakdown);
    else days.push({ day: breakdown.slot.day, items: [breakdown] });
  }

  return days;
}

function Segment({
  porsi,
  top,
  className,
  rounded,
  onBaseline,
}: Readonly<{
  porsi: number;
  top: number;
  className: string;
  /** Only the topmost segment of a column gets the rounded cap. */
  rounded: boolean;
  /** The lowest segment sits on the axis, so it keeps no separating gap. */
  onBaseline: boolean;
}>) {
  if (porsi === 0) {
    return null;
  }

  return (
    <div
      // The gap between stacked segments is a bottom border in the surface
      // colour rather than a margin, so the heights still add up to the total.
      className={`w-full ${className} ${rounded ? "rounded-t" : ""} ${
        onBaseline ? "" : "border-b-2 border-surface-raised"
      }`}
      style={{ height: `${(porsi / top) * 100}%` }}
    />
  );
}

/**
 * One column, plus the tooltip that opens over it on hover or keyboard focus.
 * The tooltip is pinned to whichever edge keeps it inside the card: centred in
 * the middle of the chart, but flush left or right at the two ends.
 */
function Column({
  breakdown,
  top,
  index,
  lastIndex,
  isPeak,
}: Readonly<{
  breakdown: PanitiaSlotBreakdown;
  top: number;
  index: number;
  lastIndex: number;
  isPeak: boolean;
}>) {
  const height = (breakdown.total / top) * 100;
  const align =
    index <= 1
      ? "left-0"
      : index >= lastIndex - 1
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <div
      tabIndex={0}
      className="group relative flex h-full flex-1 flex-col justify-end rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
    >
      <div
        className="pointer-events-none absolute inset-x-0"
        style={{ bottom: `${height}%` }}
      >
        {isPeak ? (
          <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-brand-text">
            Puncak
          </p>
        ) : null}
        <p className="numeric mb-1 text-center text-xs font-semibold">
          {formatNumber(breakdown.total)}
        </p>

        <div
          className={`absolute bottom-full z-10 mb-1 hidden w-44 rounded-lg border border-line bg-surface-raised p-3 text-left shadow-panel group-hover:block group-focus-visible:block ${align}`}
        >
          <p className="text-xs font-semibold">{breakdown.label}</p>
          <dl className="mt-2 space-y-1 text-[11px]">
            {[
              { label: "Internal", value: breakdown.internal },
              { label: "Eksternal", value: breakdown.eksternal },
              { label: "Kategori kosong", value: breakdown.kosong },
            ]
              .filter((line) => line.value > 0)
              .map((line) => (
                <div key={line.label} className="flex justify-between gap-2">
                  <dt className="text-ink-muted">{line.label}</dt>
                  <dd className="numeric font-medium">{formatNumber(line.value)}</dd>
                </div>
              ))}
            <div className="flex justify-between gap-2 border-t border-line pt-1">
              <dt className="text-ink-muted">Total porsi</dt>
              <dd className="numeric font-semibold">
                {formatNumber(breakdown.total)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-ink-muted">
            {breakdown.slot.scheme === "voucher"
              ? `Voucher ${formatRupiah(VOUCHER_RATE)} per orang`
              : `Katering, dari ${formatNumber(breakdown.rows)} baris yang hadir`}
          </p>
        </div>
      </div>

      <Stack breakdown={breakdown} top={top} />
    </div>
  );
}

/**
 * Segments top to bottom in DOM order. Built as a list so the cap lands on the
 * highest segment and the baseline gap is left off the lowest one, whichever
 * categories a slot happens to have.
 */
function Stack({
  breakdown,
  top,
}: Readonly<{ breakdown: PanitiaSlotBreakdown; top: number }>) {
  const segments = [
    {
      key: "kosong",
      porsi: breakdown.kosong,
      className: "hatch border-x border-t border-chart-gap",
    },
    { key: "eksternal", porsi: breakdown.eksternal, className: "bg-chart-external" },
    { key: "internal", porsi: breakdown.internal, className: "bg-chart-internal" },
  ].filter((segment) => segment.porsi > 0);

  return (
    <>
      {segments.map((segment, index) => (
        <Segment
          key={segment.key}
          porsi={segment.porsi}
          top={top}
          className={segment.className}
          rounded={index === 0}
          onBaseline={index === segments.length - 1}
        />
      ))}
    </>
  );
}

export function ChartLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {[
        { label: "Internal", className: "bg-chart-internal" },
        { label: "Eksternal", className: "bg-chart-external" },
        { label: "Kategori kosong", className: "hatch border border-chart-gap" },
      ].map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`size-2.5 shrink-0 rounded-sm ${item.className}`}
          />
          <span className="text-ink-muted">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Portions per meal slot, stacked by category and grouped by event day.
 *
 * The figure is decorative: the table underneath carries every number it draws,
 * so assistive tech is pointed there instead of at an invented ARIA structure.
 */
export function SlotChart({
  breakdowns,
}: Readonly<{ breakdowns: PanitiaSlotBreakdown[] }>) {
  const top = scaleTop(breakdowns);
  const days = byDay(breakdowns);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) => Math.round(top * step));
  const peak = breakdowns.reduce(
    (best, breakdown) => (breakdown.total > best.total ? breakdown : best),
    breakdowns[0],
  );
  const lastIndex = PANITIA_SLOTS.length - 1;

  return (
    <figure className="rounded-xl border border-line bg-surface-raised p-4 shadow-card sm:p-6">
      <div className="flex gap-2">
        <div className="relative h-56 w-9 shrink-0" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="numeric absolute right-0 translate-y-1/2 text-[11px] text-ink-muted"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              {formatNumber(tick)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-56"
          >
            {ticks.map((tick) => (
              <div
                key={tick}
                className="absolute inset-x-0 border-t border-line"
                style={{ bottom: `${(tick / top) * 100}%` }}
              />
            ))}
          </div>

          <div className="flex items-start gap-4 sm:gap-6">
            {days.map((day) => (
              <div key={day.day} className="min-w-0" style={{ flex: day.items.length }}>
                <div className="flex h-56 items-end gap-1.5 sm:gap-2">
                  {day.items.map((breakdown) => (
                    <Column
                      key={breakdown.slot.key}
                      breakdown={breakdown}
                      top={top}
                      index={PANITIA_SLOTS.findIndex(
                        (slot) => slot.key === breakdown.slot.key,
                      )}
                      lastIndex={lastIndex}
                      isPeak={breakdown.slot.key === peak.slot.key}
                    />
                  ))}
                </div>

                <div className="flex gap-1.5 border-t border-line pt-1.5 sm:gap-2">
                  {day.items.map((breakdown) => (
                    <p
                      key={breakdown.slot.key}
                      className="min-w-0 flex-1 truncate text-center text-[11px] text-ink-muted"
                    >
                      {breakdown.slot.meal}
                    </p>
                  ))}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
                  <p className="text-xs font-semibold">{day.day}</p>
                  {day.items[0].slot.scheme === "voucher" ? (
                    <span className="rounded border border-line bg-surface-sunken px-1 py-px font-mono text-[10px] text-ink-muted">
                      voucher
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <figcaption className="mt-5 border-t border-line pt-3 text-xs text-pretty text-ink-muted">
        Tinggi kolom adalah porsi pada satu slot makan, dipecah menurut kategori.
        Angka persisnya ada di tabel di bawah.
      </figcaption>
    </figure>
  );
}
