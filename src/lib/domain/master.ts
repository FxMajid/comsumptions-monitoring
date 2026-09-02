import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/domain/ids";

export const ITEM_TYPES = ["MEAL", "SNACK", "DRINK", "VOUCHER", "OTHER"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  MEAL: "Makan",
  SNACK: "Snack",
  DRINK: "Minuman",
  VOUCHER: "Voucher",
  OTHER: "Lainnya",
};

/** The stored value is plain text, so an unknown code is shown as-is. */
export function itemTypeLabel(value: string): string {
  return ITEM_TYPE_LABELS[value as ItemType] ?? value;
}

export const AREA_TYPES = ["CENTRAL", "AREA", "PICKUP_POINT", "OTHER"] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export const AREA_TYPE_LABELS: Record<AreaType, string> = {
  CENTRAL: "Pusat",
  AREA: "Area",
  PICKUP_POINT: "Titik ambil",
  OTHER: "Lainnya",
};

export function areaTypeLabel(value: string): string {
  return AREA_TYPE_LABELS[value as AreaType] ?? value;
}

export type ConsumptionItem = {
  id: string;
  code: string;
  name: string;
  itemType: string;
  unitOfMeasure: string;
  isActive: boolean;
};

export type Area = {
  id: string;
  code: string;
  name: string;
  areaType: string;
  isActive: boolean;
};

export type Vendor = {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
};

export async function getConsumptionItems(
  eventId: string,
): Promise<ConsumptionItem[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_items")
    .select("id, code, name, item_type, unit_of_measure, is_active")
    .eq("event_id", eventId)
    .order("code", { ascending: true })
    .returns<
      {
        id: string;
        code: string;
        name: string;
        item_type: string;
        unit_of_measure: string;
        is_active: boolean;
      }[]
    >();

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    itemType: row.item_type,
    unitOfMeasure: row.unit_of_measure,
    isActive: row.is_active,
  }));
}

export async function getConsumptionItem(
  id: string,
): Promise<ConsumptionItem | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_items")
    .select("id, code, name, item_type, unit_of_measure, is_active")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      code: string;
      name: string;
      item_type: string;
      unit_of_measure: string;
      is_active: boolean;
    }>();

  return data
    ? {
        id: data.id,
        code: data.code,
        name: data.name,
        itemType: data.item_type,
        unitOfMeasure: data.unit_of_measure,
        isActive: data.is_active,
      }
    : null;
}

export async function getAreas(eventId: string): Promise<Area[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("areas")
    .select("id, code, name, area_type, is_active")
    .eq("event_id", eventId)
    .order("code", { ascending: true })
    .returns<
      {
        id: string;
        code: string;
        name: string;
        area_type: string;
        is_active: boolean;
      }[]
    >();

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    areaType: row.area_type,
    isActive: row.is_active,
  }));
}

export async function getArea(id: string): Promise<Area | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("areas")
    .select("id, code, name, area_type, is_active")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      code: string;
      name: string;
      area_type: string;
      is_active: boolean;
    }>();

  return data
    ? {
        id: data.id,
        code: data.code,
        name: data.name,
        areaType: data.area_type,
        isActive: data.is_active,
      }
    : null;
}

const VENDOR_COLUMNS = "id, code, name, contact_name, phone, notes, is_active";

type VendorRow = {
  id: string;
  code: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
};

function toVendor(row: VendorRow): Vendor {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contactName: row.contact_name,
    phone: row.phone,
    notes: row.notes,
    isActive: row.is_active,
  };
}

/**
 * vendors.event_id is nullable so a supplier can be reused across events. Both
 * the event's own vendors and the shared ones belong in the list.
 */
export async function getVendors(eventId: string): Promise<Vendor[]> {
  if (!isUuid(eventId)) {
    return [];
  }

  const supabase = await createSupabaseServerClient();

  // The id is checked above because it is interpolated into a PostgREST filter
  // string rather than passed as a bound value like .eq() does.
  const { data } = await supabase
    .from("vendors")
    .select(VENDOR_COLUMNS)
    .or(`event_id.eq.${eventId},event_id.is.null`)
    .order("code", { ascending: true })
    .returns<VendorRow[]>();

  return (data ?? []).map(toVendor);
}

export async function getVendor(id: string): Promise<Vendor | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("vendors")
    .select(VENDOR_COLUMNS)
    .eq("id", id)
    .maybeSingle<VendorRow>();

  return data ? toVendor(data) : null;
}
