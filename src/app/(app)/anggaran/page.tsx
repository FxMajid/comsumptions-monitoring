import type { Metadata } from "next";
import { requireStaffProfile } from "@/lib/auth/server";
import {
  getActiveEvent,
  getBudgetRealizations,
  getBudgetSummary,
} from "@/lib/dashboard/queries";
import { formatPercent, formatRupiah, toNumber } from "@/lib/format";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Anggaran" };

const BUDGET_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draf",
  ACTIVE: "Aktif",
  LOCKED: "Terkunci",
  CANCELLED: "Dibatalkan",
};

export default async function AnggaranPage() {
  await requireStaffProfile("/anggaran");

  const event = await getActiveEvent();

  if (!event) {
    return (
      <>
        <PageHeader title="Anggaran" description="Pagu, tagihan, dan realisasi." />
        <Notice title="Belum ada event">
          Anggaran selalu terikat pada satu event. Tambahkan event lebih dulu.
        </Notice>
      </>
    );
  }

  const [summary, rows] = await Promise.all([
    getBudgetSummary(event.id),
    getBudgetRealizations(event.id),
  ]);

  return (
    <>
      <PageHeader
        title="Anggaran"
        description="Pagu, tagihan yang masuk, dan kas yang sudah keluar."
        meta={
          <span>
            {event.code ? `${event.code} · ` : ""}
            {event.name}
          </span>
        }
      />

      {rows.length === 0 ? (
        <Notice title="Belum ada pos anggaran">
          Tambahkan baris di tabel <code>budgets</code> untuk event ini. Tagihan
          dicatat di <code>expenses</code> dan pembayaran di{" "}
          <code>expense_payments</code>; status pembayaran dihitung, bukan
          disimpan.
        </Notice>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface-raised">
          <table className="w-full min-w-[52rem] text-sm">
            <caption className="sr-only">
              Realisasi anggaran per pos untuk {event.name}
            </caption>
            <thead className="bg-surface-sunken text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Pos
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Pagu
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Tagihan
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Dibayar
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Belum dibayar
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Sisa pagu
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Serapan
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const remaining = toNumber(row.remainingAmount);
                const outstanding = toNumber(row.outstandingAmount);

                return (
                  <tr key={row.budgetId} className="border-t border-line">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <span className="font-medium">{row.name}</span>
                      <span className="ml-2 text-xs text-ink-muted">
                        {row.code}
                        {row.status === "ACTIVE"
                          ? ""
                          : ` · ${BUDGET_STATUS_LABELS[row.status] ?? row.status}`}
                      </span>
                    </th>
                    <td className="numeric px-3 py-2 text-right">
                      {formatRupiah(row.allocatedAmount)}
                    </td>
                    <td className="numeric px-3 py-2 text-right">
                      {formatRupiah(row.invoicedAmount)}
                    </td>
                    <td className="numeric px-3 py-2 text-right">
                      {formatRupiah(row.paidAmount)}
                    </td>
                    <td
                      className={`numeric px-3 py-2 text-right ${
                        outstanding > 0 ? "text-warn" : ""
                      }`}
                    >
                      {formatRupiah(row.outstandingAmount)}
                    </td>
                    <td
                      className={`numeric px-3 py-2 text-right ${
                        remaining < 0 ? "text-alert" : ""
                      }`}
                    >
                      {formatRupiah(row.remainingAmount)}
                    </td>
                    <td className="numeric px-3 py-2 text-right">
                      {row.utilizationPercent === null
                        ? "—"
                        : formatPercent(row.utilizationPercent)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-line bg-surface-sunken font-medium">
              <tr>
                <th scope="row" className="px-3 py-2 text-left">
                  Total
                </th>
                <td className="numeric px-3 py-2 text-right">
                  {formatRupiah(summary.allocatedAmount)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatRupiah(summary.invoicedAmount)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatRupiah(summary.paidAmount)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatRupiah(summary.outstandingAmount)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatRupiah(summary.remainingAmount)}
                </td>
                <td className="px-3 py-2 text-right">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-ink-muted">
        Pos dengan status Dibatalkan tetap ditampilkan per baris, tetapi tidak
        dihitung pada total event.
      </p>
    </>
  );
}
