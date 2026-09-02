import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SlotOverview = {
  id: string;
  code: string;
  name: string;
  relativeDayOffset: number | null;
  slotDate: string;
  startsAt: string | null;
  endsAt: string | null;
  pickupDeadline: string | null;
  status: string;
  planCount: number;
  plannedQuantity: number;
  entitlementQuantity: number;
};

export type PlanCoverage = {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unitOfMeasure: string;
  slotId: string;
  slotCode: string;
  slotName: string;
  slotDate: string;
  slotStatus: string;
  plannedQuantity: number;
  unitCost: string | null;
  status: string;
  notes: string | null;
  requestedQuantity: number;
  sentQuantity: number;
  receivedQuantity: number;
  unorderedQuantity: number;
  plannedAmount: string;
};

const SLOT_COLUMNS =
  "consumption_slot_id, code, name, relative_day_offset, slot_date, starts_at, ends_at, pickup_deadline, status, plan_count, planned_quantity, entitlement_quantity";

type SlotRow = {
  consumption_slot_id: string;
  code: string;
  name: string;
  relative_day_offset: number | null;
  slot_date: string;
  starts_at: string | null;
  ends_at: string | null;
  pickup_deadline: string | null;
  status: string;
  plan_count: number;
  planned_quantity: number;
  entitlement_quantity: number;
};

function toSlotOverview(row: SlotRow): SlotOverview {
  return {
    id: row.consumption_slot_id,
    code: row.code,
    name: row.name,
    relativeDayOffset: row.relative_day_offset,
    slotDate: row.slot_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    pickupDeadline: row.pickup_deadline,
    status: row.status,
    planCount: row.plan_count,
    plannedQuantity: row.planned_quantity,
    entitlementQuantity: row.entitlement_quantity,
  };
}

export async function getSlotOverviews(eventId: string): Promise<SlotOverview[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_slot_overview")
    .select(SLOT_COLUMNS)
    .eq("event_id", eventId)
    .order("slot_date", { ascending: true })
    .order("starts_at", { ascending: true, nullsFirst: true })
    .order("code", { ascending: true })
    .returns<SlotRow[]>();

  return (data ?? []).map(toSlotOverview);
}

export async function getSlotOverview(id: string): Promise<SlotOverview | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_slot_overview")
    .select(SLOT_COLUMNS)
    .eq("consumption_slot_id", id)
    .maybeSingle<SlotRow>();

  return data ? toSlotOverview(data) : null;
}

const PLAN_COLUMNS =
  "consumption_plan_id, consumption_item_id, item_code, item_name, unit_of_measure, consumption_slot_id, slot_code, slot_name, slot_date, slot_status, planned_quantity, unit_cost, status, notes, requested_quantity, sent_quantity, received_quantity, unordered_quantity, planned_amount";

type PlanRow = {
  consumption_plan_id: string;
  consumption_item_id: string;
  item_code: string;
  item_name: string;
  unit_of_measure: string;
  consumption_slot_id: string;
  slot_code: string;
  slot_name: string;
  slot_date: string;
  slot_status: string;
  planned_quantity: number;
  unit_cost: string | null;
  status: string;
  notes: string | null;
  requested_quantity: number;
  sent_quantity: number;
  received_quantity: number;
  unordered_quantity: number;
  planned_amount: string;
};

function toPlanCoverage(row: PlanRow): PlanCoverage {
  return {
    id: row.consumption_plan_id,
    itemId: row.consumption_item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    unitOfMeasure: row.unit_of_measure,
    slotId: row.consumption_slot_id,
    slotCode: row.slot_code,
    slotName: row.slot_name,
    slotDate: row.slot_date,
    slotStatus: row.slot_status,
    plannedQuantity: row.planned_quantity,
    unitCost: row.unit_cost,
    status: row.status,
    notes: row.notes,
    requestedQuantity: row.requested_quantity,
    sentQuantity: row.sent_quantity,
    receivedQuantity: row.received_quantity,
    unorderedQuantity: row.unordered_quantity,
    plannedAmount: row.planned_amount,
  };
}

export async function getPlanCoverage(eventId: string): Promise<PlanCoverage[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_plan_coverage")
    .select(PLAN_COLUMNS)
    .eq("event_id", eventId)
    .order("slot_date", { ascending: true })
    .order("slot_code", { ascending: true })
    .order("item_code", { ascending: true })
    .returns<PlanRow[]>();

  return (data ?? []).map(toPlanCoverage);
}

export async function getPlanCoverageForSlot(
  slotId: string,
): Promise<PlanCoverage[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_plan_coverage")
    .select(PLAN_COLUMNS)
    .eq("consumption_slot_id", slotId)
    .order("item_code", { ascending: true })
    .returns<PlanRow[]>();

  return (data ?? []).map(toPlanCoverage);
}

export async function getPlanCoverageById(
  id: string,
): Promise<PlanCoverage | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_plan_coverage")
    .select(PLAN_COLUMNS)
    .eq("consumption_plan_id", id)
    .maybeSingle<PlanRow>();

  return data ? toPlanCoverage(data) : null;
}
