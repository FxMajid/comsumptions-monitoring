import type { Metadata } from "next";
import Link from "next/link";
import { requireStaffProfile } from "@/lib/auth/server";
import { createPlan, createSlot } from "@/lib/actions/planning";
import { getActiveEvent } from "@/lib/domain/event";
import { getConsumptionItems } from "@/lib/domain/master";
import { getPlanCoverage, getSlotOverviews } from "@/lib/domain/planning";
import {
  formatDate,
  formatNumber,
  formatRupiah,
  formatTimeRange,
  formatDateTime,
} from "@/lib/format";
import { PlanForm } from "@/components/forms/plan-form";
import { SlotForm } from "@/components/forms/slot-form";
import type { Option } from "@/components/forms/options";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Section, TableShell } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Perencanaan" };

export default async function PerencanaanPage() {
  await requireStaffProfile("/perencanaan");

  const event = await getActiveEvent();

  if (!event) {
    return (
      <>
        <PageHeader
          title="Perencanaan"
          description="Slot konsumsi dan rencana per item."
        />
        <Notice title="Belum ada event">
          Slot dan rencana selalu terikat pada satu event. Tambahkan event lebih
          dulu.
        </Notice>
      </>
    );
  }

  const [slots, plans, items] = await Promise.all([
    getSlotOverviews(event.id),
    getPlanCoverage(event.id),
    getConsumptionItems(event.id),
  ]);

  const itemOptions: Option[] = items
    .filter((item) => item.isActive)
    .map((item) => ({
      value: item.id,
      label: `${item.code} · ${item.name} (${item.unitOfMeasure})`,
    }));

  const slotOptions: Option[] = slots.map((slot) => ({
    value: slot.id,
    label: `${slot.code} · ${slot.name} — ${formatDate(slot.slotDate)}`,
  }));

  return (
    <>
      <PageHeader
        title="Perencanaan"
        description="Slot konsumsi, lalu rencana jumlah per item pada tiap slot."
        meta={
          <span>
            {event.code ? `${event.code} · ` : ""}
            {event.name} · {formatDate(event.eventDate)}
          </span>
        }
      />

      <Section
        title="Slot konsumsi"
        description="Satu slot adalah satu kesempatan makan: sarapan H-1, makan siang hari-H, dan seterusnya."
      >
        {slots.length === 0 ? (
          <Notice title="Belum ada slot">
            Slot baru berstatus Draf. Buka slot ketika rencananya sudah pasti.
          </Notice>
        ) : (
          <TableShell
            caption={`Slot konsumsi untuk ${event.name}`}
            minWidth="56rem"
            head={
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Slot
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Tanggal
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Jam
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Batas ambil
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Rencana
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Porsi
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Hak konsumsi
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Status
                </th>
              </tr>
            }
          >
            {slots.map((slot) => (
              <tr key={slot.id} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <Link
                    href={`/perencanaan/slot/${slot.id}`}
                    className="font-medium text-brand-600 underline-offset-2 hover:underline"
                  >
                    {slot.name}
                  </Link>
                  <span className="ml-2 text-xs text-ink-muted">{slot.code}</span>
                </th>
                <td className="px-3 py-2">
                  {formatDate(slot.slotDate)}
                  {slot.relativeDayOffset === null ? null : (
                    <span className="ml-1.5 text-xs text-ink-muted">
                      H{slot.relativeDayOffset >= 0 ? "+" : ""}
                      {slot.relativeDayOffset}
                    </span>
                  )}
                </td>
                <td className="numeric px-3 py-2">
                  {formatTimeRange(slot.startsAt, slot.endsAt)}
                </td>
                <td className="px-3 py-2 text-xs">
                  {formatDateTime(slot.pickupDeadline)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatNumber(slot.planCount)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatNumber(slot.plannedQuantity)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatNumber(slot.entitlementQuantity)}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge entity="consumption_slots" status={slot.status} />
                </td>
              </tr>
            ))}
          </TableShell>
        )}

        <div className="mt-4 max-w-3xl">
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Tambah slot</h3>
            <SlotForm
              action={createSlot}
              submitLabel="Tambah slot"
              defaultDate={event.eventDate ?? undefined}
            />
          </Card>
        </div>
      </Section>

      <Section
        title="Rencana konsumsi"
        description="Jumlah yang direncanakan per item per slot, dibandingkan dengan yang sudah dipesan ke vendor."
      >
        {plans.length === 0 ? (
          <Notice title="Belum ada rencana">
            Rencana adalah dasar pemesanan: satu baris pesanan vendor selalu
            menunjuk ke satu rencana.
          </Notice>
        ) : (
          <TableShell
            caption={`Rencana konsumsi untuk ${event.name}`}
            minWidth="64rem"
            head={
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Slot
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Item
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Rencana
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Dipesan
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Diterima
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Belum dipesan
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Nilai rencana
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Status
                </th>
              </tr>
            }
          >
            {plans.map((plan) => (
              <tr key={plan.id} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="font-medium">{plan.slotName}</span>
                  <span className="ml-2 text-xs text-ink-muted">
                    {formatDate(plan.slotDate)}
                  </span>
                </th>
                <td className="px-3 py-2">
                  <Link
                    href={`/perencanaan/rencana/${plan.id}`}
                    className="text-brand-600 underline-offset-2 hover:underline"
                  >
                    {plan.itemName}
                  </Link>
                  <span className="ml-2 text-xs text-ink-muted">
                    {plan.itemCode}
                  </span>
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatNumber(plan.plannedQuantity)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatNumber(plan.requestedQuantity)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatNumber(plan.receivedQuantity)}
                </td>
                <td
                  className={`numeric px-3 py-2 text-right ${
                    plan.unorderedQuantity > 0 ? "text-warn" : ""
                  }`}
                >
                  {formatNumber(plan.unorderedQuantity)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatRupiah(plan.plannedAmount)}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge entity="consumption_plans" status={plan.status} />
                </td>
              </tr>
            ))}
          </TableShell>
        )}

        <div className="mt-4 max-w-3xl">
          {itemOptions.length === 0 || slotOptions.length === 0 ? (
            <Notice title="Rencana butuh item dan slot">
              Tambahkan minimal satu item aktif di{" "}
              <Link
                href="/master"
                className="text-brand-600 underline-offset-2 hover:underline"
              >
                Data Master
              </Link>{" "}
              dan satu slot di atas.
            </Notice>
          ) : (
            <Card>
              <h3 className="mb-3 text-sm font-semibold">Tambah rencana</h3>
              <PlanForm
                action={createPlan}
                items={itemOptions}
                slots={slotOptions}
                submitLabel="Tambah rencana"
              />
            </Card>
          )}
        </div>
      </Section>

      <p className="text-xs text-ink-muted">
        &ldquo;Belum dipesan&rdquo; adalah rencana dikurangi jumlah yang sudah
        masuk pesanan vendor yang belum dibatalkan.
      </p>
    </>
  );
}
