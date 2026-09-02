import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffProfile } from "@/lib/auth/server";
import { updateInventoryLocation } from "@/lib/actions/location";
import { getActiveEvent } from "@/lib/domain/event";
import { isUuid } from "@/lib/domain/ids";
import {
  LOCATION_TYPES,
  LOCATION_TYPE_LABELS,
  getInventoryLocation,
} from "@/lib/domain/location";
import { getAreas } from "@/lib/domain/master";
import { LocationForm } from "@/components/forms/location-form";
import type { Option } from "@/components/forms/options";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/section";

export const metadata: Metadata = { title: "Ubah Lokasi" };

const LOCATION_TYPE_OPTIONS: Option[] = LOCATION_TYPES.map((value) => ({
  value,
  label: LOCATION_TYPE_LABELS[value],
}));

export default async function LocationDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await requireStaffProfile("/master");

  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const location = await getInventoryLocation(id);

  if (!location) {
    notFound();
  }

  const event = await getActiveEvent();
  const areas = event ? await getAreas(event.id) : [];

  // The area already attached stays selectable even after it is switched off, so
  // saving an unrelated change does not quietly detach the location from it.
  const areaOptions: Option[] = areas
    .filter((area) => area.isActive || area.id === location.areaId)
    .map((area) => ({ value: area.id, label: `${area.code} · ${area.name}` }));

  return (
    <>
      <PageHeader
        title={location.name}
        description="Ubah lokasi stok."
        meta={
          <Link
            href="/master"
            className="text-brand-600 underline-offset-2 hover:underline"
          >
            ← Data Master
          </Link>
        }
      />

      <div className="max-w-2xl">
        <Card>
          <LocationForm
            action={updateInventoryLocation.bind(null, location.id)}
            locationTypes={LOCATION_TYPE_OPTIONS}
            areas={areaOptions}
            submitLabel="Simpan perubahan"
            values={{
              code: location.code,
              name: location.name,
              locationType: location.locationType,
              areaId: location.areaId,
              isActive: location.isActive,
            }}
          />
        </Card>
      </div>

      <p className="mt-6 text-xs text-ink-muted">
        Lokasi tidak dihapus karena setiap baris ledger stok menunjuk ke sini.
        Nonaktifkan saja agar tidak lagi ditawarkan saat pengambilan.
      </p>
    </>
  );
}
