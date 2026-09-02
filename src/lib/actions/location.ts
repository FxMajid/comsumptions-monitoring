"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWarehouseProfile } from "@/lib/actions/guard";
import { describeWriteError } from "@/lib/actions/errors";
import {
  NO_EVENT_MESSAGE,
  UNAUTHORIZED_MESSAGE,
  errorState,
  okState,
  type ActionState,
} from "@/lib/actions/result";
import {
  codeField,
  flagField,
  invalidState,
  nameField,
} from "@/lib/actions/validation";
import { requireActiveEventId } from "@/lib/domain/event";
import { isUuid } from "@/lib/domain/ids";
import { LOCATION_TYPES } from "@/lib/domain/location";

const DUPLICATE_CODE = "Kode lokasi itu sudah dipakai pada event ini.";

/**
 * A stock location is written by warehouse roles, not by the consumption
 * manager alone: the people who move goods are the ones who know which points
 * actually exist on the ground.
 */
const LocationSchema = z.object({
  code: codeField,
  name: nameField,
  locationType: z.enum(LOCATION_TYPES, { error: "Jenis lokasi tidak sah" }),
  areaId: z
    .union([z.literal(""), z.uuid("Pilihan area tidak sah")])
    .transform((value) => (value === "" ? null : value)),
  isActive: flagField,
});

function readLocation(formData: FormData) {
  return LocationSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    locationType: formData.get("locationType"),
    areaId: formData.get("areaId"),
    isActive: formData.get("isActive"),
  });
}

function revalidateLocations(locationId?: string): void {
  revalidatePath("/master");
  revalidatePath("/gudang");
  revalidatePath("/pengambilan");

  if (locationId) {
    revalidatePath(`/master/lokasi/${locationId}`);
  }
}

export async function createInventoryLocation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getWarehouseProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  const eventId = await requireActiveEventId();

  if (!eventId) {
    return errorState(NO_EVENT_MESSAGE);
  }

  const parsed = readLocation(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("inventory_locations").insert({
    event_id: eventId,
    code: parsed.data.code,
    name: parsed.data.name,
    location_type: parsed.data.locationType,
    area_id: parsed.data.areaId,
    is_active: parsed.data.isActive,
  });

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_CODE });
  }

  revalidateLocations();

  return okState(`Lokasi ${parsed.data.code} ditambahkan.`);
}

export async function updateInventoryLocation(
  locationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getWarehouseProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(locationId)) {
    return errorState("Lokasi tidak ditemukan.");
  }

  const parsed = readLocation(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("inventory_locations")
    .update({
      code: parsed.data.code,
      name: parsed.data.name,
      location_type: parsed.data.locationType,
      area_id: parsed.data.areaId,
      is_active: parsed.data.isActive,
    })
    .eq("id", locationId)
    .select("id")
    .maybeSingle();

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_CODE });
  }

  if (!data) {
    return errorState("Lokasi tidak ditemukan atau Anda tidak berhak mengubahnya.");
  }

  revalidateLocations(locationId);

  return okState("Lokasi diperbarui.");
}
