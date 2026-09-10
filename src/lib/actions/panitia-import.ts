"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminProfile } from "@/lib/actions/guard";
import { describeWriteError } from "@/lib/actions/errors";
import {
  errorState,
  type ActionState,
  UNAUTHORIZED_MESSAGE,
} from "@/lib/actions/result";
import { requireActiveEventId } from "@/lib/domain/event";
import { CsvParseError } from "@/lib/import/csv";
import {
  importPanitiaCsv,
  type PanitiaAreaSnapshot,
} from "@/lib/import/panitia-csv";
import type {
  PanitiaImportAttendance,
  PanitiaImportRecord,
} from "@/lib/import/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_CSV_BYTES = 512 * 1024;
const ACCEPTED_CSV_TYPES = new Set(["", "text/csv", "application/csv", "application/vnd.ms-excel"]);
const UUID = z.string().uuid();
const PreviewResultSchema = z.object({ batch_id: UUID });
const ConfirmResultSchema = z.object({ batch_id: UUID, status: z.literal("APPLIED") });

const SLOT_KEYS = {
  h2Siang: "h2_siang",
  h1Siang: "h1_siang",
  h1Malam: "h1_malam",
  hPagi: "h_pagi",
  hSiang: "h_siang",
  hMalam: "h_malam",
  hPlus1: "hplus1",
} as const;

const ATTENDANCE = {
  HADIR: "PRESENT",
  TIDAK_HADIR: "ABSENT",
  KOSONG: "UNKNOWN",
} as const satisfies Record<PanitiaImportAttendance, string>;

function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/[() .-]/gu, "");
  return compact.startsWith("+") ? compact : compact.replace(/^0/u, "62");
}

type ParserIssue = {
  row: number;
  column: string | null;
  message: string;
};

function toRpcIssue(issue: ParserIssue) {
  return {
    severity: "BLOCKER",
    code: "CSV_PARSE_ERROR",
    message: `${issue.column ? `${issue.column}: ` : ""}${issue.message}`,
  } as const;
}

function toRpcRecord(
  record: PanitiaImportRecord,
  areaCodeById: ReadonlyMap<string, string>,
  issues: readonly ParserIssue[] = [],
) {
  return {
    source_row_number: record.rowNumber,
    client_issues: issues.map(toRpcIssue),
    beneficiary_id: record.stableId,
    number: record.number,
    name: record.name,
    pic_hbd: record.picHbd,
    employee_group: record.employeeGroup,
    pickup_pic_name: record.pickupPicName,
    pickup_whatsapp: normalizePhone(record.pickupPicPhone),
    quantity: record.quantity,
    origin: record.origin,
    meal_eligible: record.eats,
    area: record.areaId ? areaCodeById.get(record.areaId) ?? null : null,
    slots: Object.fromEntries(
      Object.entries(SLOT_KEYS).map(([clientKey, databaseKey]) => {
        const key = clientKey as keyof typeof SLOT_KEYS;
        return [databaseKey, {
          attendance: ATTENDANCE[record.attendance[key]],
          activity: record.activities[key] ?? null,
        }];
      }),
    ),
  };
}

function toBlockedRpcRecord(rowNumber: number, issues: readonly ParserIssue[]) {
  return {
    source_row_number: rowNumber,
    client_issues: issues.map(toRpcIssue),
    beneficiary_id: null,
    number: null,
    name: "",
    pic_hbd: null,
    employee_group: null,
    pickup_pic_name: null,
    pickup_whatsapp: null,
    quantity: null,
    origin: null,
    meal_eligible: null,
    area: null,
    slots: null,
  };
}

async function getAreaSnapshot(eventId: string): Promise<PanitiaAreaSnapshot[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("areas")
    .select("id, code, name")
    .eq("event_id", eventId);
  if (error) throw new Error("Master area gagal dibaca sebelum impor.", { cause: error });

  const parsed = z.array(z.object({ id: UUID, code: z.string(), name: z.string() }))
    .safeParse(data ?? []);
  if (!parsed.success) throw new Error("Data master area dari database tidak valid.");
  return parsed.data;
}

export async function createPanitiaImportPreview(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await getAdminProfile())) return errorState(UNAUTHORIZED_MESSAGE);
  const eventId = await requireActiveEventId();
  if (!eventId) return errorState("Belum ada event untuk menerima impor roster.");

  const entry = formData.get("file");
  if (!(entry instanceof File) || entry.size === 0) {
    return errorState("Pilih file CSV yang akan diimpor.", { file: ["File CSV wajib dipilih."] });
  }
  if (!entry.name.toLocaleLowerCase("id-ID").endsWith(".csv") || !ACCEPTED_CSV_TYPES.has(entry.type)) {
    return errorState("File harus berupa CSV.", { file: ["Gunakan file dengan ekstensi .csv."] });
  }
  if (entry.size > MAX_CSV_BYTES) {
    return errorState("Ukuran file melebihi batas 512 KiB.", { file: ["Maksimal 512 KiB."] });
  }

  const bytes = new Uint8Array(await entry.arrayBuffer());
  if (bytes.byteLength > MAX_CSV_BYTES) return errorState("Ukuran file melebihi batas 512 KiB.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return errorState("File harus berupa CSV ber-encoding UTF-8 yang sah.");
  }

  try {
    const areas = await getAreaSnapshot(eventId);
    const parsed = importPanitiaCsv(text, areas);
    if (!parsed.format) {
      return errorState(parsed.issues[0]?.message ?? "Header CSV tidak dikenali.");
    }
    const issuesByRow = new Map<number, ParserIssue[]>();
    for (const issue of parsed.issues) {
      const current = issuesByRow.get(issue.row);
      if (current) current.push(issue);
      else issuesByRow.set(issue.row, [issue]);
    }
    const recordsByRow = new Map(parsed.records.map((record) => [record.rowNumber, record]));
    const sourceRows = [...new Set([
      ...recordsByRow.keys(),
      ...issuesByRow.keys(),
    ])].sort((left, right) => left - right);
    if (sourceRows.length === 0) {
      return errorState("CSV tidak berisi baris roster yang dapat diproses.");
    }

    const supabase = await createSupabaseServerClient();
    const areaCodeById = new Map(areas.map((area) => [area.id, area.code]));
    const rpcRows = sourceRows.map((rowNumber) => {
      const record = recordsByRow.get(rowNumber);
      const issues = issuesByRow.get(rowNumber) ?? [];
      return record
        ? toRpcRecord(record, areaCodeById, issues)
        : toBlockedRpcRecord(rowNumber, issues);
    });
    const { data, error } = await supabase.rpc("create_panitia_import_preview", {
      p_event_id: eventId,
      p_file_hash: createHash("sha256").update(bytes).digest("hex"),
      p_csv_format: parsed.format === "canonical" ? "CANONICAL" : "LEGACY_21",
      p_rows: rpcRows,
    });
    if (error) return describeWriteError(error);
    const result = PreviewResultSchema.safeParse(data);
    if (!result.success) return errorState("Pratinjau tersimpan, tetapi respons server tidak dikenali.");
    redirect(`/panitia/impor/${result.data.batch_id}`);
  } catch (error) {
    if (error instanceof CsvParseError) return errorState(error.message);
    throw error;
  }
}

export async function confirmPanitiaImport(
  batchId: string,
  confirmationKey: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await getAdminProfile())) return errorState(UNAUTHORIZED_MESSAGE);
  const refs = z.object({ batchId: UUID, confirmationKey: UUID }).safeParse({ batchId, confirmationKey });
  if (!refs.success) return errorState("Referensi pratinjau tidak sah. Muat ulang halaman.");
  if (formData.get("acknowledgement") !== "yes") {
    return errorState("Centang persetujuan setelah memeriksa seluruh perubahan.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("confirm_panitia_import", {
    p_batch_id: refs.data.batchId,
    p_confirmation_key: refs.data.confirmationKey,
  });
  if (error) return describeWriteError(error);
  const result = ConfirmResultSchema.safeParse(data);
  if (!result.success) return errorState("Impor selesai, tetapi respons server tidak dikenali.");
  revalidatePath("/panitia");
  revalidatePath("/master");
  revalidatePath("/master/penerima");
  revalidatePath("/pengambilan");
  revalidatePath(`/panitia/impor/${result.data.batch_id}`);
  redirect(`/panitia/impor/${result.data.batch_id}`);
}
