import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RequestSummary = {
  id: string;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  status: string;
  requestedAt: string;
  notes: string | null;
  itemCount: number;
  requestedQuantity: number;
  sentQuantity: number;
  receivedQuantity: number;
  requestedAmount: string;
  receivedAmount: string;
};

export type RequestLine = {
  id: string;
  planId: string | null;
  itemId: string;
  itemCode: string;
  itemName: string;
  unitOfMeasure: string;
  slotId: string | null;
  slotCode: string | null;
  slotName: string | null;
  slotDate: string | null;
  requestedQuantity: number;
  sentQuantity: number;
  receivedQuantity: number;
  unitPrice: string | null;
  notes: string | null;
};

const SUMMARY_COLUMNS =
  "consumption_request_id, vendor_id, vendor_code, vendor_name, status, requested_at, notes, item_count, requested_quantity, sent_quantity, received_quantity, requested_amount, received_amount";

type SummaryRow = {
  consumption_request_id: string;
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  status: string;
  requested_at: string;
  notes: string | null;
  item_count: number;
  requested_quantity: number;
  sent_quantity: number;
  received_quantity: number;
  requested_amount: string;
  received_amount: string;
};

function toRequestSummary(row: SummaryRow): RequestSummary {
  return {
    id: row.consumption_request_id,
    vendorId: row.vendor_id,
    vendorCode: row.vendor_code,
    vendorName: row.vendor_name,
    status: row.status,
    requestedAt: row.requested_at,
    notes: row.notes,
    itemCount: row.item_count,
    requestedQuantity: row.requested_quantity,
    sentQuantity: row.sent_quantity,
    receivedQuantity: row.received_quantity,
    requestedAmount: row.requested_amount,
    receivedAmount: row.received_amount,
  };
}

export async function getRequestSummaries(
  eventId: string,
): Promise<RequestSummary[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_request_summaries")
    .select(SUMMARY_COLUMNS)
    .eq("event_id", eventId)
    .order("requested_at", { ascending: false })
    .returns<SummaryRow[]>();

  return (data ?? []).map(toRequestSummary);
}

export async function getRequestSummariesForVendor(
  vendorId: string,
): Promise<RequestSummary[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_request_summaries")
    .select(SUMMARY_COLUMNS)
    .eq("vendor_id", vendorId)
    .order("requested_at", { ascending: false })
    .returns<SummaryRow[]>();

  return (data ?? []).map(toRequestSummary);
}

export async function getRequestSummary(
  id: string,
): Promise<RequestSummary | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_request_summaries")
    .select(SUMMARY_COLUMNS)
    .eq("consumption_request_id", id)
    .maybeSingle<SummaryRow>();

  return data ? toRequestSummary(data) : null;
}

type LineRow = {
  id: string;
  consumption_plan_id: string | null;
  consumption_item_id: string;
  consumption_slot_id: string | null;
  requested_quantity: number;
  sent_quantity: number;
  received_quantity: number;
  unit_price: string | null;
  notes: string | null;
  consumption_items: { code: string; name: string; unit_of_measure: string } | null;
  consumption_slots: { code: string; name: string; slot_date: string } | null;
};

export async function getRequestLines(requestId: string): Promise<RequestLine[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_request_items")
    .select(
      "id, consumption_plan_id, consumption_item_id, consumption_slot_id, requested_quantity, sent_quantity, received_quantity, unit_price, notes, consumption_items(code, name, unit_of_measure), consumption_slots(code, name, slot_date)",
    )
    .eq("consumption_request_id", requestId)
    .returns<LineRow[]>();

  return (data ?? [])
    .map((row) => ({
      id: row.id,
      planId: row.consumption_plan_id,
      itemId: row.consumption_item_id,
      itemCode: row.consumption_items?.code ?? "—",
      itemName: row.consumption_items?.name ?? "—",
      unitOfMeasure: row.consumption_items?.unit_of_measure ?? "PCS",
      slotId: row.consumption_slot_id,
      slotCode: row.consumption_slots?.code ?? null,
      slotName: row.consumption_slots?.name ?? null,
      slotDate: row.consumption_slots?.slot_date ?? null,
      requestedQuantity: row.requested_quantity,
      sentQuantity: row.sent_quantity,
      receivedQuantity: row.received_quantity,
      unitPrice: row.unit_price,
      notes: row.notes,
    }))
    // Embedded columns cannot be ordered on from PostgREST, so the readable
    // order (slot then item) is applied here.
    .sort(
      (a, b) =>
        (a.slotDate ?? "").localeCompare(b.slotDate ?? "") ||
        (a.slotCode ?? "").localeCompare(b.slotCode ?? "") ||
        a.itemCode.localeCompare(b.itemCode),
    );
}

export type RequestVariance = {
  lineId: string;
  sentVsRequested: number;
  receivedVsSent: number;
  receivedVsRequested: number;
};

export async function getRequestVariances(
  eventId: string,
): Promise<RequestVariance[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("consumption_request_variances")
    .select(
      "consumption_request_item_id, sent_vs_requested_variance, received_vs_sent_variance, received_vs_requested_variance",
    )
    .eq("event_id", eventId)
    .returns<
      {
        consumption_request_item_id: string;
        sent_vs_requested_variance: number;
        received_vs_sent_variance: number;
        received_vs_requested_variance: number;
      }[]
    >();

  return (data ?? []).map((row) => ({
    lineId: row.consumption_request_item_id,
    sentVsRequested: row.sent_vs_requested_variance,
    receivedVsSent: row.received_vs_sent_variance,
    receivedVsRequested: row.received_vs_requested_variance,
  }));
}
