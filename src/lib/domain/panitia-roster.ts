import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/format";
import {
  PANITIA_SLOTS,
  type PanitiaKategori,
  type PanitiaRow,
  type PanitiaSlotKey,
} from "@/lib/domain/panitia";

const SlotValueSchema = z.object({
  attendance: z.enum(["PRESENT", "ABSENT", "UNKNOWN"]),
  activity: z.string().nullable().optional(),
});

const RosterSlotsSchema = z.object({
  h2_siang: SlotValueSchema,
  h1_siang: SlotValueSchema,
  h1_malam: SlotValueSchema,
  h_pagi: SlotValueSchema,
  h_siang: SlotValueSchema,
  h_malam: SlotValueSchema,
  hplus1: SlotValueSchema,
});

const QuantitySchema = z.union([
  z.number().int().positive(),
  z.string().regex(/^[1-9]\d*$/u),
]);

const RosterRowSchema = z.object({
  beneficiary_id: z.string().uuid(),
  name: z.string().min(1),
  quantity: QuantitySchema,
  origin: z.enum(["INTERNAL", "EXTERNAL"]).nullable(),
  pic_hbd: z.string().nullable(),
  employee_group: z.string().nullable(),
  pickup_pic_name: z.string().nullable(),
  pickup_whatsapp: z.string().nullable(),
  meal_eligible: z.boolean(),
  source_row_number: z.number().int().positive(),
  last_import_batch_id: z.string().uuid().nullable(),
  slots: RosterSlotsSchema,
  roster_updated_at: z.string(),
});

const ImportBatchSchema = z.object({
  id: z.string().uuid(),
  csv_format: z.enum(["LEGACY_21", "CANONICAL"]),
  row_count: z.number().int().nonnegative(),
  insert_count: z.number().int().nonnegative(),
  update_count: z.number().int().nonnegative(),
  unchanged_count: z.number().int().nonnegative(),
  applied_at: z.string(),
});

export type PanitiaImportMetadata = {
  id: string;
  csvFormat: "LEGACY_21" | "CANONICAL";
  rowCount: number;
  insertCount: number;
  updateCount: number;
  unchangedCount: number;
  appliedAt: string;
};

export type PanitiaRoster = {
  rows: PanitiaRow[];
  latestImport: PanitiaImportMetadata | null;
};

const ATTENDANCE_MARK = {
  PRESENT: "H",
  ABSENT: "T",
  UNKNOWN: "-",
} as const;

function toKategori(origin: "INTERNAL" | "EXTERNAL" | null): PanitiaKategori {
  if (origin === "INTERNAL") return "Internal";
  if (origin === "EXTERNAL") return "Eksternal";
  return "Kosong";
}

function toPanitiaRow(input: z.infer<typeof RosterRowSchema>): PanitiaRow {
  const kegiatan: Partial<Record<PanitiaSlotKey, string>> = {};
  const hadir = PANITIA_SLOTS.map((slot) => {
    const value = input.slots[slot.key];
    if (value?.activity) kegiatan[slot.key] = value.activity;
    return value ? ATTENDANCE_MARK[value.attendance] : "-";
  }).join("");

  return {
    id: input.beneficiary_id,
    no: input.source_row_number,
    nama: input.name,
    peran: input.pic_hbd ?? "",
    asal: input.employee_group ?? "",
    pic: input.pickup_pic_name ?? "",
    kontak: input.pickup_whatsapp ?? "",
    qty: toNumber(input.quantity),
    kategori: toKategori(input.origin),
    makan: input.meal_eligible,
    hadir,
    kegiatan: Object.keys(kegiatan).length > 0 ? kegiatan : undefined,
  };
}

/** Reads the active event's live roster and, for admins, the newest applied import. */
export async function getPanitiaRoster(eventId: string, includeImportMetadata = false): Promise<PanitiaRoster> {
  const supabase = await createSupabaseServerClient();
  const rosterPromise = supabase
    .from("panitia_roster_overview")
    .select(
      "beneficiary_id, name, quantity, origin, pic_hbd, employee_group, pickup_pic_name, pickup_whatsapp, meal_eligible, source_row_number, last_import_batch_id, slots, roster_updated_at",
    )
    .eq("event_id", eventId)
    .eq("is_active", true)
    .order("source_row_number", { ascending: true });
  const importPromise = includeImportMetadata
    ? supabase.rpc("latest_panitia_import", { p_event_id: eventId })
    : Promise.resolve({ data: [] });
  const [rosterResult, importResult] = await Promise.all([rosterPromise, importPromise]);

  const parsedRows = z.array(RosterRowSchema).safeParse(rosterResult.data ?? []);
  if (!parsedRows.success) {
    throw new Error("Data roster panitia dari database tidak valid.");
  }

  const parsedImportRows = z.array(ImportBatchSchema).safeParse(importResult.data ?? []);
  if (!parsedImportRows.success || parsedImportRows.data.length > 1) {
    throw new Error("Metadata impor roster panitia tidak valid.");
  }
  const parsedImport = parsedImportRows.data[0] ?? null;

  return {
    rows: parsedRows.data.map(toPanitiaRow),
    latestImport: parsedImport
      ? {
          id: parsedImport.id,
          csvFormat: parsedImport.csv_format,
          rowCount: parsedImport.row_count,
          insertCount: parsedImport.insert_count,
          updateCount: parsedImport.update_count,
          unchangedCount: parsedImport.unchanged_count,
          appliedAt: parsedImport.applied_at,
        }
      : null,
  };
}