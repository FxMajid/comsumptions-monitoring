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
  dateField,
  invalidState,
  nameField,
  notesField,
  optionalDateTimeField,
  optionalIntegerField,
  optionalMoneyField,
  optionalTimeField,
  quantityField,
} from "@/lib/actions/validation";
import { requireActiveEventId } from "@/lib/domain/event";
import { isUuid } from "@/lib/domain/ids";
import { changeStatus } from "@/lib/actions/change-status";
import { EVENT_UTC_OFFSET } from "@/lib/format";

const DUPLICATE_SLOT = "Kode slot itu sudah dipakai pada event ini.";
const DUPLICATE_PLAN =
  "Kombinasi item dan slot itu sudah punya rencana. Ubah rencana yang ada.";
const SlotSchema = z
  .object({
    code: codeField,
    name: nameField,
    slotDate: dateField,
    relativeDayOffset: optionalIntegerField,
    startsAt: optionalTimeField,
    endsAt: optionalTimeField,
    pickupDeadline: optionalDateTimeField,
  })
  .refine(
    (value) =>
      !value.startsAt || !value.endsAt || value.startsAt < value.endsAt,
    { error: "Jam selesai harus setelah jam mulai", path: ["endsAt"] },
  );

const PlanSchema = z.object({
  itemId: z.uuid("Pilih item konsumsi"),
  slotId: z.uuid("Pilih slot"),
  plannedQuantity: quantityField,
  unitCost: optionalMoneyField,
  notes: notesField,
});

function readSlot(formData: FormData) {
  return SlotSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    slotDate: formData.get("slotDate"),
    relativeDayOffset: formData.get("relativeDayOffset"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    pickupDeadline: formData.get("pickupDeadline"),
  });
}

function readPlan(formData: FormData) {
  return PlanSchema.safeParse({
    itemId: formData.get("itemId"),
    slotId: formData.get("slotId"),
    plannedQuantity: formData.get("plannedQuantity"),
    unitCost: formData.get("unitCost"),
    notes: formData.get("notes"),
  });
}

/**
 * A datetime-local input carries no zone. Without an explicit offset Postgres
 * would read it in the server's timezone, which is UTC on Supabase, and a 15:00
 * deadline would land at 22:00 WIB.
 */
function toTimestamptz(value: string | null): string | null {
  return value ? `${value}:00${EVENT_UTC_OFFSET}` : null;
}

export async function createSlot(
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

  const parsed = readSlot(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("consumption_slots").insert({
    event_id: eventId,
    code: parsed.data.code,
    name: parsed.data.name,
    slot_date: parsed.data.slotDate,
    relative_day_offset: parsed.data.relativeDayOffset,
    starts_at: parsed.data.startsAt,
    ends_at: parsed.data.endsAt,
    pickup_deadline: toTimestamptz(parsed.data.pickupDeadline),
  });

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_SLOT });
  }

  revalidatePath("/perencanaan");

  return okState(`Slot ${parsed.data.code} ditambahkan sebagai draf.`);
}

export async function updateSlot(
  slotId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(slotId)) {
    return errorState("Slot tidak ditemukan.");
  }

  const parsed = readSlot(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("consumption_slots")
    .update({
      code: parsed.data.code,
      name: parsed.data.name,
      slot_date: parsed.data.slotDate,
      relative_day_offset: parsed.data.relativeDayOffset,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      pickup_deadline: toTimestamptz(parsed.data.pickupDeadline),
    })
    .eq("id", slotId)
    .select("id")
    .maybeSingle();

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_SLOT });
  }

  if (!data) {
    return errorState("Slot tidak ditemukan atau Anda tidak berhak mengubahnya.");
  }

  revalidatePath("/perencanaan");
  revalidatePath(`/perencanaan/slot/${slotId}`);

  return okState("Slot diperbarui.");
}

export async function createPlan(
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

  const parsed = readPlan(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("consumption_plans").insert({
    event_id: eventId,
    consumption_item_id: parsed.data.itemId,
    consumption_slot_id: parsed.data.slotId,
    planned_quantity: parsed.data.plannedQuantity,
    unit_cost: parsed.data.unitCost,
    notes: parsed.data.notes,
    created_by: profile.id,
  });

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_PLAN });
  }

  revalidatePath("/perencanaan");
  revalidatePath(`/perencanaan/slot/${parsed.data.slotId}`);

  return okState("Rencana ditambahkan.");
}

export async function updatePlan(
  planId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(planId)) {
    return errorState("Rencana tidak ditemukan.");
  }

  const parsed = readPlan(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("consumption_plans")
    .update({
      consumption_item_id: parsed.data.itemId,
      consumption_slot_id: parsed.data.slotId,
      planned_quantity: parsed.data.plannedQuantity,
      unit_cost: parsed.data.unitCost,
      notes: parsed.data.notes,
    })
    .eq("id", planId)
    .select("id")
    .maybeSingle();

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_PLAN });
  }

  if (!data) {
    return errorState(
      "Rencana tidak ditemukan atau Anda tidak berhak mengubahnya.",
    );
  }

  revalidatePath("/perencanaan");
  revalidatePath(`/perencanaan/rencana/${planId}`);
  revalidatePath(`/perencanaan/slot/${parsed.data.slotId}`);

  return okState("Rencana diperbarui.");
}

export async function changeSlotStatus(
  slotId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return changeStatus("consumption_slots", slotId, formData, (id) => [
    "/perencanaan",
    `/perencanaan/slot/${id}`,
  ]);
}

export async function changePlanStatus(
  planId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return changeStatus("consumption_plans", planId, formData, (id) => [
    "/perencanaan",
    `/perencanaan/rencana/${id}`,
  ]);
}
