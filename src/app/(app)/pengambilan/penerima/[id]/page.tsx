import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffProfile } from "@/lib/auth/server";
import { canAccessPath } from "@/lib/auth/roles";
import { recordPickup } from "@/lib/actions/pickup";
import {
  beneficiaryCategoryLabel,
  beneficiaryTypeLabel,
  getBeneficiary,
} from "@/lib/domain/beneficiary";
import {
  entitlementStatusLabel,
  entitlementStatusTone,
  getEntitlements,
} from "@/lib/domain/entitlement";
import { getActiveEvent } from "@/lib/domain/event";
import { isUuid } from "@/lib/domain/ids";
import { getInventoryLocations, locationTypeLabel } from "@/lib/domain/location";
import { getAreas } from "@/lib/domain/master";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatTimeRange,
} from "@/lib/format";
import { PickupForm } from "@/components/forms/pickup-form";
import type { Option } from "@/components/forms/options";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Catat Pengambilan" };

/**
 * Reading the clock belongs outside the component: rendering has to stay pure,
 * and every screen here is per request anyway.
 */
function isPastDeadline(deadline: string | null): boolean {
  return deadline ? new Date(deadline).getTime() <= Date.now() : false;
}

export default async function PickupBeneficiaryPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const profile = await requireStaffProfile("/pengambilan");

  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const beneficiary = await getBeneficiary(id);

  if (!beneficiary) {
    notFound();
  }

  const event = await getActiveEvent();

  const [entitlements, locations, areas] = await Promise.all([
    event
      ? getEntitlements(event.id, { beneficiaryId: beneficiary.id })
      : Promise.resolve([]),
    event ? getInventoryLocations(event.id) : Promise.resolve([]),
    event ? getAreas(event.id) : Promise.resolve([]),
  ]);

  const areaName = beneficiary.areaId
    ? (areas.find((area) => area.id === beneficiary.areaId)?.name ?? null)
    : null;

  const activeLocations = locations.filter((location) => location.isActive);

  const locationOptions: Option[] = activeLocations.map((location) => ({
    value: location.id,
    label: `${location.name} · ${locationTypeLabel(location.locationType)}`,
  }));

  // A counter usually hands out from the post in its own area, so that one is
  // preselected when it exists. Anything else stays a deliberate choice.
  const defaultLocationId = (
    (beneficiary.areaId
      ? activeLocations.find(
          (location) => location.areaId === beneficiary.areaId,
        )
      : undefined) ?? activeLocations[0]
  )?.id;

  const openEntitlements = entitlements.filter(
    (entitlement) =>
      entitlement.status !== "CANCELLED" && entitlement.remainingQuantity > 0,
  );
  const totalRemaining = openEntitlements.reduce(
    (sum, entitlement) => sum + entitlement.remainingQuantity,
    0,
  );
  const totalPicked = entitlements.reduce(
    (sum, entitlement) => sum + entitlement.pickedQuantity,
    0,
  );

  const canOverride = profile.role === "ADMIN";
  const canOpenMaster = canAccessPath("/master", profile.role);

  return (
    <>
      <PageHeader
        title={beneficiary.name}
        description={`${beneficiary.code} · ${beneficiaryCategoryLabel(
          beneficiary.beneficiaryCategory,
        )} · ${beneficiaryTypeLabel(beneficiary.beneficiaryType)} · ${formatNumber(
          beneficiary.quantity,
        )} porsi${areaName ? ` · ${areaName}` : ""}`}
        meta={
          <span className="flex flex-wrap items-center gap-3">
            {canOpenMaster ? (
              <Link
                href={`/master/penerima/${beneficiary.id}`}
                className="text-brand-600 underline-offset-2 hover:underline"
              >
                Kelola penerima
              </Link>
            ) : null}
            <Link
              href="/pengambilan"
              className="text-brand-600 underline-offset-2 hover:underline"
            >
              ← Pengambilan
            </Link>
          </span>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Sisa hak"
          value={formatNumber(totalRemaining)}
          tone={totalRemaining > 0 ? "warn" : "ok"}
        />
        <StatCard label="Sudah diambil" value={formatNumber(totalPicked)} />
        <StatCard label="Baris hak" value={formatNumber(entitlements.length)} />
      </div>

      {beneficiary.isActive ? null : (
        <div className="mb-6">
          <Notice title="Penerima nonaktif">
            Baris ini sudah dinonaktifkan. Pastikan dulu ke koordinator sebelum
            menyerahkan apa pun.
          </Notice>
        </div>
      )}

      {activeLocations.length === 0 ? (
        <div className="mb-6">
          <Notice title="Belum ada lokasi stok aktif">
            Pengambilan mengurangi stok dari sebuah lokasi, jadi tanpa lokasi aktif
            formulirnya tidak bisa dikirim. Minta admin menambahkannya di Data
            Master.
          </Notice>
        </div>
      ) : null}

      <Section
        title="Hak konsumsi"
        description="Catat hanya yang benar-benar diserahkan. Jumlahnya boleh kurang dari sisa hak."
      >
        {entitlements.length === 0 ? (
          <Notice title="Belum ada hak konsumsi">
            Penerima ini belum diterbitkan haknya untuk slot mana pun, jadi tidak
            ada yang bisa diambil.
          </Notice>
        ) : (
          <ul className="flex flex-col gap-3">
            {entitlements.map((entitlement) => {
              const deadline = entitlement.expiresAt ?? entitlement.pickupDeadline;
              const isLate = isPastDeadline(deadline);
              const isCancelled = entitlement.status === "CANCELLED";
              const isOpen = !isCancelled && entitlement.remainingQuantity > 0;

              return (
                <li
                  key={entitlement.id}
                  className="rounded-lg border border-line bg-surface-raised p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {entitlement.itemName}{" "}
                        <span className="text-xs text-ink-muted">
                          {entitlement.itemCode}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {entitlement.slotName} · {formatDate(entitlement.slotDate)}{" "}
                        ·{" "}
                        {formatTimeRange(entitlement.startsAt, entitlement.endsAt)}
                      </p>
                    </div>
                    <Badge tone={entitlementStatusTone(entitlement.status)}>
                      {entitlementStatusLabel(entitlement.status)}
                    </Badge>
                  </div>

                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-muted">
                    <div>
                      <dt>Hak</dt>
                      <dd className="numeric text-sm text-ink">
                        {formatNumber(entitlement.quantity)}{" "}
                        {entitlement.unitOfMeasure}
                      </dd>
                    </div>
                    <div>
                      <dt>Diambil</dt>
                      <dd className="numeric text-sm text-ink">
                        {formatNumber(entitlement.pickedQuantity)}
                      </dd>
                    </div>
                    <div>
                      <dt>Sisa</dt>
                      <dd className="numeric text-sm font-semibold text-ink">
                        {formatNumber(entitlement.remainingQuantity)}
                      </dd>
                    </div>
                    <div>
                      <dt>Batas ambil</dt>
                      <dd
                        className={`text-sm ${
                          isLate ? "text-warn" : "text-ink"
                        }`}
                      >
                        {formatDateTime(deadline)}
                        {isLate ? " · lewat" : ""}
                      </dd>
                    </div>
                  </dl>

                  {isOpen ? (
                    <div className="mt-4 border-t border-line pt-4">
                      {isLate && !canOverride ? (
                        <p className="text-xs text-warn">
                          Batas pengambilannya sudah lewat. Hanya admin yang bisa
                          mencatat dengan penimpaan manual.
                        </p>
                      ) : null}
                      <PickupForm
                        action={recordPickup.bind(null, entitlement.id)}
                        locations={locationOptions}
                        remaining={entitlement.remainingQuantity}
                        unitOfMeasure={entitlement.unitOfMeasure}
                        canOverride={canOverride}
                        defaultLocationId={defaultLocationId}
                      />
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-ink-muted">
                      {isCancelled
                        ? "Hak ini dibatalkan, jadi tidak ada yang bisa diserahkan."
                        : "Sudah habis diambil. Koreksi lewat pembalikan, bukan pencatatan baru."}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
