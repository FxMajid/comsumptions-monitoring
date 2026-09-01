export type StatTone = "neutral" | "ok" | "warn" | "alert";

const TONE_CLASS: Record<StatTone, string> = {
  neutral: "text-ink",
  ok: "text-ok",
  warn: "text-warn",
  alert: "text-alert",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: Readonly<{
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
}>) {
  return (
    <div className="rounded-lg border border-line bg-surface-raised p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      <p
        className={`numeric mt-2 text-xl font-semibold tabular-nums ${TONE_CLASS[tone]}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
