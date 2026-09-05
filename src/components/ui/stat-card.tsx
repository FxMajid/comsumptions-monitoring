export type StatTone = "neutral" | "ok" | "warn" | "alert";

const TONE_CLASS: Record<StatTone, string> = {
  neutral: "text-ink",
  ok: "text-ok",
  warn: "text-warn",
  alert: "text-alert",
};

/**
 * A secondary figure. The label is sentence case on purpose: a page carrying
 * four to nine of these turns into noise when every label is set in caps, and
 * the uppercase treatment is worth more on the one eyebrow above the group.
 */
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
    <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-card">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className={`numeric mt-1.5 text-xl font-semibold ${TONE_CLASS[tone]}`}>
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 text-xs leading-relaxed text-pretty text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
