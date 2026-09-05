import { formatNumber, formatShare } from "@/lib/format";

/**
 * The four figure forms this dashboard uses. Each one is a server component that
 * draws from numbers already computed elsewhere, so nothing here decides what a
 * figure means — only how it is drawn.
 */

/**
 * One ratio against a cap, drawn as a ring on the single dark card of the page.
 *
 * The card commits to dark in both colour schemes, so its text is set in literal
 * white rather than the ink token, which would vanish against it in light mode.
 */
export function RingGauge({
  percent,
  label,
  caption,
  over = false,
}: Readonly<{
  /** Null when there is no denominator, which draws an empty ring. */
  percent: number | null;
  label: string;
  caption: string;
  /** Past the cap: the ring stays full and turns to the alert colour. */
  over?: boolean;
}>) {
  const R = 54;
  const CIRCUMFERENCE = 2 * Math.PI * R;
  const drawn = percent === null ? 0 : Math.min(100, Math.max(0, percent));

  return (
    <div className="grid aspect-square place-items-center rounded-full bg-soft-dark p-3 shadow-soft">
      <div className="relative grid place-items-center">
        <svg
          viewBox="0 0 128 128"
          className="h-auto w-full max-w-32"
          role="img"
          aria-label={`${caption}: ${label}`}
        >
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke="oklch(1 0 0 / 0.16)"
            strokeWidth="10"
          />
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            className={over ? "stroke-alert" : "stroke-brand-500"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(drawn / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            transform="rotate(-90 64 64)"
          />
        </svg>

        <div className="absolute text-center">
          <p className="numeric text-xl font-semibold text-white">{label}</p>
          <p className="mt-0.5 text-[11px] text-white/70">{caption}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * A run of days as a dot matrix, filled up to today.
 *
 * The window is fixed rather than scaled to the countdown, so the texture means
 * the same thing whenever the page is opened: one dot is one day.
 */
export function DayDots({
  window: days,
  elapsed,
}: Readonly<{ window: number; elapsed: number }>) {
  const filled = Math.min(days, Math.max(0, elapsed));

  return (
    <div
      aria-hidden="true"
      className="flex flex-wrap gap-1"
      style={{ maxWidth: "12rem" }}
    >
      {Array.from({ length: days }, (_dot, index) => (
        <span
          key={index}
          className={`size-2 rounded-full ${
            index < filled ? "bg-brand-500" : "bg-soft-inset"
          }`}
        />
      ))}
    </div>
  );
}

export type FigurePoint = { label: string; value: number };

/**
 * Portions across the meal slots as a line over its own area.
 *
 * Straight segments between the seven readings, not a smoothed curve: a spline
 * through so few points invents values between them that the sheet never held.
 */
export function SlotSparkline({
  points,
  peakIndex,
}: Readonly<{ points: FigurePoint[]; peakIndex: number }>) {
  const W = 300;
  const H = 88;
  const PAD = 10;
  const top = Math.max(...points.map((point) => point.value), 1);
  const x = (index: number) =>
    PAD + (index * (W - PAD * 2)) / Math.max(1, points.length - 1);
  const y = (value: number) => H - PAD - (value / top) * (H - PAD * 2);
  const line = points.map((point, index) => `${x(index)},${y(point.value)}`);
  const last = points.length - 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-24 w-full"
      role="img"
      aria-label={`Porsi per slot makan, dari ${points[0]?.label} sampai ${points[last]?.label}. Puncak ${points[peakIndex]?.label} ${formatNumber(points[peakIndex]?.value ?? 0)} porsi.`}
    >
      <polygon
        className="fill-brand-500/12"
        points={`${x(0)},${H - PAD} ${line.join(" ")} ${x(last)},${H - PAD}`}
      />
      <polyline
        className="stroke-brand-500"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={line.join(" ")}
      />
      <circle
        cx={x(peakIndex)}
        cy={y(points[peakIndex]?.value ?? 0)}
        r="4"
        className="fill-brand-600 stroke-soft-card"
        strokeWidth="2"
      />
    </svg>
  );
}

/*
 * Light to dark, always ending on the solid step: the ramp is read from the end
 * so the innermost circle — the one drawn last, over all the others — is the
 * darkest whatever the number of rings.
 */
const RING_FILL = [
  "fill-brand-500/25",
  "fill-brand-500/45",
  "fill-brand-500/70",
  "fill-brand-600",
] as const;

/* The legend swatches. Written out rather than derived from RING_FILL by string
 * replacement: Tailwind only generates a utility it can find in the source, and
 * a class name assembled at runtime is never in the source. */
const RING_DOT = [
  "bg-brand-500/25",
  "bg-brand-500/45",
  "bg-brand-500/70",
  "bg-brand-600",
] as const;

/**
 * Nested circles sharing their lowest point, one per day.
 *
 * Radius is scaled by the square root of the value so that the *area* is what
 * carries the number. Scaling the radius directly — which is what this form
 * usually does — would make the largest day look many times bigger than it is.
 * Colour deepens inward only to keep the rings apart; it encodes nothing.
 */
export function NestedCircles({
  points,
  total,
}: Readonly<{ points: FigurePoint[]; total: number }>) {
  const SIZE = 250;
  const R = 116;
  const BASE = SIZE - 8;
  const CX = SIZE / 2;
  const top = Math.max(...points.map((point) => point.value), 1);
  const ordered = [...points].sort((a, b) => b.value - a.value);
  /** Distance from the innermost circle, clamped to the length of the ramp. */
  const step = (index: number) =>
    Math.max(0, RING_FILL.length - (ordered.length - index));

  return (
    <figure className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-56 justify-self-center"
        aria-hidden="true"
      >
        {ordered.map((point, index) => {
          const r = R * Math.sqrt(point.value / top);
          const innermost = index === ordered.length - 1;

          return (
            <g key={point.label}>
              <circle cx={CX} cy={BASE - r} r={r} className={RING_FILL[step(index)]} />
              {r > 15 ? (
                <text
                  x={CX}
                  y={BASE - 2 * r + 17}
                  textAnchor="middle"
                  className={`numeric text-[11px] font-semibold ${innermost ? "fill-white" : "fill-ink"}`}
                >
                  {formatNumber(point.value)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <figcaption className="text-sm">
        <dl className="grid gap-2">
          {ordered.map((point, index) => (
            <div key={point.label} className="flex items-baseline gap-2">
              <span
                aria-hidden="true"
                className={`size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-soft-hairline ${RING_DOT[step(index)]}`}
              />
              <dt className="font-medium">{point.label}</dt>
              <dd className="numeric ml-auto">
                {formatNumber(point.value)}
                <span className="ml-2 text-ink-muted">
                  {formatShare(total ? (point.value / total) * 100 : 0)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}

export type CoverageRow = { label: string; done: number; total: number };

/**
 * How much of each slot already has a named collector.
 *
 * The percentage is printed on every row rather than only drawn, so the bars are
 * a second reading of the numbers and not the only way to get them.
 */
export function CoverageRows({ rows }: Readonly<{ rows: CoverageRow[] }>) {
  return (
    <ul className="grid gap-2.5">
      {rows.map((row) => {
        const percent = row.total ? (row.done / row.total) * 100 : 0;

        return (
          <li key={row.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-3">
            <span className="truncate text-xs font-medium">{row.label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-soft-inset">
              <span
                aria-hidden="true"
                className="block h-full rounded-full bg-brand-500"
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </span>
            <span className="numeric text-right text-xs font-semibold">
              {formatShare(percent)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
