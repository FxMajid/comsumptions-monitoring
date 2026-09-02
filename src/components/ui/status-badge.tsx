import {
  statusLabel,
  statusTone,
  type StatusEntity,
  type StatusTone,
} from "@/lib/domain/status";

const TONE_CLASS = {
  neutral: "border-line bg-surface-sunken text-ink-muted",
  ok: "border-ok/40 bg-ok/10 text-ok",
  warn: "border-warn/40 bg-warn/10 text-warn",
  alert: "border-alert/40 bg-alert/10 text-alert",
} as const;

/** The pill itself, for statuses that are derived in a view rather than moved by
 * a transition and so have no StatusEntity of their own. */
export function Badge({
  tone,
  children,
}: Readonly<{ tone: StatusTone; children: React.ReactNode }>) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  entity,
  status,
}: Readonly<{ entity: StatusEntity; status: string }>) {
  return <Badge tone={statusTone(status)}>{statusLabel(entity, status)}</Badge>;
}
