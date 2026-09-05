import { formatNumber, formatShare } from "@/lib/format";
import type { StatusTone } from "@/lib/domain/status";

/**
 * A share is the one thing a utility class cannot express, so both components
 * here set an inline width. Everything else stays in the styling system.
 */
const FILL_CLASS: Record<StatusTone, string> = {
  neutral: "bg-ink-muted",
  ok: "bg-ok",
  warn: "bg-warn",
  alert: "bg-alert",
};

/** One ratio against a cap: invoiced against pagu, picked against entitled. */
export function Meter({
  label,
  valueLabel,
  percent,
  tone = "neutral",
}: Readonly<{
  label: string;
  valueLabel: string;
  /** Null when there is no denominator to measure against. */
  percent: number | null;
  tone?: StatusTone;
}>) {
  // The caller keeps the true figure for the label; the bar only needs a width
  // it can actually draw, so an overrun clamps instead of escaping the track.
  const width = percent === null ? 0 : Math.min(100, Math.max(0, percent));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        <p className="numeric text-xs font-semibold">{valueLabel}</p>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === null ? undefined : Math.round(width)}
        aria-valuetext={valueLabel}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full ${FILL_CLASS[tone]}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export type DistributionSegment = {
  label: string;
  count: number;
  percent: number;
  tone: StatusTone;
};

/**
 * How a total splits across statuses. Three equal cards would say the same thing
 * without showing the proportion, which is the part worth seeing at a glance.
 */
export function DistributionBar({
  segments,
  emptyLabel,
}: Readonly<{ segments: DistributionSegment[]; emptyLabel: string }>) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);

  if (total === 0) {
    return <p className="text-sm text-ink-muted">{emptyLabel}</p>;
  }

  return (
    <div>
      {/*
        The bar repeats what the legend below already states in words, so it is
        hidden from assistive tech rather than dressed in invented ARIA. The
        hairline between segments is a border, not a gap, so the widths still
        add up to exactly 100%.
      */}
      <div
        aria-hidden="true"
        className="flex h-2.5 overflow-hidden rounded-full bg-line"
      >
        {segments
          .filter((segment) => segment.count > 0)
          .map((segment) => (
            <div
              key={segment.label}
              className={`border-r border-surface-raised last:border-r-0 ${FILL_CLASS[segment.tone]}`}
              style={{ width: `${segment.percent}%` }}
            />
          ))}
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className={`mt-1.5 size-2 shrink-0 rounded-full ${FILL_CLASS[segment.tone]}`}
            />
            <div className="min-w-0">
              <dt className="text-xs font-medium text-ink-muted">
                {segment.label}
              </dt>
              <dd className="numeric mt-0.5 text-lg font-semibold">
                {formatNumber(segment.count)}
                <span className="ml-1.5 text-xs font-medium text-ink-muted">
                  {formatShare(segment.percent)}
                </span>
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
