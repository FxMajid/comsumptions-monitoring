import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StatusTone } from "@/lib/domain/status";

export type EntitlementCounts = {
  pending: number;
  partiallyPicked: number;
  pickedUp: number;
};

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

export const ENTITLEMENT_STATUSES = [
  "PENDING",
  "PARTIALLY_PICKED",
  "PICKED_UP",
  "EXPIRED",
  "CANCELLED",
] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export const ENTITLEMENT_STATUS_LABELS: Record<EntitlementStatus, string> = {
  PENDING: "Belum diambil",
  PARTIALLY_PICKED: "Sebagian",
  PICKED_UP: "Sudah diambil",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
};

export function entitlementStatusLabel(value: string): string {
  return ENTITLEMENT_STATUS_LABELS[value as EntitlementStatus] ?? value;
}

const ENTITLEMENT_STATUS_TONES: Record<EntitlementStatus, StatusTone> = {
  PENDING: "neutral",
  PARTIALLY_PICKED: "warn",
  PICKED_UP: "ok",
  EXPIRED: "alert",
  CANCELLED: "alert",
};

export function entitlementStatusTone(value: string): StatusTone {
  return ENTITLEMENT_STATUS_TONES[value as EntitlementStatus] ?? "neutral";
}

export type EntitlementView = {
  id: string;
  beneficiaryId: string;
  beneficiaryCode: string;
  beneficiaryName: string;
  beneficiaryType: string;
  beneficiaryCategory: string;
  areaId: string | null;
  areaName: string | null;
  itemId: string;
  itemCode: string;
  itemName: string;
  unitOfMeasure: string;
  slotId: string;
  slotCode: string;
  slotName: string;
  slotDate: string;
  startsAt: string | null;
  endsAt: string | null;
  pickupDeadline: string | null;
  slotStatus: string;
  expiresAt: string | null;
  quantity: number;
  pickedQuantity: number;
  remainingQuantity: number;
  status: string;
};

const OVERVIEW_COLUMNS =
  "entitlement_id, beneficiary_id, beneficiary_code, beneficiary_name, beneficiary_type, beneficiary_category, area_id, area_name, consumption_item_id, item_code, item_name, unit_of_measure, consumption_slot_id, slot_code, slot_name, slot_date, starts_at, ends_at, pickup_deadline, slot_status, expires_at, entitlement_quantity, picked_quantity, remaining_quantity, status";

type OverviewRow = {
  entitlement_id: string;
  beneficiary_id: string;
  beneficiary_code: string;
  beneficiary_name: string;
  beneficiary_type: string;
  beneficiary_category: string;
  area_id: string | null;
  area_name: string | null;
  consumption_item_id: string;
  item_code: string;
  item_name: string;
  unit_of_measure: string;
  consumption_slot_id: string;
  slot_code: string;
  slot_name: string;
  slot_date: string;
  starts_at: string | null;
  ends_at: string | null;
  pickup_deadline: string | null;
  slot_status: string;
  expires_at: string | null;
  entitlement_quantity: number;
  picked_quantity: number;
  remaining_quantity: number;
  status: string;
};

function toEntitlementView(row: OverviewRow): EntitlementView {
  return {
    id: row.entitlement_id,
    beneficiaryId: row.beneficiary_id,
    beneficiaryCode: row.beneficiary_code,
    beneficiaryName: row.beneficiary_name,
    beneficiaryType: row.beneficiary_type,
    beneficiaryCategory: row.beneficiary_category,
    areaId: row.area_id,
    areaName: row.area_name,
    itemId: row.consumption_item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    unitOfMeasure: row.unit_of_measure,
    slotId: row.consumption_slot_id,
    slotCode: row.slot_code,
    slotName: row.slot_name,
    slotDate: row.slot_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    pickupDeadline: row.pickup_deadline,
    slotStatus: row.slot_status,
    expiresAt: row.expires_at,
    quantity: row.entitlement_quantity,
    pickedQuantity: row.picked_quantity,
    remainingQuantity: row.remaining_quantity,
    status: row.status,
  };
}

export const ENTITLEMENT_PAGE_SIZE = 200;

export type EntitlementQuery = {
  slotId?: string | null;
  beneficiaryId?: string | null;
  status?: string | null;
  limit?: number;
};

export async function getEntitlements(
  eventId: string,
  query: EntitlementQuery = {},
): Promise<EntitlementView[]> {
  const supabase = await createSupabaseServerClient();

  let request = supabase
    .from("entitlement_overview")
    .select(OVERVIEW_COLUMNS)
    .eq("event_id", eventId);

  if (query.slotId) {
    request = request.eq("consumption_slot_id", query.slotId);
  }

  if (query.beneficiaryId) {
    request = request.eq("beneficiary_id", query.beneficiaryId);
  }

  if (query.status) {
    request = request.eq("status", query.status);
  }

  const { data } = await request
    .order("slot_date", { ascending: true })
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("beneficiary_code", { ascending: true })
    .limit(query.limit ?? ENTITLEMENT_PAGE_SIZE)
    .returns<OverviewRow[]>();

  return (data ?? []).map(toEntitlementView);
}

export async function getEntitlement(id: string): Promise<EntitlementView | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("entitlement_overview")
    .select(OVERVIEW_COLUMNS)
    .eq("entitlement_id", id)
    .maybeSingle<OverviewRow>();

  return data ? toEntitlementView(data) : null;
}
