"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPickupProfile } from "@/lib/actions/guard";
import { describeWriteError } from "@/lib/actions/errors";
import {
  UNAUTHORIZED_MESSAGE,
  errorState,
  okState,
  type ActionState,
} from "@/lib/actions/result";
import { flagField, invalidState, notesField, quantityField } from "@/lib/actions/validation";
import { isUuid } from "@/lib/domain/ids";
import { formatNumber } from "@/lib/format";

/**
 * The form carries a key generated once per attempt in the browser. A pickup is
 * a stock movement, so a double tap on a weak signal must post once; the RPC
 * returns the first transaction again instead of a second one.
 */
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const PickupSchema = z.object({
  inventoryLocationId: z.uuid("Pilih lokasi pengambilan"),
  quantity: quantityField,
  idempotencyKey: z
    .string()
    .trim()
    .regex(IDEMPOTENCY_PATTERN, "Formulir kedaluwarsa. Muat ulang halaman."),
  manualOverride: flagField,
  notes: notesField,
});

const PickupIdSchema = z.uuid();

type EntitlementRow = {
  beneficiary_id: string;
  beneficiary_name: string;
  item_name: string;
  remaining_quantity: number;
  unit_of_measure: string;
};

export async function recordPickup(
  entitlementId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getPickupProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(entitlementId)) {
    return errorState("Hak konsumsi tidak ditemukan.");
  }

  const parsed = PickupSchema.safeParse({
    inventoryLocationId: formData.get("inventoryLocationId"),
    quantity: formData.get("quantity"),
    idempotencyKey: formData.get("idempotencyKey"),
    manualOverride: formData.get("manualOverride"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  // Only an admin may post a pickup the rules would otherwise refuse — an
  // expired slot, or stock the ledger says is not there.
  if (parsed.data.manualOverride && profile.role !== "ADMIN") {
    return errorState("Hanya admin yang boleh memakai penimpaan manual.");
  }

  const supabase = await createSupabaseServerClient();

  const { data: entitlement } = await supabase
    .from("entitlement_overview")
    .select(
      "beneficiary_id, beneficiary_name, item_name, remaining_quantity, unit_of_measure",
    )
    .eq("entitlement_id", entitlementId)
    .maybeSingle<EntitlementRow>();

  if (!entitlement) {
    return errorState("Hak konsumsi tidak ditemukan.");
  }

  const { data, error } = await supabase.rpc("pickup_entitlement", {
    p_entitlement_id: entitlementId,
    p_inventory_location_id: parsed.data.inventoryLocationId,
    p_quantity: parsed.data.quantity,
    // Namespaced by entitlement so a repeated key from one screen can never
    // collide with an unrelated pickup elsewhere.
    p_idempotency_key: `pickup:${entitlementId}:${parsed.data.idempotencyKey}`,
    p_operator_id: profile.id,
    p_manual_override: parsed.data.manualOverride,
    p_notes: parsed.data.notes,
  });

  if (error) {
    return describeWriteError(error);
  }

  if (!PickupIdSchema.safeParse(data).success) {
    return errorState("Pengambilan tercatat, tetapi hasilnya tidak terbaca.");
  }

  revalidatePath("/pengambilan");
  revalidatePath(`/pengambilan/penerima/${entitlement.beneficiary_id}`);
  revalidatePath("/gudang");
  revalidatePath("/laporan");

  return okState(
    `${formatNumber(parsed.data.quantity)} ${entitlement.unit_of_measure} ${entitlement.item_name} diserahkan ke ${entitlement.beneficiary_name}.`,
  );
}
