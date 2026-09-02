import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffProfile } from "@/lib/auth/server";
import { changePlanStatus, updatePlan } from "@/lib/actions/planning";
import { getActiveEvent } from "@/lib/domain/event";
import { isUuid } from "@/lib/domain/ids";
import { getConsumptionItems } from "@/lib/domain/master";
import { getPlanCoverageById, getSlotOverviews } from "@/lib/domain/planning";
import { offeredTransitions } from "@/lib/domain/status";
import { formatDate, formatNumber, formatRupiah } from "@/lib/format";
import { PlanForm } from "@/components/forms/plan-form";
import { StatusActions } from "@/components/forms/status-actions";
import type { Option } from "@/components/forms/options";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Section } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Rencana Konsumsi" };

export default async function PlanDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await requireStaffProfile("/perencanaan");

  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const plan = await getPlanCoverageById(id);

  if (!plan) {
    notFound();
  }

  const event = await getActiveEvent();

  const [items, slots] = await Promise.all([
    event ? getConsumptionItems(event.id) : Promise.resolve([]),
    event ? getSlotOverviews(event.id) : Promise.resolve([]),
  ]);

  const itemOptions: Option[] = items
    .filter((item) => item.isActive || item.id === plan.itemId)
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
        title={`${plan.itemName} · ${plan.slotName}`}
        description={`${plan.itemCode} pada ${formatDate(plan.slotDate)}`}
        meta={
          <div className="flex flex-wrap gap-3">
            <Link
              href="/perencanaan"
              className="text-brand-600 underline-offset-2 hover:underline"
            >
              ← Perencanaan
            </Link>
            <Link
              href={`/perencanaan/slot/${plan.slotId}`}
              className="text-brand-600 underline-offset-2 hover:underline"
            >
              Slot {plan.slotCode}
            </Link>
          </div>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Rencana (${plan.unitOfMeasure})`}
          value={formatNumber(plan.plannedQuantity)}
        />
        <StatCard
          label="Sudah dipesan"
          value={formatNumber(plan.requestedQuantity)}
          hint="Total baris pesanan vendor yang aktif"
        />
        <StatCard
          label="Sudah diterima"
          value={formatNumber(plan.receivedQuantity)}
          tone={plan.receivedQuantity > 0 ? "ok" : "neutral"}
        />
        <StatCard
          label="Belum dipesan"
          value={formatNumber(plan.unorderedQuantity)}
          tone={plan.unorderedQuantity > 0 ? "warn" : "ok"}
        />
      </div>

      <Section title="Status rencana">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-muted">Sekarang:</span>
            <StatusBadge entity="consumption_plans" status={plan.status} />
            <span className="text-sm text-ink-muted">
              Slot: <StatusBadge entity="consumption_slots" status={plan.slotStatus} />
            </span>
          </div>
          <div className="mt-3">
            <StatusActions
              action={changePlanStatus.bind(null, plan.id)}
              from={plan.status}
              transitions={offeredTransitions("consumption_plans", plan.status)}
            />
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Rencana yang dibatalkan tetap tersimpan dan bisa dikembalikan ke draf,
            karena baris pesanan lama masih menunjuk ke sini.
          </p>
        </Card>
      </Section>

      <Section
        title="Ubah rencana"
        description={`Nilai rencana sekarang ${formatRupiah(plan.plannedAmount)}.`}
      >
        <div className="max-w-3xl">
          <Card>
            <PlanForm
              action={updatePlan.bind(null, plan.id)}
              items={itemOptions}
              slots={slotOptions}
              submitLabel="Simpan perubahan"
              values={{
                itemId: plan.itemId,
                slotId: plan.slotId,
                plannedQuantity: plan.plannedQuantity,
                unitCost: plan.unitCost,
                notes: plan.notes,
              }}
            />
          </Card>
        </div>
      </Section>
    </>
  );
}
