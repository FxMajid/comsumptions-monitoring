"use client";

import { useId, useState } from "react";
import {
  DEFAULT_CATERING_RATE,
  VOUCHER_RATE,
  estimateCost,
  slotCost,
  type PanitiaSlotBreakdown,
  type PanitiaSummary,
} from "@/lib/domain/panitia";
import { formatNumber, formatRupiah } from "@/lib/format";
import { TableShell } from "@/components/ui/section";
import { Badge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";

const CONTROL_CLASS =
  "w-full rounded-md border border-line bg-surface-raised py-2 pr-3 pl-9 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25";

/**
 * The money view over the portion counts.
 *
 * The sheet fixes Rp 25.000 for the two voucher slots but never states a price
 * for the catered ones, so the catering rate is an input rather than a constant.
 * It is client state on purpose: the figure is a what-if the user turns, not a
 * fact worth a round trip or a URL.
 */
export function KalkulatorBiaya({
  summary,
  breakdowns,
}: Readonly<{
  summary: PanitiaSummary;
  breakdowns: PanitiaSlotBreakdown[];
}>) {
  const inputId = useId();
  const [raw, setRaw] = useState(String(DEFAULT_CATERING_RATE));

  // An empty or half-typed field must not blank out the whole section, so the
  // parse falls back to zero and the figures simply drop to the voucher cost.
  const parsed = Number(raw.replace(/\D/g, ""));
  const rate = Number.isFinite(parsed) ? parsed : 0;
  const total = estimateCost(summary, rate);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-card">
          <label htmlFor={inputId} className="text-xs font-medium text-ink-muted">
            Asumsi harga katering / porsi
          </label>
          <div className="relative mt-1.5">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-muted"
            >
              Rp
            </span>
            <input
              id={inputId}
              type="text"
              inputMode="numeric"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              className={`numeric ${CONTROL_CLASS}`}
            />
          </div>
          <p className="mt-1.5 text-xs text-pretty text-ink-muted">
            Berlaku untuk {formatNumber(summary.kateringPorsi)} porsi katering.
            Slot voucher tetap {formatRupiah(VOUCHER_RATE)}.
          </p>
        </div>

        <StatCard
          label="Estimasi biaya konsumsi"
          value={formatRupiah(total)}
          hint={`${formatNumber(summary.kateringPorsi)} porsi katering + ${formatNumber(summary.voucherPorsi)} porsi voucher`}
        />
        <StatCard
          label="Biaya voucher (H-2 & H+1)"
          value={formatRupiah(summary.voucherPorsi * VOUCHER_RATE)}
          hint="Sudah dipatok di file, butuh persetujuan PIC masing-masing"
        />
        <StatCard
          label="Rata-rata per orang"
          value={
            summary.orangMakan > 0
              ? formatRupiah(Math.round(total / summary.orangMakan))
              : "—"
          }
          hint={`Untuk ${formatNumber(summary.orangMakan)} orang yang dapat konsumsi, seluruh event`}
        />
      </div>

      <TableShell
        caption="Porsi dan estimasi biaya per slot makan"
        minWidth="52rem"
        head={
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">
              Slot
            </th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">
              Skema
            </th>
            {["Internal", "Eksternal", "Kosong", "Total porsi", "Estimasi biaya"].map(
              (label) => (
                <th
                  key={label}
                  scope="col"
                  className="px-4 py-2.5 text-right font-medium"
                >
                  {label}
                </th>
              ),
            )}
          </tr>
        }
      >
        {breakdowns.map((breakdown) => (
          <tr key={breakdown.slot.key} className="border-t border-line">
            <th scope="row" className="px-4 py-2.5 text-left font-medium">
              {breakdown.label}
              <span className="mt-0.5 block text-xs font-normal text-ink-muted">
                {formatNumber(breakdown.rows)} baris menghadiri slot ini
              </span>
            </th>
            <td className="px-4 py-2.5">
              <Badge tone="neutral">
                {breakdown.slot.scheme === "voucher" ? "Voucher 25rb" : "Katering"}
              </Badge>
            </td>
            <td className="numeric px-4 py-2.5 text-right">
              {breakdown.internal > 0 ? formatNumber(breakdown.internal) : "—"}
            </td>
            <td className="numeric px-4 py-2.5 text-right">
              {breakdown.eksternal > 0 ? formatNumber(breakdown.eksternal) : "—"}
            </td>
            <td className="numeric px-4 py-2.5 text-right">
              {breakdown.kosong > 0 ? formatNumber(breakdown.kosong) : "—"}
            </td>
            <td className="numeric px-4 py-2.5 text-right font-semibold">
              {formatNumber(breakdown.total)}
            </td>
            <td className="numeric px-4 py-2.5 text-right">
              {formatRupiah(slotCost(breakdown, rate))}
            </td>
          </tr>
        ))}
        <tr className="border-t-2 border-line bg-surface-sunken font-semibold">
          <th scope="row" className="px-4 py-2.5 text-left">
            Total
          </th>
          <td />
          <td className="numeric px-4 py-2.5 text-right">
            {formatNumber(summary.internal)}
          </td>
          <td className="numeric px-4 py-2.5 text-right">
            {formatNumber(summary.eksternal)}
          </td>
          <td className="numeric px-4 py-2.5 text-right">
            {formatNumber(summary.kategoriKosong)}
          </td>
          <td className="numeric px-4 py-2.5 text-right">
            {formatNumber(summary.totalPorsi)}
          </td>
          <td className="numeric px-4 py-2.5 text-right">{formatRupiah(total)}</td>
        </tr>
      </TableShell>
    </div>
  );
}
