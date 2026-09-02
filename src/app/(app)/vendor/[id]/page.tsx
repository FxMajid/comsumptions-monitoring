import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffProfile } from "@/lib/auth/server";
import { updateVendor } from "@/lib/actions/master";
import { isUuid } from "@/lib/domain/ids";
import { getVendor } from "@/lib/domain/master";
import { getRequestSummariesForVendor } from "@/lib/domain/requests";
import { formatDateTime, formatNumber, formatRupiah, toNumber } from "@/lib/format";
import { VendorForm } from "@/components/forms/vendor-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Section, TableShell } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Vendor" };

export default async function VendorDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await requireStaffProfile("/vendor");

  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const vendor = await getVendor(id);

  if (!vendor) {
    notFound();
  }

  const requests = await getRequestSummariesForVendor(vendor.id);

  const requestedAmount = requests.reduce(
    (total, request) => total + toNumber(request.requestedAmount),
    0,
  );
  const receivedAmount = requests.reduce(
    (total, request) => total + toNumber(request.receivedAmount),
    0,
  );

  return (
    <>
      <PageHeader
        title={vendor.name}
        description={`${vendor.code}${
          vendor.contactName ? ` · ${vendor.contactName}` : ""
        }${vendor.phone ? ` · ${vendor.phone}` : ""}`}
        meta={
          <Link
            href="/vendor"
            className="text-brand-600 underline-offset-2 hover:underline"
          >
            ← Vendor &amp; Pesanan
          </Link>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <StatCard label="Jumlah pesanan" value={formatNumber(requests.length)} />
        <StatCard
          label="Nilai dipesan"
          value={formatRupiah(requestedAmount)}
          hint="Semua pesanan yang belum dibatalkan"
        />
        <StatCard
          label="Nilai diterima"
          value={formatRupiah(receivedAmount)}
          hint="Dihitung dari jumlah yang benar-benar diterima"
        />
      </div>

      <Section title="Pesanan ke vendor ini">
        {requests.length === 0 ? (
          <Notice title="Belum ada pesanan">
            Buat pesanan dari halaman{" "}
            <Link
              href="/vendor"
              className="text-brand-600 underline-offset-2 hover:underline"
            >
              Vendor &amp; Pesanan
            </Link>
            .
          </Notice>
        ) : (
          <TableShell
            caption={`Pesanan ke ${vendor.name}`}
            minWidth="52rem"
            head={
              <tr>
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
                    className="text-brand-600 underline-offset-2 hover:underline"
                  >
                    {formatDateTime(request.requestedAt)}
                  </Link>
                </th>
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
      </Section>

      <Section title="Ubah vendor">
        <div className="max-w-3xl">
          <Card>
            <VendorForm
              action={updateVendor.bind(null, vendor.id)}
              submitLabel="Simpan perubahan"
              values={{
                code: vendor.code,
                name: vendor.name,
                contactName: vendor.contactName,
                phone: vendor.phone,
                notes: vendor.notes,
                isActive: vendor.isActive,
              }}
            />
          </Card>
          <p className="mt-4 text-xs text-ink-muted">
            Vendor nonaktif tidak lagi bisa dipilih pada pesanan baru, tetapi
            pesanan lama tetap utuh.
          </p>
        </div>
      </Section>
    </>
  );
}
