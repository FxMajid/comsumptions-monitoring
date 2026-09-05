import {
  Banknote,
  CalendarDays,
  ClipboardList,
  Receipt,
  ScanLine,
  TriangleAlert,
  Utensils,
  Wallet,
} from "lucide-react";
import { budgetUtilizationPercent, type BudgetSummary } from "@/lib/domain/budget";
import type { EntitlementDistribution } from "@/lib/domain/entitlement";
import { EVENT_STATUS_LABELS, daysUntilEvent } from "@/lib/domain/event";
import { PANITIA_ROWS } from "@/lib/data/panitia-rows";
import {
  DEFAULT_CATERING_RATE,
  dataIssues,
  estimateCost,
  pickupBySlot,
  porsiByDay,
  slotBreakdowns,
  summarizePanitia,
} from "@/lib/domain/panitia";
import {
  formatDate,
  formatNumber,
  formatRupiah,
  formatShare,
  toNumber,
} from "@/lib/format";
import { DistributionBar } from "@/components/ui/meter";
import { CardLabel, IconChip, PillLink, SoftCard, Tag } from "@/components/ui/soft";
import {
  CoverageRows,
  DayDots,
  NestedCircles,
  RingGauge,
  SlotSparkline,
} from "@/components/dashboard/figures";

/**
 * The dashboard as one composition rather than a stack of sections.
 *
 * Everything it draws arrives as plain props or comes from the in-repo committee
 * file, so the layout can be rendered without a database — and every figure it
 * shows is computed in the domain layer, never here.
 *
 * The bento is three rows of twelve columns on a wide screen: money first,
 * because that is what a decision hangs on, then the portion estimate, then the
 * two readinesses — claims in the database and pickup PICs in the file.
 */

/** The committee estimate is a file, not a query, so it is summarized once. */
const PANITIA = summarizePanitia(PANITIA_ROWS);
const PANITIA_SLOTS_PORSI = slotBreakdowns(PANITIA_ROWS);
const PANITIA_DAYS = porsiByDay(PANITIA_ROWS);
const PANITIA_PICKUP = pickupBySlot(PANITIA_ROWS);
const PANITIA_WARNINGS = dataIssues(PANITIA_ROWS).filter(
  (issue) => issue.tone === "warn",
).length;
const PANITIA_ASSIGNED = PANITIA_PICKUP.reduce(
  (sum, slot) => sum + slot.assigned,
  0,
);
const PEAK_INDEX = PANITIA_SLOTS_PORSI.findIndex(
  (breakdown) => breakdown.slot.key === PANITIA.puncak.slot.key,
);
const PANITIA_POINTS = PANITIA_SLOTS_PORSI.map((breakdown) => ({
  label: breakdown.label,
  value: breakdown.total,
}));
const FIRST_POINT = PANITIA_POINTS[0];
const LAST_POINT = PANITIA_POINTS[PANITIA_POINTS.length - 1];

/** Long enough to read as a texture, short enough that one dot is still one day. */
const COUNTDOWN_WINDOW = 30;

export type RingkasanEvent = {
  name: string;
  code: string | null;
  eventDate: string | null;
  status: string;
};

/**
 * Resolved by the page, which is where the role lives. Passing booleans instead
 * of the role keeps this component free of the access contract.
 */
export type RingkasanLinks = {
  anggaran: boolean;
  vendor: boolean;
  pengambilan: boolean;
  panitia: boolean;
};

export function Ringkasan({
  event,
  budget,
  distribution,
  links,
}: Readonly<{
  event: RingkasanEvent;
  budget: BudgetSummary;
  distribution: EntitlementDistribution;
  links: RingkasanLinks;
}>) {
  const allocated = toNumber(budget.allocatedAmount);
  const remaining = toNumber(budget.remainingAmount);
  const outstanding = toNumber(budget.outstandingAmount);
  const paid = toNumber(budget.paidAmount);
  const utilization = budgetUtilizationPercent(budget);
  const overBudget = remaining < 0;

  const countdown = daysUntilEvent(event.eventDate);
  const elapsed = countdown === null ? 0 : COUNTDOWN_WINDOW - countdown;
  const coverage = PANITIA.totalPorsi
    ? (PANITIA_ASSIGNED / PANITIA.totalPorsi) * 100
    : 0;

  return (
    <div className="rounded-soft bg-soft-ground p-4 sm:p-5 lg:p-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <IconChip tone="brand">
          <Utensils aria-hidden="true" className="size-5" />
        </IconChip>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Dashboard Konsumsi
          </h1>
          <p className="mt-0.5 truncate text-sm text-ink-muted">
            {event.name} · {formatDate(event.eventDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {event.code ? <Tag>{event.code}</Tag> : null}
          <Tag tone="dot">
            {EVENT_STATUS_LABELS[event.status] ?? event.status}
          </Tag>
          {links.pengambilan ? (
            <PillLink href="/pengambilan" tone="ink" arrow>
              Buka pengambilan
            </PillLink>
          ) : null}
        </div>
      </header>

      {event.status === "active" ? null : (
        <p className="mt-4 flex items-start gap-2 rounded-soft-sm bg-warn/10 px-4 py-3 text-xs text-pretty text-ink">
          <TriangleAlert
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0 text-warn"
          />
          <span>
            Tidak ada event berstatus{" "}
            <strong className="font-semibold">Berjalan</strong>. Angka di bawah
            memakai event terbaru sebagai gantinya.
          </span>
        </p>
      )}

      {/*
        Twelve columns only on the widest breakpoint. Between phone and desktop
        the same cards fall into two columns, so the money card and the charts
        keep a readable measure instead of stretching across a laptop screen.
      */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-12">
        <SoftCard className="sm:col-span-2 xl:col-span-5">
          <div className="flex items-center gap-3">
            <IconChip>
              <Wallet aria-hidden="true" className="size-5" />
            </IconChip>
            <CardLabel>Sisa pagu</CardLabel>
          </div>

          <p
            className={`numeric mt-4 text-3xl font-semibold sm:text-4xl ${
              overBudget ? "text-alert" : "text-ink"
            }`}
          >
            {formatRupiah(budget.remainingAmount)}
          </p>
          <p className="mt-2 max-w-prose text-sm text-pretty text-ink-muted">
            {overBudget
              ? `Tagihan yang masuk sudah melewati pagu ${formatRupiah(allocated)}.`
              : `Dari pagu ${formatRupiah(allocated)}, setelah dikurangi tagihan yang sudah masuk.`}
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-soft-hairline pt-4">
            <div>
              <dt className="text-xs font-medium text-ink-muted">Pagu</dt>
              <dd className="numeric mt-0.5 text-sm font-semibold">
                {formatRupiah(budget.allocatedAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted">Tagihan masuk</dt>
              <dd className="numeric mt-0.5 text-sm font-semibold">
                {formatRupiah(budget.invoicedAmount)}
              </dd>
            </div>
          </dl>

          {links.anggaran || links.vendor ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {links.anggaran ? (
                <PillLink href="/anggaran" tone="ink" arrow>
                  Rincian anggaran
                </PillLink>
              ) : null}
              {links.vendor ? <PillLink href="/vendor">Vendor</PillLink> : null}
            </div>
          ) : null}
        </SoftCard>

        <div className="grid gap-4 xl:col-span-3">
          <SoftCard>
            <div className="flex items-center justify-between gap-3">
              <IconChip>
                <Banknote aria-hidden="true" className="size-5" />
              </IconChip>
              {allocated > 0 ? (
                <Tag>{formatShare((paid / allocated) * 100)} dari pagu</Tag>
              ) : null}
            </div>
            <div className="mt-4">
              <CardLabel>Sudah dibayar</CardLabel>
            </div>
            <p className="numeric mt-1 text-2xl font-semibold">
              {formatRupiah(budget.paidAmount)}
            </p>
          </SoftCard>

          <SoftCard>
            <div className="flex items-center justify-between gap-3">
              <IconChip>
                <Receipt aria-hidden="true" className="size-5" />
              </IconChip>
              {allocated > 0 ? (
                <Tag>{formatShare((outstanding / allocated) * 100)} dari pagu</Tag>
              ) : null}
            </div>
            <div className="mt-4">
              <CardLabel>Belum dibayar</CardLabel>
            </div>
            {/* Coloured only because an unpaid balance is a state, not a size. */}
            <p
              className={`numeric mt-1 text-2xl font-semibold ${
                outstanding > 0 ? "text-warn" : "text-ink"
              }`}
            >
              {formatRupiah(budget.outstandingAmount)}
            </p>
          </SoftCard>
        </div>

        {/*
          The gauge sits straight on the ground rather than inside a card: it is
          the one dark shape on the page, and a white card around it would give it
          a second edge that competes with the ring.
        */}
        <div className="grid content-start justify-items-center gap-3 xl:col-span-2">
          <RingGauge
            percent={utilization}
            label={utilization === null ? "—" : formatShare(utilization)}
            caption="Serapan pagu"
            over={overBudget}
          />
          <p className="px-1 text-center text-xs text-pretty text-ink-muted">
            {utilization === null
              ? "Pagu belum diisi, jadi serapan belum bisa dihitung."
              : `Tagihan masuk ${formatRupiah(budget.invoicedAmount)} terhadap pagu.`}
          </p>
        </div>

        <SoftCard className="sm:col-span-2 xl:col-span-2">
          <IconChip>
            <CalendarDays aria-hidden="true" className="size-5" />
          </IconChip>
          <div className="mt-4">
            <CardLabel>Menuju hari-H</CardLabel>
          </div>
          {countdown === null ? (
            <p className="mt-1 text-sm font-semibold">Tanggal belum diisi</p>
          ) : (
            <p className="numeric mt-1 text-2xl font-semibold">
              {countdown >= 0
                ? `${formatNumber(countdown)} hari`
                : `Lewat ${formatNumber(Math.abs(countdown))} hari`}
            </p>
          )}
          <p className="mt-1 text-xs text-ink-muted">
            {formatDate(event.eventDate)}
          </p>
          {countdown === null ? null : (
            <div className="mt-4">
              <DayDots window={COUNTDOWN_WINDOW} elapsed={elapsed} />
              <p className="mt-2 text-[11px] text-ink-muted">
                Satu titik satu hari, {COUNTDOWN_WINDOW} hari terakhir.
              </p>
            </div>
          )}
        </SoftCard>

        <SoftCard className="sm:col-span-2 xl:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconChip>
                <Utensils aria-hidden="true" className="size-5" />
              </IconChip>
              <div>
                <CardLabel>Ancar-ancar porsi panitia</CardLabel>
                <p className="numeric mt-0.5 text-2xl font-semibold">
                  {formatNumber(PANITIA.totalPorsi)} porsi
                </p>
              </div>
            </div>
            <Tag tone="brand">
              Puncak {PANITIA.puncak.label} ·{" "}
              {formatNumber(PANITIA.puncak.total)}
            </Tag>
          </div>

          <div className="mt-5">
            <SlotSparkline points={PANITIA_POINTS} peakIndex={PEAK_INDEX} />
            {/* The two ends of the line, named. The seven exact figures live on
                /panitia; here the shape plus its endpoints is the reading. */}
            <div className="mt-1 flex items-baseline justify-between gap-4 text-[11px] text-ink-muted">
              <span className="numeric">
                {FIRST_POINT.label} · {formatNumber(FIRST_POINT.value)}
              </span>
              <span className="numeric">
                {LAST_POINT.label} · {formatNumber(LAST_POINT.value)}
              </span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-soft-hairline pt-4">
            <p className="text-xs text-pretty text-ink-muted">
              Estimasi biaya{" "}
              <strong className="numeric font-semibold text-ink">
                {formatRupiah(estimateCost(PANITIA, DEFAULT_CATERING_RATE))}
              </strong>{" "}
              dengan asumsi katering {formatRupiah(DEFAULT_CATERING_RATE)} per
              porsi.
            </p>
            {links.panitia ? (
              <PillLink href="/panitia" arrow>
                Buka ancar-ancar
              </PillLink>
            ) : null}
          </div>
        </SoftCard>

        <SoftCard className="sm:col-span-2 xl:col-span-5">
          <div className="flex items-center gap-3">
            <IconChip>
              <CalendarDays aria-hidden="true" className="size-5" />
            </IconChip>
            <CardLabel>Porsi per hari</CardLabel>
          </div>

          <div className="mt-5">
            <NestedCircles
              points={PANITIA_DAYS.map((day) => ({
                label: day.day,
                value: day.porsi,
              }))}
              total={PANITIA.totalPorsi}
            />
          </div>

          <p className="mt-4 border-t border-soft-hairline pt-4 text-xs text-pretty text-ink-muted">
            Luas lingkaran sebanding dengan jumlah porsi, bukan garis tengahnya.
            Hari-H sendiri memuat tiga slot makan.
          </p>
        </SoftCard>

        <SoftCard className="sm:col-span-2 xl:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconChip>
                <ScanLine aria-hidden="true" className="size-5" />
              </IconChip>
              <CardLabel>Kesiapan pengambilan</CardLabel>
            </div>
            <Tag>
              {formatNumber(PANITIA.totalPorsi - PANITIA_ASSIGNED)} porsi tanpa
              PIC
            </Tag>
          </div>

          <p className="numeric mt-4 text-2xl font-semibold">
            {formatShare(coverage)}
          </p>
          <p className="mt-1 text-sm text-pretty text-ink-muted">
            porsi sudah punya nama penanggung jawab pengambilan.
          </p>

          <div className="mt-5">
            <CoverageRows
              rows={PANITIA_PICKUP.map((slot) => ({
                label: slot.label,
                done: slot.assigned,
                total: slot.total,
              }))}
            />
          </div>

          <p className="mt-4 border-t border-soft-hairline pt-4 text-xs text-pretty text-ink-muted">
            {PANITIA_WARNINGS > 0
              ? `${formatNumber(PANITIA_WARNINGS)} hal masih perlu dibereskan di file ancar-ancar sebelum QR klaim bisa dikirim.`
              : "File ancar-ancar sudah bersih; hak konsumsi siap diterbitkan."}
          </p>
        </SoftCard>

        <SoftCard className="sm:col-span-2 xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconChip>
                <ClipboardList aria-hidden="true" className="size-5" />
              </IconChip>
              <CardLabel>Klaim konsumsi</CardLabel>
            </div>
            <Tag>{formatNumber(distribution.total)} baris hak konsumsi</Tag>
          </div>

          <div className="mt-5">
            <DistributionBar
              segments={distribution.shares}
              emptyLabel="Belum ada hak konsumsi yang diterbitkan untuk event ini."
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-soft-hairline pt-4">
            <p className="text-xs text-pretty text-ink-muted">
              Angka di sini menghitung baris hak konsumsi, bukan jumlah porsi.
            </p>
            {links.pengambilan ? (
              <PillLink href="/pengambilan" arrow>
                Buka pengambilan
              </PillLink>
            ) : null}
          </div>
        </SoftCard>
      </div>
    </div>
  );
}
