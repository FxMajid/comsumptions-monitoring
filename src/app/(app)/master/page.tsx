import type { Metadata } from "next";
import Link from "next/link";
import { requireStaffProfile } from "@/lib/auth/server";
import { createArea, createConsumptionItem } from "@/lib/actions/master";
import { createInventoryLocation } from "@/lib/actions/location";
import { getBeneficiaryTotals } from "@/lib/domain/beneficiary";
import { getActiveEvent } from "@/lib/domain/event";
import {
  LOCATION_TYPES,
  LOCATION_TYPE_LABELS,
  getInventoryLocations,
  locationTypeLabel,
} from "@/lib/domain/location";
import {
  AREA_TYPES,
  AREA_TYPE_LABELS,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  areaTypeLabel,
  getAreas,
  getConsumptionItems,
  itemTypeLabel,
} from "@/lib/domain/master";
import { formatNumber } from "@/lib/format";
import { AreaForm } from "@/components/forms/area-form";
import { ItemForm } from "@/components/forms/item-form";
import { LocationForm } from "@/components/forms/location-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Section, TableShell } from "@/components/ui/section";

export const metadata: Metadata = { title: "Data Master" };

const ITEM_TYPE_OPTIONS = ITEM_TYPES.map((value) => ({
  value,
  label: ITEM_TYPE_LABELS[value],
}));

const AREA_TYPE_OPTIONS = AREA_TYPES.map((value) => ({
  value,
  label: AREA_TYPE_LABELS[value],
}));

const LOCATION_TYPE_OPTIONS = LOCATION_TYPES.map((value) => ({
  value,
  label: LOCATION_TYPE_LABELS[value],
}));

export default async function MasterPage() {
  await requireStaffProfile("/master");

  const event = await getActiveEvent();

  if (!event) {
    return (
      <>
        <PageHeader
          title="Data Master"
          description="Item konsumsi dan area penerima."
        />
        <Notice title="Belum ada event">
          Semua data master terikat pada satu event. Tambahkan baris di tabel{" "}
          <code>events</code> lebih dulu.
        </Notice>
      </>
    );
  }

  const [items, areas, locations, beneficiaryTotals] = await Promise.all([
    getConsumptionItems(event.id),
    getAreas(event.id),
    getInventoryLocations(event.id),
    getBeneficiaryTotals(event.id),
  ]);

  const areaNameById = new Map(areas.map((area) => [area.id, area.name]));
  const activeAreaOptions = areas
    .filter((area) => area.isActive)
    .map((area) => ({ value: area.id, label: `${area.code} · ${area.name}` }));

  return (
    <>
      <PageHeader
        title="Data Master"
        description="Item konsumsi, area, lokasi stok, dan penerima untuk event ini."
        meta={
          <span>
            {event.code ? `${event.code} · ` : ""}
            {event.name}
          </span>
        }
      />

      <Section
        title="Item konsumsi"
        description="Yang dibagikan: nasi box, snack, air mineral, voucher."
      >
        {items.length === 0 ? (
          <Notice title="Belum ada item">
            Tambahkan item lewat formulir di bawah sebelum menyusun jadwal.
          </Notice>
        ) : (
          <TableShell
            caption={`Item konsumsi untuk ${event.name}`}
            minWidth="36rem"
            head={
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Item
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Jenis
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Satuan
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Aksi
                </th>
              </tr>
            }
          >
            {items.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="font-medium">{item.name}</span>
                  <span className="ml-2 text-xs text-ink-muted">{item.code}</span>
                </th>
                <td className="px-3 py-2">
                  {itemTypeLabel(item.itemType)}
                </td>
                <td className="px-3 py-2">{item.unitOfMeasure}</td>
                <td className="px-3 py-2">
                  {item.isActive ? (
                    "Aktif"
                  ) : (
                    <span className="text-ink-muted">Nonaktif</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/master/item/${item.id}`}
                    className="text-brand-600 underline-offset-2 hover:underline"
                  >
                    Ubah
                  </Link>
                </td>
              </tr>
            ))}
          </TableShell>
        )}

        <div className="mt-4">
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Tambah item</h3>
            <ItemForm
              action={createConsumptionItem}
              itemTypes={ITEM_TYPE_OPTIONS}
              submitLabel="Tambah item"
            />
          </Card>
        </div>
      </Section>

      <Section
        title="Area"
        description="Pusat, area lapangan, dan titik pengambilan."
      >
        {areas.length === 0 ? (
          <Notice title="Belum ada area">
            Area dipakai untuk mengelompokkan penerima dan titik pengambilan.
          </Notice>
        ) : (
          <TableShell
            caption={`Area untuk ${event.name}`}
            minWidth="32rem"
            head={
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Area
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Jenis
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Aksi
                </th>
              </tr>
            }
          >
            {areas.map((area) => (
              <tr key={area.id} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="font-medium">{area.name}</span>
                  <span className="ml-2 text-xs text-ink-muted">{area.code}</span>
                </th>
                <td className="px-3 py-2">
                  {areaTypeLabel(area.areaType)}
                </td>
                <td className="px-3 py-2">
                  {area.isActive ? (
                    "Aktif"
                  ) : (
                    <span className="text-ink-muted">Nonaktif</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/master/area/${area.id}`}
                    className="text-brand-600 underline-offset-2 hover:underline"
                  >
                    Ubah
                  </Link>
                </td>
              </tr>
            ))}
          </TableShell>
        )}

        <div className="mt-4">
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Tambah area</h3>
            <AreaForm
              action={createArea}
              areaTypes={AREA_TYPE_OPTIONS}
              submitLabel="Tambah area"
            />
          </Card>
        </div>
      </Section>

      <Section
        title="Lokasi stok"
        description="Tempat stok berpindah: gudang pusat, pos area, titik ambil."
      >
        {locations.length === 0 ? (
          <Notice title="Belum ada lokasi">
            Setiap pengambilan mencatat stok keluar dari sebuah lokasi, jadi minimal
            satu lokasi harus ada sebelum pengambilan dibuka.
          </Notice>
        ) : (
          <TableShell
            caption={`Lokasi stok untuk ${event.name}`}
            minWidth="36rem"
            head={
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Lokasi
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Jenis
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Area
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Aksi
                </th>
              </tr>
            }
          >
            {locations.map((location) => (
              <tr key={location.id} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="font-medium">{location.name}</span>
                  <span className="ml-2 text-xs text-ink-muted">
                    {location.code}
                  </span>
                </th>
                <td className="px-3 py-2">
                  {locationTypeLabel(location.locationType)}
                </td>
                <td className="px-3 py-2">
                  {location.areaId ? (
                    (areaNameById.get(location.areaId) ?? "—")
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {location.isActive ? (
                    "Aktif"
                  ) : (
                    <span className="text-ink-muted">Nonaktif</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/master/lokasi/${location.id}`}
                    className="text-brand-600 underline-offset-2 hover:underline"
                  >
                    Ubah
                  </Link>
                </td>
              </tr>
            ))}
          </TableShell>
        )}

        <div className="mt-4">
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Tambah lokasi</h3>
            <LocationForm
              action={createInventoryLocation}
              locationTypes={LOCATION_TYPE_OPTIONS}
              areas={activeAreaOptions}
              submitLabel="Tambah lokasi"
            />
          </Card>
        </div>
      </Section>

      <Section
        title="Penerima"
        description="Daftarnya panjang dan punya filter sendiri, jadi terpisah dari halaman ini."
      >
        <Card>
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt className="text-xs text-ink-muted">Baris penerima</dt>
              <dd className="numeric text-lg font-semibold">
                {formatNumber(beneficiaryTotals.rows)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Aktif</dt>
              <dd className="numeric text-lg font-semibold">
                {formatNumber(beneficiaryTotals.activeRows)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Total porsi</dt>
              <dd className="numeric text-lg font-semibold">
                {formatNumber(beneficiaryTotals.portions)}
              </dd>
            </div>
          </dl>
          <p className="mt-4">
            <Link
              href="/master/penerima"
              className="text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
            >
              Kelola penerima & QR klaim →
            </Link>
          </p>
        </Card>
      </Section>

      <p className="text-xs text-ink-muted">
        Baris master tidak dihapus karena rencana dan pesanan menunjuk ke sini.
        Nonaktifkan saja agar tidak lagi ditawarkan.
      </p>
    </>
  );
}
