import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// PostgreSQL accepts UUID-shaped values regardless of RFC version/variant bits.
const UUID = z.guid();
const BatchStatus = z.enum(["PREVIEW", "APPLIED", "EXPIRED"]);
const RowOperation = z.enum(["INSERT", "UPDATE", "UNCHANGED", "BLOCKED"]);
const ResultOperation = z.enum(["INSERT", "UPDATE", "UNCHANGED"]);
const IssueSchema = z.object({
  severity: z.enum(["BLOCKER", "WARNING"]),
  code: z.string(),
  message: z.string(),
  slot: z.string().optional(),
});
const JsonRecord = z.record(z.string(), z.unknown());

const BatchRowSchema = z.object({
  id: UUID,
  event_id: UUID,
  confirmation_key: UUID,
  status: BatchStatus,
  csv_format: z.enum(["LEGACY_21", "CANONICAL"]),
  row_count: z.number().int().nonnegative(),
  insert_count: z.number().int().nonnegative(),
  update_count: z.number().int().nonnegative(),
  unchanged_count: z.number().int().nonnegative(),
  blocked_count: z.number().int().nonnegative(),
  warning_count: z.number().int().nonnegative(),
  expires_at: z.string(),
  applied_at: z.string().nullable(),
  created_at: z.string(),
});

const ImportRowSchema = z.object({
  id: UUID,
  source_row_number: z.number().int().positive(),
  operation: RowOperation,
  beneficiary_id: UUID.nullable(),
  proposed_data: JsonRecord,
  current_data: JsonRecord.nullable(),
  issues: z.array(IssueSchema),
});

const ResultRowSchema = z.object({
  import_row_id: UUID,
  beneficiary_id: UUID,
  beneficiary_code: z.string(),
  operation: ResultOperation,
  applied_at: z.string(),
});

const EventSchema = z.object({ id: UUID, code: z.string().nullable(), name: z.string() });
const ImportPreviewSchema = z.object({
  batch: BatchRowSchema,
  event: EventSchema,
  rows: z.array(ImportRowSchema),
  results: z.array(ResultRowSchema),
});

export type PanitiaImportIssue = z.infer<typeof IssueSchema>;
export type PanitiaImportPreviewRow = z.infer<typeof ImportRowSchema>;
export type PanitiaImportResultRow = z.infer<typeof ResultRowSchema>;
export type PanitiaImportPreview = z.infer<typeof ImportPreviewSchema> & {
  isExpired: boolean;
};

const BATCH_COLUMNS = "id, event_id, confirmation_key, status, csv_format, row_count, insert_count, update_count, unchanged_count, blocked_count, warning_count, expires_at, applied_at, created_at";
const ROW_COLUMNS = "id, source_row_number, operation, beneficiary_id, proposed_data, current_data, issues";
const RESULT_COLUMNS = "import_row_id, beneficiary_id, beneficiary_code, operation, applied_at";

export async function getPanitiaImportPreview(
  batchId: string,
): Promise<PanitiaImportPreview | null> {
  const parsedId = UUID.safeParse(batchId);
  if (!parsedId.success) return null;

  const supabase = await createSupabaseServerClient();
  const batchQuery = await supabase
    .from("panitia_import_batches")
    .select(BATCH_COLUMNS)
    .eq("id", parsedId.data)
    .maybeSingle();
  if (batchQuery.error) {
    throw new Error("Pratinjau impor gagal dibaca.", { cause: batchQuery.error });
  }
  const parsedBatch = BatchRowSchema.safeParse(batchQuery.data);
  if (!parsedBatch.success) return null;

  const [eventQuery, rowsQuery, resultsQuery] = await Promise.all([
    supabase
      .from("events")
      .select("id, code, name")
      .eq("id", parsedBatch.data.event_id)
      .maybeSingle(),
    supabase
      .from("panitia_import_rows")
      .select(ROW_COLUMNS)
      .eq("batch_id", parsedId.data)
      .order("source_row_number", { ascending: true }),
    parsedBatch.data.status === "APPLIED"
      ? supabase
          .from("panitia_import_results")
          .select(RESULT_COLUMNS)
          .eq("batch_id", parsedId.data)
          .order("applied_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  if (eventQuery.error || rowsQuery.error || ("error" in resultsQuery && resultsQuery.error)) {
    throw new Error("Rincian pratinjau impor gagal dibaca.", {
      cause: eventQuery.error ?? rowsQuery.error ??
        ("error" in resultsQuery ? resultsQuery.error : null),
    });
  }

  const parsed = ImportPreviewSchema.safeParse({
    batch: parsedBatch.data,
    event: eventQuery.data,
    rows: rowsQuery.data ?? [],
    results: resultsQuery.data ?? [],
  });
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    isExpired: parsed.data.batch.status === "EXPIRED" ||
      (parsed.data.batch.status === "PREVIEW" &&
        Date.parse(parsed.data.batch.expires_at) <= Date.now()),
  };
}
