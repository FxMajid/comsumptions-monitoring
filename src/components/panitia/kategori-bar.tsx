import { formatNumber, formatShare } from "@/lib/format";

export type KategoriSegment = {
  label: string;
  porsi: number;
  /** The fill: one of the categorical chart hues, or the hatch for a data gap. */
  className: string;
  hint: string;
};

/**
 * How the total portions split across Internal, Eksternal, and the rows whose
 * category was never filled in.
 *
 * `DistributionBar` in the shared UI would have done the drawing, but it paints
 * its segments with the status tones. Internal against Eksternal is not good
 * against bad news, so this one takes the categorical chart tokens instead and
 * leaves the status palette to mean what it means everywhere else.
 */
export function KategoriBar({
  segments,
}: Readonly<{ segments: KategoriSegment[] }>) {
  const total = segments.reduce((sum, segment) => sum + segment.porsi, 0);

  if (total === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Belum ada porsi yang bisa dibagi ke kategori mana pun.
      </p>
    );
  }

  return (
    <div>
      {/*
        The bar restates the list below, so it is hidden from assistive tech
        rather than dressed in invented ARIA. The separator between segments is
        a border, not a gap, so the widths still add up to exactly 100%.
      */}
      <div
        aria-hidden="true"
        className="flex h-2.5 overflow-hidden rounded-full bg-line"
      >
        {segments
          .filter((segment) => segment.porsi > 0)
          .map((segment) => (
            <div
              key={segment.label}
              className={`border-r border-surface-raised last:border-r-0 ${segment.className}`}
              style={{ width: `${(segment.porsi / total) * 100}%` }}
            />
          ))}
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className={`mt-1.5 size-2.5 shrink-0 rounded-sm ${segment.className}`}
            />
            <div className="min-w-0">
              <dt className="text-xs font-medium text-ink-muted">{segment.label}</dt>
              <dd className="numeric mt-0.5 text-lg font-semibold">
                {formatNumber(segment.porsi)}
                <span className="ml-1.5 text-xs font-medium text-ink-muted">
                  {formatShare((segment.porsi / total) * 100)}
                </span>
              </dd>
              <p className="mt-1 text-xs text-pretty text-ink-muted">{segment.hint}</p>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
