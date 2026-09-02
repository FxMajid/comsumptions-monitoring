"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getManagerProfile } from "@/lib/actions/guard";
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
  notesField,
  shortTextField,
} from "@/lib/actions/validation";
import { requireActiveEventId } from "@/lib/domain/event";
import { AREA_TYPES, ITEM_TYPES } from "@/lib/domain/master";
import { isUuid } from "@/lib/domain/ids";

const DUPLICATE_CODE = "Kode itu sudah dipakai pada event ini.";

const ItemSchema = z.object({
  code: codeField,
  name: nameField,
  itemType: z.enum(ITEM_TYPES, { error: "Jenis item tidak sah" }),
  unitOfMeasure: z
    .string()
    .trim()
    .min(1, "Satuan wajib diisi")
    .max(16, "Satuan maksimal 16 karakter")
    .transform((value) => value.toUpperCase()),
  isActive: flagField,
});

const AreaSchema = z.object({
  code: codeField,
  name: nameField,
  areaType: z.enum(AREA_TYPES, { error: "Jenis area tidak sah" }),
  isActive: flagField,
});

const VendorSchema = z.object({
  code: codeField,
  name: nameField,
  contactName: shortTextField,
  phone: shortTextField,
  notes: notesField,
  isActive: flagField,
});

function readItem(formData: FormData) {
  return ItemSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    itemType: formData.get("itemType"),
    unitOfMeasure: formData.get("unitOfMeasure"),
    isActive: formData.get("isActive"),
  });
}

function readArea(formData: FormData) {
  return AreaSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    areaType: formData.get("areaType"),
    isActive: formData.get("isActive"),
  });
}

function readVendor(formData: FormData) {
  return VendorSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    contactName: formData.get("contactName"),
    phone: formData.get("phone"),
    notes: formData.get("notes"),
    isActive: formData.get("isActive"),
  });
}

export async function createConsumptionItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  const eventId = await requireActiveEventId();

  if (!eventId) {
    return errorState(NO_EVENT_MESSAGE);
  }

  const parsed = readItem(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("consumption_items").insert({
    event_id: eventId,
    code: parsed.data.code,
    name: parsed.data.name,
    item_type: parsed.data.itemType,
    unit_of_measure: parsed.data.unitOfMeasure,
    is_active: parsed.data.isActive,
  });

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_CODE });
  }

  revalidatePath("/master");
  revalidatePath("/perencanaan");

  return okState(`Item ${parsed.data.code} ditambahkan.`);
}

export async function updateConsumptionItem(
  itemId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(itemId)) {
    return errorState("Item tidak ditemukan.");
  }

  const parsed = readItem(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("consumption_items")
    .update({
      code: parsed.data.code,
      name: parsed.data.name,
      item_type: parsed.data.itemType,
      unit_of_measure: parsed.data.unitOfMeasure,
      is_active: parsed.data.isActive,
    })
    .eq("id", itemId)
    .select("id")
    .maybeSingle();

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_CODE });
  }

  // An update blocked by row level security matches no row and raises nothing.
  if (!data) {
    return errorState("Item tidak ditemukan atau Anda tidak berhak mengubahnya.");
  }

  revalidatePath("/master");
  revalidatePath(`/master/item/${itemId}`);
  revalidatePath("/perencanaan");

  return okState("Item diperbarui.");
}

export async function createArea(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  const eventId = await requireActiveEventId();

  if (!eventId) {
    return errorState(NO_EVENT_MESSAGE);
  }

  const parsed = readArea(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("areas").insert({
    event_id: eventId,
    code: parsed.data.code,
    name: parsed.data.name,
    area_type: parsed.data.areaType,
    is_active: parsed.data.isActive,
  });

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_CODE });
  }

  revalidatePath("/master");

  return okState(`Area ${parsed.data.code} ditambahkan.`);
}

export async function updateArea(
  areaId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(areaId)) {
    return errorState("Area tidak ditemukan.");
  }

  const parsed = readArea(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("areas")
    .update({
      code: parsed.data.code,
      name: parsed.data.name,
      area_type: parsed.data.areaType,
      is_active: parsed.data.isActive,
    })
    .eq("id", areaId)
    .select("id")
    .maybeSingle();

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_CODE });
  }

  if (!data) {
    return errorState("Area tidak ditemukan atau Anda tidak berhak mengubahnya.");
  }

  revalidatePath("/master");
  revalidatePath(`/master/area/${areaId}`);

  return okState("Area diperbarui.");
}

export async function createVendor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  const eventId = await requireActiveEventId();

  if (!eventId) {
    return errorState(NO_EVENT_MESSAGE);
  }

  const parsed = readVendor(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("vendors").insert({
    event_id: eventId,
    code: parsed.data.code,
    name: parsed.data.name,
    contact_name: parsed.data.contactName,
    phone: parsed.data.phone,
    notes: parsed.data.notes,
    is_active: parsed.data.isActive,
  });

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_CODE });
  }

  revalidatePath("/master");
  revalidatePath("/vendor");

  return okState(`Vendor ${parsed.data.code} ditambahkan.`);
}

export async function updateVendor(
  vendorId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(vendorId)) {
    return errorState("Vendor tidak ditemukan.");
  }

  const parsed = readVendor(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("vendors")
    .update({
      code: parsed.data.code,
      name: parsed.data.name,
      contact_name: parsed.data.contactName,
      phone: parsed.data.phone,
      notes: parsed.data.notes,
      is_active: parsed.data.isActive,
    })
    .eq("id", vendorId)
    .select("id")
    .maybeSingle();

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_CODE });
  }

  if (!data) {
    return errorState("Vendor tidak ditemukan atau Anda tidak berhak mengubahnya.");
  }

  revalidatePath("/master");
  revalidatePath("/vendor");
  revalidatePath(`/vendor/${vendorId}`);

  return okState("Vendor diperbarui.");
}

