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

export type BudgetSummary = {
  allocatedAmount: string;
  invoicedAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  remainingAmount: string;
};

export type BudgetRealization = {
  budgetId: string;
  code: string;
  name: string;
  status: string;
  allocatedAmount: string;
  invoicedAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  remainingAmount: string;
  utilizationPercent: string | null;
};

export type EntitlementCounts = {
  pending: number;
  partiallyPicked: number;
  pickedUp: number;
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
 * The event every dashboard figure is scoped to: the one flagged active, or the
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

export async function getBudgetSummary(eventId: string): Promise<BudgetSummary> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("event_budget_summary")
    .select(
      "allocated_amount, invoiced_amount, paid_amount, outstanding_amount, remaining_amount",
    )
    .eq("event_id", eventId)
    .maybeSingle<{
      allocated_amount: string;
      invoiced_amount: string;
      paid_amount: string;
      outstanding_amount: string;
      remaining_amount: string;
    }>();

  return {
    allocatedAmount: data?.allocated_amount ?? "0",
    invoicedAmount: data?.invoiced_amount ?? "0",
    paidAmount: data?.paid_amount ?? "0",
    outstandingAmount: data?.outstanding_amount ?? "0",
    remainingAmount: data?.remaining_amount ?? "0",
  };
}

export async function getBudgetRealizations(
  eventId: string,
): Promise<BudgetRealization[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("budget_realizations")
    .select(
      "budget_id, code, name, status, allocated_amount, invoiced_amount, paid_amount, outstanding_amount, remaining_amount, utilization_percent",
    )
    .eq("event_id", eventId)
    .order("code", { ascending: true })
    .returns<
      {
        budget_id: string;
        code: string;
        name: string;
        status: string;
        allocated_amount: string;
        invoiced_amount: string;
        paid_amount: string;
        outstanding_amount: string;
        remaining_amount: string;
        utilization_percent: string | null;
      }[]
    >();

  return (data ?? []).map((row) => ({
    budgetId: row.budget_id,
    code: row.code,
    name: row.name,
    status: row.status,
    allocatedAmount: row.allocated_amount,
    invoicedAmount: row.invoiced_amount,
    paidAmount: row.paid_amount,
    outstandingAmount: row.outstanding_amount,
    remainingAmount: row.remaining_amount,
    utilizationPercent: row.utilization_percent,
  }));
}

export async function getEntitlementCounts(
  eventId: string,
): Promise<EntitlementCounts> {
  const supabase = await createSupabaseServerClient();

  async function countByStatus(status: string): Promise<number> {
    const { count } = await supabase
      .from("entitlement_statuses")
      .select("entitlement_id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", status);

    return count ?? 0;
  }

  const [pending, partiallyPicked, pickedUp] = await Promise.all([
    countByStatus("PENDING"),
    countByStatus("PARTIALLY_PICKED"),
    countByStatus("PICKED_UP"),
  ]);

  return { pending, partiallyPicked, pickedUp };
}
