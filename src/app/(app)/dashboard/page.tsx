import type { Metadata } from "next";
import { requireStaffProfile } from "@/lib/auth/server";
import {
  getActiveEvent,
  getBudgetSummary,
  getEntitlementCounts,
} from "@/lib/dashboard/queries";
import { formatDate, formatNumber, formatRupiah, toNumber } from "@/lib/format";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";

export const metadata: Metadata = { title: "Dashboard" };

const EVENT_STATUS_LABELS: Record<string, string> = {
  active: "Berjalan",
  inactive: "Belum aktif",
  completed: "Selesai",
};

export default async function DashboardPage() {
  await requireStaffProfile("/dashboard");

  const event = await getActiveEvent();

  if (!event) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Ringkasan anggaran dan distribusi konsumsi."
        />
        <Notice title="Belum ada event">
          Tambahkan baris di tabel <code>events</code> dan tandai satu event
          dengan status <code>active</code>. Semua angka di dashboard dihitung
          per event.
        </Notice>
      </>
    );
  }

  const [budget, entitlements] = await Promise.all([
    getBudgetSummary(event.id),
    getEntitlementCounts(event.id),
  ]);

  const allocated = toNumber(budget.allocatedAmount);
  const invoiced = toNumber(budget.invoicedAmount);
  const outstanding = toNumber(budget.outstandingAmount);
  const remaining = toNumber(budget.remainingAmount);
  const utilization = allocated === 0 ? null : (invoiced / allocated) * 100;

  const totalEntitlements =
    entitlements.pending + entitlements.partiallyPicked + entitlements.pickedUp;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Ringkasan anggaran dan distribusi konsumsi."
        meta={
          <span>
            {event.code ? `${event.code} · ` : ""}
            {event.name} · {formatDate(event.eventDate)} ·{" "}
            {EVENT_STATUS_LABELS[event.status] ?? event.status}
          </span>
        }
      />

      <section aria-labelledby="ringkasan-anggaran">
        <h2 id="ringkasan-anggaran" className="mb-3 text-sm font-semibold">
          Anggaran
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Pagu"
            value={formatRupiah(budget.allocatedAmount)}
            hint="Total alokasi anggaran event ini"
          />
          <StatCard
            label="Tagihan masuk"
            value={formatRupiah(budget.invoicedAmount)}
            hint={
              utilization === null
                ? "Pagu belum diisi"
                : `${utilization.toFixed(2)}% dari pagu`
            }
          />
          <StatCard
            label="Sudah dibayar"
            value={formatRupiah(budget.paidAmount)}
            hint="Kas yang benar-benar keluar"
          />
          <StatCard
            label="Belum dibayar"
            value={formatRupiah(budget.outstandingAmount)}
            hint="Utang ke vendor"
            tone={outstanding > 0 ? "warn" : "neutral"}
          />
        </div>
        <div className="mt-3">
          <StatCard
            label="Sisa pagu"
            value={formatRupiah(budget.remainingAmount)}
            hint="Pagu dikurangi tagihan yang sudah masuk"
            tone={remaining < 0 ? "alert" : "ok"}
          />
        </div>
      </section>

      <section aria-labelledby="ringkasan-klaim" className="mt-8">
        <h2 id="ringkasan-klaim" className="mb-3 text-sm font-semibold">
          Klaim konsumsi
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total hak konsumsi"
            value={formatNumber(totalEntitlements)}
            hint="Baris entitlement pada event ini"
          />
          <StatCard
            label="Belum diambil"
            value={formatNumber(entitlements.pending)}
            tone={entitlements.pending > 0 ? "warn" : "neutral"}
          />
          <StatCard
            label="Sebagian diambil"
            value={formatNumber(entitlements.partiallyPicked)}
          />
          <StatCard
            label="Selesai diambil"
            value={formatNumber(entitlements.pickedUp)}
            tone={entitlements.pickedUp > 0 ? "ok" : "neutral"}
          />
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Angka klaim menghitung baris entitlement, bukan jumlah porsi. Rollup
          per porsi menyusul bersama modul pengambilan.
        </p>
      </section>
    </>
  );
}
