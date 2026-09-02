import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffProfile } from "@/lib/auth/server";
import {
  addRequestLine,
  changeRequestStatus,
  deleteRequestLine,
  updateRequest,
  updateRequestLine,
} from "@/lib/actions/requests";
import { getActiveEvent } from "@/lib/domain/event";
import { isUuid } from "@/lib/domain/ids";
import { getVendors } from "@/lib/domain/master";
import { getPlanCoverage } from "@/lib/domain/planning";
import { getRequestLines, getRequestSummary } from "@/lib/domain/requests";
import { isRequestOpen, offeredTransitions } from "@/lib/domain/status";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRupiah,
} from "@/lib/format";
import { RequestForm } from "@/components/forms/request-form";
import { RequestLineForm } from "@/components/forms/request-line-form";
import { RequestLineRow } from "@/components/forms/request-line-row";
import { StatusActions } from "@/components/forms/status-actions";
import type { Option } from "@/components/forms/options";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Section } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Pesanan Vendor" };

export default async function RequestDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await requireStaffProfile("/vendor");

  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const request = await getRequestSummary(id);

  if (!request) {
    notFound();
  }

  const event = await getActiveEvent();

  const [lines, plans, vendors] = await Promise.all([
    getRequestLines(request.id),
    event ? getPlanCoverage(event.id) : Promise.resolve([]),
    event ? getVendors(event.id) : Promise.resolve([]),
  ]);

  const editable = isRequestOpen(request.status);

  // (request, item, slot) is unique, so a plan already on this order cannot be
  // added a second time; it is shown disabled instead of failing on submit.
  const usedPlanIds = new Set(
    lines.map((line) => line.planId).filter((planId) => planId !== null),
  );

  const planOptions: Option[] = plans
    .filter((plan) => plan.status !== "CANCELLED")
    .map((plan) => ({
      value: plan.id,
      label: usedPlanIds.has(plan.id)
        ? `${plan.slotCode} · ${plan.itemName} — sudah ada di pesanan ini`
        : `${plan.slotCode} · ${plan.itemName} — belum dipesan ${formatNumber(
            plan.unorderedQuantity,
          )} ${plan.unitOfMeasure}`,
      disabled: usedPlanIds.has(plan.id),
    }));

  const openPlanCount = planOptions.filter((option) => !option.disabled).length;

  const vendorOptions: Option[] = vendors.map((vendor) => ({
    value: vendor.id,
    label: vendor.isActive
      ? `${vendor.code} · ${vendor.name}`
      : `${vendor.code} · ${vendor.name} — nonaktif`,
    disabled: !vendor.isActive && vendor.id !== request.vendorId,
  }));

  return (
    <>
      <PageHeader
        title={`Pesanan · ${request.vendorName}`}
        description={`Dibuat ${formatDateTime(request.requestedAt)}`}
        meta={
          <div className="flex flex-wrap gap-3">
            <Link
              href="/vendor"
              className="text-brand-600 underline-offset-2 hover:underline"
            >
              ← Vendor &amp; Pesanan
            </Link>
            <Link
              href={`/vendor/${request.vendorId}`}
              className="text-brand-600 underline-offset-2 hover:underline"
            >
              {request.vendorCode}
            </Link>
          </div>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Baris" value={formatNumber(request.itemCount)} />
        <StatCard
          label="Dipesan"
          value={formatNumber(request.requestedQuantity)}
          hint={`Dikirim ${formatNumber(request.sentQuantity)} · diterima ${formatNumber(
            request.receivedQuantity,
          )}`}
        />
        <StatCard
          label="Nilai pesanan"
          value={formatRupiah(request.requestedAmount)}
        />
        <StatCard
          label="Nilai diterima"
          value={formatRupiah(request.receivedAmount)}
          tone={request.receivedQuantity > 0 ? "ok" : "neutral"}
        />
      </div>

      <Section title="Status pesanan">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-muted">Sekarang:</span>
            <StatusBadge entity="consumption_requests" status={request.status} />
          </div>
          <div className="mt-3">
            <StatusActions
              action={changeRequestStatus.bind(null, request.id)}
              from={request.status}
              transitions={offeredTransitions(
                "consumption_requests",
                request.status,
              )}
            />
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            &ldquo;Diterima sebagian&rdquo; dan &ldquo;Diterima penuh&rdquo; tidak
            dipilih manual: keduanya mengikuti jumlah yang dicatat saat penerimaan
            barang.
          </p>
        </Card>
      </Section>

      <Section
        title="Baris pesanan"
        description="Tiap baris menunjuk ke satu rencana konsumsi, jadi item dan slotnya pasti sesuai."
      >
        {lines.length === 0 ? (
          <Notice title="Pesanan masih kosong">
            Tambahkan baris lewat formulir di bawah.
          </Notice>
        ) : (
          <ul className="flex flex-col gap-3">
            {lines.map((line) => (
              <RequestLineRow
                key={line.id}
                updateAction={updateRequestLine.bind(null, line.id)}
                deleteAction={deleteRequestLine.bind(null, line.id)}
                editable={editable}
                line={{
                  itemCode: line.itemCode,
                  itemName: line.itemName,
                  unitOfMeasure: line.unitOfMeasure,
                  slotLabel: line.slotName
                    ? `${line.slotName} · ${formatDate(line.slotDate)}`
                    : "Tanpa slot",
                  requestedQuantity: line.requestedQuantity,
                  sentQuantity: line.sentQuantity,
                  receivedQuantity: line.receivedQuantity,
                  unitPrice: line.unitPrice,
                  notes: line.notes,
                }}
              />
            ))}
          </ul>
        )}

        <div className="mt-4 max-w-3xl">
          {!editable ? (
            <Notice title="Pesanan terkunci">
              Pesanan yang sudah ditutup atau dibatalkan tidak bisa diubah isinya.
            </Notice>
          ) : openPlanCount === 0 ? (
            <Notice title="Tidak ada rencana yang bisa ditambahkan">
              Semua rencana sudah masuk pesanan ini. Tambahkan rencana baru di{" "}
              <Link
                href="/perencanaan"
                className="text-brand-600 underline-offset-2 hover:underline"
              >
                Perencanaan
              </Link>
              .
            </Notice>
          ) : (
            <Card>
              <h3 className="mb-3 text-sm font-semibold">Tambah baris</h3>
              <RequestLineForm
                action={addRequestLine.bind(null, request.id)}
                plans={planOptions}
              />
            </Card>
          )}
        </div>
      </Section>

      <Section title="Ubah pesanan">
        <div className="max-w-2xl">
          {editable ? (
            <Card>
              <RequestForm
                action={updateRequest.bind(null, request.id)}
                vendors={vendorOptions}
                submitLabel="Simpan perubahan"
                values={{ vendorId: request.vendorId, notes: request.notes }}
              />
            </Card>
          ) : (
            <Notice title="Vendor dan catatan terkunci">
              Ubah status pesanan lebih dulu bila datanya masih perlu diperbaiki.
            </Notice>
          )}
        </div>
      </Section>
    </>
  );
}
