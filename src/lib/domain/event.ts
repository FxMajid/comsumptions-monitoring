import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EVENT_TIME_ZONE } from "@/lib/format";
import type { StatusTone } from "@/lib/domain/status";

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

const EVENT_STATUS_TONES: Record<string, StatusTone> = {
  active: "ok",
  inactive: "warn",
  completed: "neutral",
};

/**
 * Amber for `inactive` is deliberate. getActiveEvent falls back to the most
 * recent event when nothing is flagged active, and a reader deserves to see
 * that the figures come from the fallback rather than from a running event.
 */
export function eventStatusTone(status: string): StatusTone {
  return EVENT_STATUS_TONES[status] ?? "neutral";
}

const DAY_MS = 86_400_000;

const JAKARTA_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: EVENT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Whole days from today to the event, negative once it has passed and null when
 * no date is set.
 *
 * Both ends are reduced to a calendar day in Jakarta before subtracting, so the
 * countdown does not change with the server's region or the time of day: a
 * timezone-naive diff between two instants would report a different number of
 * days depending on which side of midnight UTC the request landed.
 */
export function daysUntilEvent(eventDate: string | null): number | null {
  if (!eventDate) {
    return null;
  }

  const target = Date.parse(`${eventDate.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${JAKARTA_DAY.format(new Date())}T00:00:00Z`);

  return Number.isNaN(target) ? null : Math.round((target - today) / DAY_MS);
}
