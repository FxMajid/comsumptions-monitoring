import { statusLabel, statusTone, type StatusEntity } from "@/lib/domain/status";

const TONE_CLASS = {
  neutral: "border-line bg-surface-sunken text-ink-muted",
  ok: "border-ok/40 bg-ok/10 text-ok",
  warn: "border-warn/40 bg-warn/10 text-warn",
  alert: "border-alert/40 bg-alert/10 text-alert",
} as const;

export function StatusBadge({
  entity,
  status,
}: Readonly<{ entity: StatusEntity; status: string }>) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[statusTone(status)]}`}
    >
      {statusLabel(entity, status)}
    </span>
  );
}
