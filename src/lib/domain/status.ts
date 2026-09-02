/**
 * Mirror of public.status_transition_allowed in 005_status_flow.sql.
 *
 * The database trigger is authoritative — it is what stops a direct PostgREST
 * PATCH from writing a nonsense status. This file exists so the UI can label a
 * status and offer only the buttons that will actually succeed. Whenever the SQL
 * list changes, change this one in the same commit.
 */

export type StatusEntity =
  | "consumption_slots"
  | "consumption_plans"
  | "consumption_requests";

export type StatusTone = "neutral" | "ok" | "warn" | "alert";

const TRANSITIONS: Record<StatusEntity, Record<string, string[]>> = {
  consumption_slots: {
    DRAFT: ["OPEN", "CANCELLED"],
    OPEN: ["LOCKED", "CLOSED", "CANCELLED"],
    LOCKED: ["OPEN", "CLOSED", "CANCELLED"],
    CLOSED: [],
    CANCELLED: [],
  },
  consumption_plans: {
    PLANNED: ["APPROVED", "CANCELLED"],
    APPROVED: ["PLANNED", "LOCKED", "CANCELLED"],
    LOCKED: ["APPROVED", "CANCELLED"],
    CANCELLED: ["PLANNED"],
  },
  consumption_requests: {
    PLANNED: ["REQUESTED", "SENT", "CANCELLED"],
    REQUESTED: ["SENT", "PARTIALLY_RECEIVED", "RECEIVED", "PLANNED", "CANCELLED"],
    SENT: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
    PARTIALLY_RECEIVED: ["SENT", "RECEIVED", "CLOSED", "CANCELLED"],
    RECEIVED: ["PARTIALLY_RECEIVED", "SENT", "CLOSED", "CANCELLED"],
    CLOSED: [],
  },
};

/**
 * Transitions a human drives with a button. Received quantities are what move a
 * request into PARTIALLY_RECEIVED or RECEIVED — update_request_status() derives
 * those — so offering them as buttons would let someone claim goods arrived
 * without recording any. They stay legal in TRANSITIONS because the RPC needs
 * them; they are simply not offered here.
 */
const HIDDEN_FROM_UI: Partial<Record<StatusEntity, string[]>> = {
  consumption_requests: ["PARTIALLY_RECEIVED", "RECEIVED"],
};

const LABELS: Record<StatusEntity, Record<string, string>> = {
  consumption_slots: {
    DRAFT: "Draf",
    OPEN: "Dibuka",
    LOCKED: "Dikunci",
    CLOSED: "Ditutup",
    CANCELLED: "Dibatalkan",
  },
  consumption_plans: {
    PLANNED: "Direncanakan",
    APPROVED: "Disetujui",
    LOCKED: "Dikunci",
    CANCELLED: "Dibatalkan",
  },
  consumption_requests: {
    PLANNED: "Draf",
    REQUESTED: "Diajukan",
    SENT: "Dikirim ke vendor",
    PARTIALLY_RECEIVED: "Diterima sebagian",
    RECEIVED: "Diterima penuh",
    CLOSED: "Ditutup",
    CANCELLED: "Dibatalkan",
  },
};

const TONES: Record<string, StatusTone> = {
  DRAFT: "neutral",
  PLANNED: "neutral",
  OPEN: "ok",
  REQUESTED: "warn",
  SENT: "warn",
  APPROVED: "ok",
  PARTIALLY_RECEIVED: "warn",
  RECEIVED: "ok",
  LOCKED: "neutral",
  CLOSED: "neutral",
  CANCELLED: "alert",
};

/** Verbs for the transition buttons, keyed by the status being moved to. */
const ACTION_LABELS: Record<string, string> = {
  OPEN: "Buka",
  LOCKED: "Kunci",
  CLOSED: "Tutup",
  CANCELLED: "Batalkan",
  DRAFT: "Kembalikan ke draf",
  PLANNED: "Kembalikan ke draf",
  APPROVED: "Setujui",
  REQUESTED: "Ajukan",
  SENT: "Tandai terkirim",
};

export function statusLabel(entity: StatusEntity, status: string): string {
  return LABELS[entity][status] ?? status;
}

export function statusTone(status: string): StatusTone {
  return TONES[status] ?? "neutral";
}

export function transitionLabel(status: string): string {
  return ACTION_LABELS[status] ?? status;
}

export function isTransitionAllowed(
  entity: StatusEntity,
  from: string,
  to: string,
): boolean {
  return (TRANSITIONS[entity][from] ?? []).includes(to);
}

/** The buttons to render for a row currently in `from`. */
export function offeredTransitions(entity: StatusEntity, from: string): string[] {
  const hidden = HIDDEN_FROM_UI[entity] ?? [];

  return (TRANSITIONS[entity][from] ?? []).filter(
    (status) => !hidden.includes(status),
  );
}

export function knownStatuses(entity: StatusEntity): string[] {
  return Object.keys(LABELS[entity]);
}

/**
 * A request whose lines may still be edited. Unlike the transition rules this is
 * deliberately app-level and not a trigger: reversing a receiving on a CLOSED
 * order still has to be able to write to its lines.
 */
export function isRequestOpen(status: string): boolean {
  return ["PLANNED", "REQUESTED", "SENT", "PARTIALLY_RECEIVED"].includes(status);
}
