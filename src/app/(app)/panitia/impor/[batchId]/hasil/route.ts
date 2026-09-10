import { getAdminProfile } from "@/lib/actions/guard";
import { getPanitiaImportPreview } from "@/lib/domain/panitia-import-preview";
import { serializeCsv } from "@/lib/import/csv";

const HEADERS = [
  "BARIS SUMBER", "OPERASI", "ID PENERIMA", "KODE PENERIMA", "NAMA", "STATUS", "MASALAH", "DITERAPKAN PADA",
] as const;

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return value === null || value === undefined ? "" : String(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  if (!(await getAdminProfile())) return new Response("Tidak diizinkan.", { status: 403 });
  const { batchId } = await params;
  const preview = await getPanitiaImportPreview(batchId);
  if (!preview) return new Response("Hasil impor tidak ditemukan.", { status: 404 });

  const applied = preview.batch.status === "APPLIED";
  const resultByRow = new Map(preview.results.map((result) => [result.import_row_id, result]));
  const rows = preview.rows.map((row) => {
    const result = resultByRow.get(row.id);
    return [
      String(row.source_row_number),
      row.operation,
      result?.beneficiary_id ?? row.beneficiary_id ?? "",
      result?.beneficiary_code ?? "",
      text(row.proposed_data, "name"),
      applied ? (result ? "BERHASIL" : "TIDAK ADA HASIL") : "PRATINJAU",
      row.issues.map((issue) => `${issue.severity}: ${issue.message}`).join(" | "),
      result?.applied_at ?? preview.batch.applied_at ?? "",
    ];
  });
  const csv = `﻿${serializeCsv([HEADERS, ...rows])}\r\n`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${applied ? "hasil" : "validasi"}-impor-panitia-${preview.batch.id}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
