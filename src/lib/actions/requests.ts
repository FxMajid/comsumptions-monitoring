"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getManagerProfile } from "@/lib/actions/guard";
import { describeWriteError } from "@/lib/actions/errors";
import { changeStatus } from "@/lib/actions/change-status";
import {
  NO_EVENT_MESSAGE,
  UNAUTHORIZED_MESSAGE,
  errorState,
  okState,
  type ActionState,
} from "@/lib/actions/result";
import {
  invalidState,
  notesField,
  optionalMoneyField,
  quantityField,
} from "@/lib/actions/validation";
import { requireActiveEventId } from "@/lib/domain/event";
import { isUuid } from "@/lib/domain/ids";
import { isRequestOpen } from "@/lib/domain/status";

const RequestSchema = z.object({
  vendorId: z.uuid("Pilih vendor"),
  notes: notesField,
});

const LineSchema = z.object({
  planId: z.uuid("Pilih rencana konsumsi"),
  requestedQuantity: quantityField,
  unitPrice: optionalMoneyField,
  notes: notesField,
});

const LineEditSchema = z.object({
  requestedQuantity: quantityField,
  unitPrice: optionalMoneyField,
  notes: notesField,
});

function requestPaths(requestId: string, vendorId?: string): string[] {
  const paths = ["/vendor", `/vendor/pesanan/${requestId}`, "/perencanaan"];

  return vendorId ? [...paths, `/vendor/${vendorId}`] : paths;
}

export async function createRequest(
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

  const parsed = RequestSchema.safeParse({
    vendorId: formData.get("vendorId"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("consumption_requests")
    .insert({
      event_id: eventId,
      vendor_id: parsed.data.vendorId,
      requested_by: profile.id,
      notes: parsed.data.notes,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return describeWriteError(error, {
      blocked: "Vendor yang dipilih tidak ada pada event ini.",
    });
  }

  if (!data) {
    return errorState("Pesanan gagal dibuat.");
  }

  revalidatePath("/vendor");
  revalidatePath(`/vendor/${parsed.data.vendorId}`);

  // A new order is empty, so the only useful next screen is its own page.
  redirect(`/vendor/pesanan/${data.id}`);
}

export async function updateRequest(
  requestId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(requestId)) {
    return errorState("Pesanan tidak ditemukan.");
  }

  const parsed = RequestSchema.safeParse({
    vendorId: formData.get("vendorId"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("consumption_requests")
    .update({ vendor_id: parsed.data.vendorId, notes: parsed.data.notes })
    .eq("id", requestId)
    .select("id")
    .maybeSingle();

  if (error) {
    return describeWriteError(error, {
      blocked: "Vendor yang dipilih tidak ada pada event ini.",
    });
  }

  if (!data) {
    return errorState(
      "Pesanan tidak ditemukan atau Anda tidak berhak mengubahnya.",
    );
  }

  requestPaths(requestId, parsed.data.vendorId).forEach((path) =>
    revalidatePath(path),
  );

  return okState("Pesanan diperbarui.");
}

type RequestRow = { id: string; event_id: string; vendor_id: string; status: string };

async function loadOpenRequest(
  requestId: string,
): Promise<{ row: RequestRow } | { error: ActionState }> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_requests")
    .select("id, event_id, vendor_id, status")
    .eq("id", requestId)
    .maybeSingle<RequestRow>();

  if (!data) {
    return { error: errorState("Pesanan tidak ditemukan.") };
  }

  if (!isRequestOpen(data.status)) {
    return {
      error: errorState(
        "Pesanan yang sudah ditutup atau dibatalkan tidak bisa diubah isinya.",
      ),
    };
  }

  return { row: data };
}

export async function addRequestLine(
  requestId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(requestId)) {
    return errorState("Pesanan tidak ditemukan.");
  }

  const parsed = LineSchema.safeParse({
    planId: formData.get("planId"),
    requestedQuantity: formData.get("requestedQuantity"),
    unitPrice: formData.get("unitPrice"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const loaded = await loadOpenRequest(requestId);

  if ("error" in loaded) {
    return loaded.error;
  }

  const supabase = await createSupabaseServerClient();

  const { data: plan } = await supabase
    .from("consumption_plans")
    .select("id, event_id, consumption_item_id, consumption_slot_id, unit_cost, status")
    .eq("id", parsed.data.planId)
    .maybeSingle<{
      id: string;
      event_id: string;
      consumption_item_id: string;
      consumption_slot_id: string;
      unit_cost: string | null;
      status: string;
    }>();

  if (!plan) {
    return errorState("Rencana konsumsi tidak ditemukan.");
  }

  // consumption_request_items has no event_id of its own, so nothing in the
  // schema stops a line from pointing at another event's plan. Checked here.
  if (plan.event_id !== loaded.row.event_id) {
    return errorState("Rencana itu milik event lain.");
  }

  if (plan.status === "CANCELLED") {
    return errorState("Rencana itu sudah dibatalkan.");
  }

  const { error } = await supabase.from("consumption_request_items").insert({
    consumption_request_id: requestId,
    consumption_plan_id: plan.id,
    consumption_item_id: plan.consumption_item_id,
    consumption_slot_id: plan.consumption_slot_id,
    requested_quantity: parsed.data.requestedQuantity,
    unit_price: parsed.data.unitPrice ?? plan.unit_cost,
    notes: parsed.data.notes,
  });

  if (error) {
    return describeWriteError(error, {
      duplicate:
        "Item dan slot itu sudah ada di pesanan ini. Ubah barisnya, jangan tambah baris baru.",
    });
  }

  requestPaths(requestId, loaded.row.vendor_id).forEach((path) =>
    revalidatePath(path),
  );

  return okState("Baris pesanan ditambahkan.");
}

type LineRow = {
  id: string;
  consumption_request_id: string;
  received_quantity: number;
  consumption_requests: { vendor_id: string; status: string } | null;
};

async function loadLine(lineId: string): Promise<LineRow | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_request_items")
    .select(
      "id, consumption_request_id, received_quantity, consumption_requests(vendor_id, status)",
    )
    .eq("id", lineId)
    .maybeSingle<LineRow>();

  return data;
}

export async function updateRequestLine(
  lineId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(lineId)) {
    return errorState("Baris pesanan tidak ditemukan.");
  }

  const parsed = LineEditSchema.safeParse({
    requestedQuantity: formData.get("requestedQuantity"),
    unitPrice: formData.get("unitPrice"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const line = await loadLine(lineId);

  if (!line) {
    return errorState("Baris pesanan tidak ditemukan.");
  }

  if (!isRequestOpen(line.consumption_requests?.status ?? "")) {
    return errorState(
      "Pesanan yang sudah ditutup atau dibatalkan tidak bisa diubah isinya.",
    );
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("consumption_request_items")
    .update({
      requested_quantity: parsed.data.requestedQuantity,
      unit_price: parsed.data.unitPrice,
      notes: parsed.data.notes,
    })
    .eq("id", lineId)
    .select("id")
    .maybeSingle();

  if (error) {
    return describeWriteError(error);
  }

  if (!data) {
    return errorState(
      "Baris tidak ditemukan atau Anda tidak berhak mengubahnya.",
    );
  }

  requestPaths(
    line.consumption_request_id,
    line.consumption_requests?.vendor_id,
  ).forEach((path) => revalidatePath(path));

  return okState("Baris pesanan diperbarui.");
}

export async function deleteRequestLine(
  lineId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(lineId)) {
    return errorState("Baris pesanan tidak ditemukan.");
  }

  const line = await loadLine(lineId);

  if (!line) {
    return errorState("Baris pesanan tidak ditemukan.");
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("consumption_request_items")
    .delete()
    .eq("id", lineId);

  // The before-delete trigger in 005 rejects a line that has already been
  // received, so the guard holds even for a direct PostgREST call.
  if (error) {
    return describeWriteError(error);
  }

  requestPaths(
    line.consumption_request_id,
    line.consumption_requests?.vendor_id,
  ).forEach((path) => revalidatePath(path));

  return okState("Baris pesanan dihapus.");
}

export async function changeRequestStatus(
  requestId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return changeStatus("consumption_requests", requestId, formData, (id) => [
    "/vendor",
    `/vendor/pesanan/${id}`,
    "/perencanaan",
  ]);
}
