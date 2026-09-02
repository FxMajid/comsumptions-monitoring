"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getManagerProfile } from "@/lib/actions/guard";
import { describeWriteError } from "@/lib/actions/errors";
import {
  UNAUTHORIZED_MESSAGE,
  errorState,
  okState,
  type ActionState,
} from "@/lib/actions/result";
import { invalidState } from "@/lib/actions/validation";
import { isUuid } from "@/lib/domain/ids";
import {
  BENEFICIARY_CATEGORIES,
  BENEFICIARY_TYPES,
} from "@/lib/domain/beneficiary";
import { formatNumber } from "@/lib/format";

/**
 * An empty filter means "everyone", which is what the RPC does with null. The
 * form sends checkbox groups, so no selection has to become null rather than an
 * empty array — `= any(array[])` would match nobody.
 */
function optionalEnumArray<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .array(z.enum(values))
    .transform((selected) => (selected.length === 0 ? null : selected));
}

const GenerateSchema = z.object({
  consumptionItemId: z.uuid("Pilih item konsumsi lebih dulu"),
  categories: optionalEnumArray(BENEFICIARY_CATEGORIES),
  beneficiaryTypes: optionalEnumArray(BENEFICIARY_TYPES),
  areaId: z
    .union([z.literal(""), z.uuid("Pilihan area tidak sah")])
    .transform((value) => (value === "" ? null : value)),
});

/** `generate_entitlements` reports what it matched and what it actually wrote. */
const GenerateResultSchema = z.object({
  matched: z.number().int(),
  created: z.number().int(),
});

const CancelSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Alasan wajib diisi")
    .max(1000, "Alasan maksimal 1000 karakter"),
});

type PickedRow = { picked_quantity: number; beneficiary_id: string };

export async function generateEntitlements(
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

  const parsed = GenerateSchema.safeParse({
    consumptionItemId: formData.get("consumptionItemId"),
    categories: formData.getAll("categories"),
    beneficiaryTypes: formData.getAll("beneficiaryTypes"),
    areaId: formData.get("areaId"),
  });

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("generate_entitlements", {
    p_consumption_slot_id: slotId,
    p_consumption_item_id: parsed.data.consumptionItemId,
    p_categories: parsed.data.categories,
    p_beneficiary_types: parsed.data.beneficiaryTypes,
    p_area_id: parsed.data.areaId,
  });

  if (error) {
    return describeWriteError(error);
  }

  const result = GenerateResultSchema.safeParse(data);

  if (!result.success) {
    return errorState("Penerbitan berjalan, tetapi hasilnya tidak terbaca.");
  }

  revalidatePath(`/perencanaan/slot/${slotId}`);
  revalidatePath("/perencanaan");
  revalidatePath("/pengambilan");

  const { matched, created } = result.data;
  const skipped = matched - created;

  // Re-running is the normal way to cover penerima added later, so the skipped
  // count matters as much as the created one.
  return okState(
    skipped > 0
      ? `${formatNumber(created)} hak konsumsi baru dari ${formatNumber(matched)} penerima yang cocok; ${formatNumber(skipped)} sudah punya sebelumnya.`
      : `${formatNumber(created)} hak konsumsi diterbitkan.`,
  );
}

/**
 * Corrections are void with a reason, never a delete: an entitlement is what a
 * pickup points at, so removing the row would erase the reason a handover
 * happened.
 */
export async function cancelEntitlement(
  entitlementId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(entitlementId)) {
    return errorState("Hak konsumsi tidak ditemukan.");
  }

  const parsed = CancelSchema.safeParse({ reason: formData.get("reason") });

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { data: current } = await supabase
    .from("entitlement_overview")
    .select("picked_quantity, beneficiary_id")
    .eq("entitlement_id", entitlementId)
    .maybeSingle<PickedRow>();

  if (!current) {
    return errorState("Hak konsumsi tidak ditemukan.");
  }

  if (current.picked_quantity > 0) {
    return errorState(
      "Sudah ada pengambilan atas hak ini. Batalkan pengambilannya dulu lewat pembalikan transaksi.",
    );
  }

  const { data, error } = await supabase
    .from("entitlements")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
      cancellation_reason: parsed.data.reason,
    })
    .eq("id", entitlementId)
    .is("cancelled_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return describeWriteError(error);
  }

  if (!data) {
    return errorState("Hak konsumsi sudah dibatalkan sebelumnya.");
  }

  revalidatePath("/pengambilan");
  revalidatePath(`/pengambilan/penerima/${current.beneficiary_id}`);
  revalidatePath("/perencanaan");

  return okState("Hak konsumsi dibatalkan.");
}
