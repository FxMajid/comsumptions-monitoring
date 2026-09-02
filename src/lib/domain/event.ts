import { createSupabaseServerClient } from "@/lib/supabase/server";

const EVENT_COLUMNS = "id, code, name, event_date, status";

type EventRow = {
  id: string;
  code: string | null;
  name: string;
  event_date: string | null;
  status: string;
};

export type ActiveEvent = {
  id: string;
  code: string | null;
  name: string;
  eventDate: string | null;
  status: string;
};

export const EVENT_STATUS_LABELS: Record<string, string> = {
  active: "Berjalan",
  inactive: "Belum aktif",
  completed: "Selesai",
};

function toActiveEvent(row: EventRow): ActiveEvent {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    eventDate: row.event_date,
    status: row.status,
  };
}

/**
 * The event every figure in the app is scoped to: the one flagged active, or the
 * most recent one when nothing is active. Returns null when there are no events,
 * which is also what a signed-in user with no read access sees.
 */
export async function getActiveEvent(): Promise<ActiveEvent | null> {
  const supabase = await createSupabaseServerClient();

  const active = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("status", "active")
    .limit(1)
    .maybeSingle<EventRow>();

  if (active.data) {
    return toActiveEvent(active.data);
  }

  const latest = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<EventRow>();

  return latest.data ? toActiveEvent(latest.data) : null;
}

/**
 * Server actions receive an event id from the form, but a client can send any
 * uuid. This resolves the caller's own active event instead of trusting input.
 */
export async function requireActiveEventId(): Promise<string | null> {
  const event = await getActiveEvent();

  return event?.id ?? null;
}
