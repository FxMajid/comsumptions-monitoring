import { createSupabaseServerClient } from "@/lib/supabase/server";

export const LOCATION_TYPES = [
  "CENTRAL_WAREHOUSE",
  "AREA",
  "PICKUP_POINT",
  "OTHER",
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  CENTRAL_WAREHOUSE: "Gudang pusat",
  AREA: "Area",
  PICKUP_POINT: "Titik ambil",
  OTHER: "Lainnya",
};

export function locationTypeLabel(value: string): string {
  return LOCATION_TYPE_LABELS[value as LocationType] ?? value;
}

export type InventoryLocation = {
  id: string;
  code: string;
  name: string;
  locationType: string;
  areaId: string | null;
  isActive: boolean;
};

const LOCATION_COLUMNS = "id, code, name, location_type, area_id, is_active";

type LocationRow = {
  id: string;
  code: string;
  name: string;
  location_type: string;
  area_id: string | null;
  is_active: boolean;
};

function toInventoryLocation(row: LocationRow): InventoryLocation {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    locationType: row.location_type,
    areaId: row.area_id,
    isActive: row.is_active,
  };
}

export async function getInventoryLocations(
  eventId: string,
): Promise<InventoryLocation[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("inventory_locations")
    .select(LOCATION_COLUMNS)
    .eq("event_id", eventId)
    .order("code", { ascending: true })
    .returns<LocationRow[]>();

  return (data ?? []).map(toInventoryLocation);
}

export async function getInventoryLocation(
  id: string,
): Promise<InventoryLocation | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("inventory_locations")
    .select(LOCATION_COLUMNS)
    .eq("id", id)
    .maybeSingle<LocationRow>();

  return data ? toInventoryLocation(data) : null;
}
