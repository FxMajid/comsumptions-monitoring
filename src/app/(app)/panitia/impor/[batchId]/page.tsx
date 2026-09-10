import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PanitiaImportConfirmForm } from "@/components/panitia/impor-confirm-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/status-badge";
import { Card, Section, TableShell } from "@/components/ui/section";
import { requireStaffProfile } from "@/lib/auth/server";
import {
  getPanitiaImportPreview,
  type PanitiaImportPreviewRow,
} from "@/lib/domain/panitia-import-preview";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Pratinjau Impor Panitia" };

const OPERATION = {
  INSERT: { label: "Baru", tone: "ok" },
  UPDATE: { label: "Diperbarui", tone: "warn" },
  UNCHANGED: { label: "Tetap", tone: "neutral" },
  BLOCKED: { label: "Terblokir", tone: "alert" },
} as const;

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : "—";
}

function quantity(record: Record<string, unknown>): string {
  const value = record.quantity;
  return typeof value === "number" || typeof value === "string"
    ? formatNumber(value)
    : "—";
}

function Changes({ row }: Readonly<{ row: PanitiaImportPreviewRow }>) {
  if (row.operation !== "UPDATE" || !row.current_data) return <span>—</span>;
  const labels: Record<string, string> = {
    name: "nama",
    pic_hbd: "PIC HBD",
    employee_group: "employee",
    quantity: "qty",
    origin: "kategori",
    area_id: "area",
    pickup_pic_name: "PIC pengambilan",
    pickup_whatsapp: "WhatsApp",
    meal_eligible: "makan",
    slots: "jadwal kehadiran",
  };
  const changed = Object.keys(labels).filter((key) =>
    JSON.stringify(row.current_data?.[key] ?? null) !== JSON.stringify(row.proposed_data[key] ?? null),
  );
  return <span>{changed.map((key) => labels[key]).join(", ") || "Data roster"}</span>;
}

export default async function PanitiaImportPreviewPage({
  params,
}: Readonly<{ params: Promise<{ batchId: string }> }>) {
  await requireStaffProfile("/panitia/impor");
  const { batchId } = await params;
  const preview = await getPanitiaImportPreview(batchId);
  if (!preview) notFound();

  const { batch, event, rows, results, isExpired } = preview;
  const expired = isExpired;
  const canConfirm = batch.status === "PREVIEW" && !expired && batch.blocked_count === 0;
  const resultByRow = new Map(results.map((result) => [result.import_row_id, result]));

  return (
    <>
      <PageHeader
        title={batch.status === "APPLIED" ? "Hasil impor roster" : "Pratinjau impor roster"}
        description={`${event.name} · ${formatNumber(batch.row_count)} baris · dibuat ${formatDateTime(batch.created_at)}`}
        meta={
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <Link href={`/panitia/impor/${batch.id}/hasil`} className="text-brand-600 underline-offset-2 hover:underline">
              Unduh {batch.status === "APPLIED" ? "hasil" : "laporan validasi"}
            </Link>
            <Link href="/panitia/impor" className="text-brand-600 underline-offset-2 hover:underline">← Impor lain</Link>
          </div>
        }
      />

      <Section title="Ringkasan perubahan" description={`Format ${batch.csv_format === "CANONICAL" ? "template sistem" : "legacy 21 kolom"}.`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Baris baru", batch.insert_count],
            ["Diperbarui", batch.update_count],
            ["Tidak berubah", batch.unchanged_count],
            ["Terblokir", batch.blocked_count],
            ["Dengan peringatan", batch.warning_count],
          ].map(([label, value]) => (
            <Card key={String(label)}><p className="text-xs font-medium text-ink-muted">{label}</p><p className="numeric mt-1 text-2xl font-semibold">{formatNumber(value)}</p></Card>
          ))}
        </div>
      </Section>

      {expired ? <Notice title="Pratinjau kedaluwarsa">Unggah ulang CSV untuk membuat pratinjau baru. Pratinjau hanya berlaku 24 jam.</Notice> : null}
      {batch.blocked_count > 0 ? <Notice title="Impor belum dapat diterapkan">Perbaiki semua baris terblokir di file sumber, lalu unggah kembali.</Notice> : null}
      {batch.status === "APPLIED" ? (
        <Notice title="Impor telah diterapkan">Selesai pada {formatDateTime(batch.applied_at)}. <Link href={`/panitia/impor/${batch.id}/hasil`} className="font-medium text-brand-600 underline-offset-2 hover:underline">Unduh hasil CSV</Link>.</Notice>
      ) : null}

      <Section title="Rincian baris" description="Pratinjau ini dibaca dari data yang tersimpan di server, bukan dari browser.">
        <TableShell
          caption="Rincian pratinjau impor roster panitia"
          minWidth="72rem"
          head={<tr><th className="px-3 py-2 text-left">Baris</th><th className="px-3 py-2 text-left">Operasi</th><th className="px-3 py-2 text-left">Nama</th><th className="px-3 py-2 text-left">PIC / Employee</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-left">Perubahan / masalah</th><th className="px-3 py-2 text-left">Kode hasil</th></tr>}
        >
          {rows.map((row) => {
            const operation = OPERATION[row.operation];
            const result = resultByRow.get(row.id);
            return (
              <tr key={row.id} className="border-t border-line align-top">
                <td className="numeric px-3 py-3">{row.source_row_number}</td>
                <td className="px-3 py-3"><Badge tone={operation.tone}>{operation.label}</Badge></td>
                <td className="px-3 py-3 font-medium">{text(row.proposed_data, "name")}</td>
                <td className="px-3 py-3"><span className="block">{text(row.proposed_data, "pic_hbd")}</span><span className="text-xs text-ink-muted">{text(row.proposed_data, "employee_group")}</span></td>
                <td className="numeric px-3 py-3 text-right">{quantity(row.proposed_data)}</td>
                <td className="max-w-md px-3 py-3 text-ink-muted">
                  {row.issues.length > 0 ? <ul className="grid gap-1">{row.issues.map((issue, index) => <li key={`${issue.code}-${index}`} className={issue.severity === "BLOCKER" ? "text-alert" : "text-warn"}>{issue.message}</li>)}</ul> : <Changes row={row} />}
                </td>
                <td className="px-3 py-3">{result?.beneficiary_code ?? "—"}</td>
              </tr>
            );
          })}
        </TableShell>
      </Section>

      {canConfirm ? (
        <Section title="Konfirmasi impor" description={`Pratinjau berlaku sampai ${formatDateTime(batch.expires_at)}.`}>
          <Card><PanitiaImportConfirmForm batchId={batch.id} confirmationKey={batch.confirmation_key} /></Card>
        </Section>
      ) : null}
    </>
  );
}
