import type { Metadata } from "next";
import Link from "next/link";
import { requireStaffProfile } from "@/lib/auth/server";
import { createVendor } from "@/lib/actions/master";
import { createRequest } from "@/lib/actions/requests";
import { getActiveEvent } from "@/lib/domain/event";
import { getVendors } from "@/lib/domain/master";
import { getRequestSummaries } from "@/lib/domain/requests";
import { formatDateTime, formatNumber, formatRupiah } from "@/lib/format";
import { RequestForm } from "@/components/forms/request-form";
import { VendorForm } from "@/components/forms/vendor-form";
import type { Option } from "@/components/forms/options";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Section, TableShell } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Vendor & Pesanan" };

export default async function VendorPage() {
  await requireStaffProfile("/vendor");

  const event = await getActiveEvent();

  if (!event) {
    return (
      <>
        <PageHeader
          title="Vendor & Pesanan"
          description="Daftar vendor dan pesanan konsumsi."
        />
        <Notice title="Belum ada event">
          Pesanan selalu terikat pada satu event. Tambahkan event lebih dulu.
        </Notice>
      </>
    );
  }

  const [vendors, requests] = await Promise.all([
    getVendors(event.id),
    getRequestSummaries(event.id),
  ]);

  const vendorOptions: Option[] = vendors.map((vendor) => ({
    value: vendor.id,
    label: vendor.isActive
      ? `${vendor.code} · ${vendor.name}`
      : `${vendor.code} · ${vendor.name} — nonaktif`,
    disabled: !vendor.isActive,
  }));

  const hasActiveVendor = vendorOptions.some((option) => !option.disabled);

  return (
    <>
      <PageHeader
        title="Vendor & Pesanan"
        description="Pesanan ke vendor, dari draf sampai barang diterima."
        meta={
          <span>
            {event.code ? `${event.code} · ` : ""}
            {event.name}
          </span>
        }
      />

      <Section
        title="Pesanan"
        description="Satu pesanan berisi beberapa baris; tiap baris menunjuk ke satu rencana konsumsi."
      >
        {requests.length === 0 ? (
          <Notice title="Belum ada pesanan">
            Buat pesanan kosong lebih dulu, lalu tambahkan barisnya di halaman
            pesanan.
          </Notice>
        ) : (
          <TableShell
            caption={`Pesanan konsumsi untuk ${event.name}`}
            minWidth="60rem"
            head={
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Vendor
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Dibuat
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Baris
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Dipesan
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Diterima
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Nilai pesanan
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Status
                </th>
              </tr>
            }
          >
            {requests.map((request) => (
              <tr key={request.id} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <Link
                    href={`/vendor/pesanan/${request.id}`}
                    className="font-medium text-brand-600 underline-offset-2 hover:underline"
                  >
                    {request.vendorName}
                  </Link>
                  <span className="ml-2 text-xs text-ink-muted">
                    {request.vendorCode}
                  </span>
                </th>
                <td className="px-3 py-2 text-xs">
                  {formatDateTime(request.requestedAt)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatNumber(request.itemCount)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatNumber(request.requestedQuantity)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatNumber(request.receivedQuantity)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatRupiah(request.requestedAmount)}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge
                    entity="consumption_requests"
                    status={request.status}
                  />
                </td>
              </tr>
            ))}
          </TableShell>
        )}

        <div className="mt-4 max-w-2xl">
          {hasActiveVendor ? (
            <Card>
              <h3 className="mb-3 text-sm font-semibold">Pesanan baru</h3>
              <RequestForm
                action={createRequest}
                vendors={vendorOptions}
                submitLabel="Buat pesanan"
              />
              <p className="mt-3 text-xs text-ink-muted">
                Pesanan dibuat sebagai draf dan langsung terbuka supaya barisnya
                bisa diisi.
              </p>
            </Card>
          ) : (
            <Notice title="Belum ada vendor aktif">
              Tambahkan vendor lewat formulir di bawah sebelum membuat pesanan.
            </Notice>
          )}
        </div>
      </Section>

      <Section
        title="Vendor"
        description="Vendor tanpa event dipakai bersama antar event."
      >
        {vendors.length === 0 ? (
          <Notice title="Belum ada vendor">
            Isi kode, nama, dan kontak vendor pada formulir di bawah.
          </Notice>
        ) : (
          <TableShell
            caption="Daftar vendor"
            minWidth="40rem"
            head={
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Vendor
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Kontak
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Telepon
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Status
                </th>
              </tr>
            }
          >
            {vendors.map((vendor) => (
              <tr key={vendor.id} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <Link
                    href={`/vendor/${vendor.id}`}
                    className="font-medium text-brand-600 underline-offset-2 hover:underline"
                  >
                    {vendor.name}
                  </Link>
                  <span className="ml-2 text-xs text-ink-muted">
                    {vendor.code}
                  </span>
                </th>
                <td className="px-3 py-2">{vendor.contactName ?? "—"}</td>
                <td className="numeric px-3 py-2">{vendor.phone ?? "—"}</td>
                <td className="px-3 py-2">
                  {vendor.isActive ? (
                    "Aktif"
                  ) : (
                    <span className="text-ink-muted">Nonaktif</span>
                  )}
                </td>
              </tr>
            ))}
          </TableShell>
        )}

        <div className="mt-4 max-w-3xl">
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Tambah vendor</h3>
            <VendorForm action={createVendor} submitLabel="Tambah vendor" />
          </Card>
        </div>
      </Section>
    </>
  );
}
