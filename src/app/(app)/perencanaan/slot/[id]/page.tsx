import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffProfile } from "@/lib/auth/server";
import {
  changeSlotStatus,
  createPlan,
  updateSlot,
} from "@/lib/actions/planning";
import { generateEntitlements } from "@/lib/actions/entitlement";
import {
  BENEFICIARY_CATEGORIES,
  BENEFICIARY_CATEGORY_LABELS,
  BENEFICIARY_TYPES,
  BENEFICIARY_TYPE_LABELS,
} from "@/lib/domain/beneficiary";
import { isUuid } from "@/lib/domain/ids";
import { getActiveEvent } from "@/lib/domain/event";
import { getAreas, getConsumptionItems } from "@/lib/domain/master";
import { getPlanCoverageForSlot, getSlotOverview } from "@/lib/domain/planning";
import { offeredTransitions } from "@/lib/domain/status";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRupiah,
  formatTimeRange,
  toDateTimeInputValue,
} from "@/lib/format";
import { EntitlementGeneratorForm } from "@/components/forms/entitlement-generator-form";
import { PlanForm } from "@/components/forms/plan-form";
import { SlotForm } from "@/components/forms/slot-form";
import { StatusActions } from "@/components/forms/status-actions";
import type { Option } from "@/components/forms/options";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Section, TableShell } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Slot Konsumsi" };

const CATEGORY_OPTIONS: Option[] = BENEFICIARY_CATEGORIES.map((value) => ({
  value,
  label: BENEFICIARY_CATEGORY_LABELS[value],
}));

const BENEFICIARY_TYPE_OPTIONS: Option[] = BENEFICIARY_TYPES.map((value) => ({
  value,
  label: BENEFICIARY_TYPE_LABELS[value],
}));

export default async function SlotDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await requireStaffProfile("/perencanaan");

  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const slot = await getSlotOverview(id);

  if (!slot) {
    notFound();
  }

  const event = await getActiveEvent();

  const [plans, items, areas] = await Promise.all([
    getPlanCoverageForSlot(slot.id),
    event ? getConsumptionItems(event.id) : Promise.resolve([]),
    event ? getAreas(event.id) : Promise.resolve([]),
  ]);

  const plannedItemIds = new Set(plans.map((plan) => plan.itemId));

  // One plan per item per slot is a unique constraint, so an item that already
  // has a row here is offered as disabled rather than silently failing on submit.
  const itemOptions: Option[] = items
    .filter((item) => item.isActive || plannedItemIds.has(item.id))
    .map((item) => ({
      value: item.id,
      label: plannedItemIds.has(item.id)
        ? `${item.code} · ${item.name} — sudah ada rencana`
        : `${item.code} · ${item.name} (${item.unitOfMeasure})`,
      disabled: plannedItemIds.has(item.id),
    }));

  const openItemCount = itemOptions.filter((option) => !option.disabled).length;

  // The generator picks one item at a time, and an item already planned here is
  // exactly the normal case — so unlike the plan form, nothing is disabled.
  const activeItemOptions: Option[] = items
    .filter((item) => item.isActive)
    .map((item) => ({
      value: item.id,
      label: `${item.code} · ${item.name} (${item.unitOfMeasure})`,
    }));

  const activeAreaOptions: Option[] = areas
    .filter((area) => area.isActive)
    .map((area) => ({ value: area.id, label: `${area.code} · ${area.name}` }));

  return (
    <>
      <PageHeader
        title={slot.name}
        description={`${slot.code} · ${formatDate(slot.slotDate)} · ${formatTimeRange(
          slot.startsAt,
          slot.endsAt,
        )}`}
        meta={
          <Link
            href="/perencanaan"
            className="text-brand-600 underline-offset-2 hover:underline"
          >
            ← Perencanaan
          </Link>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Item direncanakan"
          value={formatNumber(slot.planCount)}
        />
        <StatCard
          label="Total porsi rencana"
          value={formatNumber(slot.plannedQuantity)}
        />
        <StatCard
          label="Hak konsumsi terbit"
          value={formatNumber(slot.entitlementQuantity)}
          hint="Baris entitlement yang sudah dibuat untuk slot ini"
        />
        <StatCard
          label="Batas pengambilan"
          value={formatDateTime(slot.pickupDeadline)}
        />
      </div>

      <Section title="Status slot">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-muted">Sekarang:</span>
            <StatusBadge entity="consumption_slots" status={slot.status} />
          </div>
          <div className="mt-3">
            <StatusActions
              action={changeSlotStatus.bind(null, slot.id)}
              from={slot.status}
              transitions={offeredTransitions("consumption_slots", slot.status)}
            />
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Urutan status dijaga oleh trigger di database, jadi lompatan yang
            tidak wajar ditolak walau permintaannya dikirim langsung ke API.
          </p>
        </Card>
      </Section>

      <Section
        title="Rencana pada slot ini"
        description="Jumlah per item dan berapa yang sudah masuk pesanan vendor."
      >
        {plans.length === 0 ? (
          <Notice title="Belum ada rencana untuk slot ini">
            Tambahkan item beserta jumlahnya lewat formulir di bawah.
          </Notice>
        ) : (
          <TableShell
            caption={`Rencana konsumsi pada slot ${slot.name}`}
            minWidth="56rem"
            head={
              <tr>
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
                  Dikirim
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
                  <Link
                    href={`/perencanaan/rencana/${plan.id}`}
                    className="font-medium text-brand-600 underline-offset-2 hover:underline"
                  >
                    {plan.itemName}
                  </Link>
                  <span className="ml-2 text-xs text-ink-muted">
                    {plan.itemCode} · {plan.unitOfMeasure}
                  </span>
                </th>
                <td className="numeric px-3 py-2 text-right">
                  {formatNumber(plan.plannedQuantity)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatNumber(plan.requestedQuantity)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatNumber(plan.sentQuantity)}
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
          {openItemCount === 0 ? (
            <Notice title="Semua item sudah punya rencana di slot ini">
              Ubah jumlahnya lewat halaman rencana, atau tambahkan item baru di{" "}
              <Link
                href="/master"
                className="text-brand-600 underline-offset-2 hover:underline"
              >
                Data Master
              </Link>
              .
            </Notice>
          ) : (
            <Card>
              <h3 className="mb-3 text-sm font-semibold">
                Tambah rencana untuk slot ini
              </h3>
              <PlanForm
                action={createPlan}
                items={itemOptions}
                slots={[]}
                lockedSlotId={slot.id}
                submitLabel="Tambah rencana"
              />
            </Card>
          )}
        </div>
      </Section>

      <Section
        title="Terbitkan hak konsumsi"
        description="Membuat baris hak per penerima untuk satu item pada slot ini."
      >
        <div className="max-w-3xl">
          {activeItemOptions.length === 0 ? (
            <Notice title="Belum ada item aktif">
              Hak konsumsi terbit per item, jadi tambahkan item lebih dulu di{" "}
              <Link
                href="/master"
                className="text-brand-600 underline-offset-2 hover:underline"
              >
                Data Master
              </Link>
              .
            </Notice>
          ) : (
            <Card>
              <EntitlementGeneratorForm
                action={generateEntitlements.bind(null, slot.id)}
                items={activeItemOptions}
                categories={CATEGORY_OPTIONS}
                types={BENEFICIARY_TYPE_OPTIONS}
                areas={activeAreaOptions}
              />
              <p className="mt-4 text-xs text-ink-muted">
                Jumlah hak diambil dari kolom porsi tiap penerima, bukan dari
                rencana slot. Aman dijalankan ulang setelah penerima baru masuk:
                yang sudah punya hak dilewati, tidak digandakan.{" "}
                <Link
                  href="/master/penerima"
                  className="text-brand-600 underline-offset-2 hover:underline"
                >
                  Lihat daftar penerima
                </Link>
                .
              </p>
            </Card>
          )}
        </div>
      </Section>

      <Section title="Ubah slot">
        <div className="max-w-3xl">
          <Card>
            <SlotForm
              action={updateSlot.bind(null, slot.id)}
              submitLabel="Simpan perubahan"
              values={{
                code: slot.code,
                name: slot.name,
                slotDate: slot.slotDate,
                relativeDayOffset: slot.relativeDayOffset,
                startsAt: slot.startsAt,
                endsAt: slot.endsAt,
                pickupDeadline: toDateTimeInputValue(slot.pickupDeadline),
              }}
            />
          </Card>
        </div>
      </Section>
    </>
  );
}
