import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffProfile } from "@/lib/auth/server";
import { canAccessPath } from "@/lib/auth/roles";
import {
  issueClaimToken,
  revokeClaimToken,
  updateBeneficiary,
} from "@/lib/actions/beneficiary";
import { cancelEntitlement } from "@/lib/actions/entitlement";
import {
  BENEFICIARY_CATEGORIES,
  BENEFICIARY_CATEGORY_LABELS,
  BENEFICIARY_ORIGINS,
  BENEFICIARY_ORIGIN_LABELS,
  BENEFICIARY_TYPES,
  BENEFICIARY_TYPE_LABELS,
  beneficiaryCategoryLabel,
  beneficiaryOriginLabel,
  beneficiaryTypeLabel,
  getBeneficiary,
} from "@/lib/domain/beneficiary";
import {
  defaultClaimExpiryInput,
  getClaimTokenHistory,
  getLiveClaimToken,
  isTokenExpired,
} from "@/lib/domain/claim-token";
import {
  entitlementStatusLabel,
  entitlementStatusTone,
  getEntitlements,
} from "@/lib/domain/entitlement";
import { getActiveEvent } from "@/lib/domain/event";
import { isUuid } from "@/lib/domain/ids";
import { getAreas } from "@/lib/domain/master";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatTimeRange,
} from "@/lib/format";
import { BeneficiaryForm } from "@/components/forms/beneficiary-form";
import {
  ClaimTokenForm,
  RevokeClaimTokenForm,
} from "@/components/forms/claim-token-form";
import { EntitlementCancelForm } from "@/components/forms/entitlement-cancel-form";
import type { Option } from "@/components/forms/options";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Section, TableShell } from "@/components/ui/section";
import { Badge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Kelola Penerima" };

const TYPE_OPTIONS: Option[] = BENEFICIARY_TYPES.map((value) => ({
  value,
  label: BENEFICIARY_TYPE_LABELS[value],
}));

const CATEGORY_OPTIONS: Option[] = BENEFICIARY_CATEGORIES.map((value) => ({
  value,
  label: BENEFICIARY_CATEGORY_LABELS[value],
}));

const ORIGIN_OPTIONS: Option[] = BENEFICIARY_ORIGINS.map((value) => ({
  value,
  label: BENEFICIARY_ORIGIN_LABELS[value],
}));

export default async function BeneficiaryDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const profile = await requireStaffProfile("/master/penerima");

  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const beneficiary = await getBeneficiary(id);

  if (!beneficiary) {
    notFound();
  }

  const event = await getActiveEvent();

  const [areas, liveToken, tokenHistory, entitlements] = await Promise.all([
    event ? getAreas(event.id) : Promise.resolve([]),
    getLiveClaimToken(beneficiary.id),
    getClaimTokenHistory(beneficiary.id),
    event
      ? getEntitlements(event.id, { beneficiaryId: beneficiary.id })
      : Promise.resolve([]),
  ]);

  // An inactive area stays on offer while this penerima still sits in it, so
  // saving the form does not silently move them somewhere else.
  const areaOptions: Option[] = areas
    .filter((area) => area.isActive || area.id === beneficiary.areaId)
    .map((area) => ({ value: area.id, label: `${area.code} · ${area.name}` }));

  const canOpenPickup = canAccessPath("/pengambilan", profile.role);
  const liveTokenExpired = liveToken ? isTokenExpired(liveToken) : false;

  return (
    <>
      <PageHeader
        title={beneficiary.name}
        description={`${beneficiary.code} · ${beneficiaryTypeLabel(
          beneficiary.beneficiaryType,
        )} · ${beneficiaryCategoryLabel(
          beneficiary.beneficiaryCategory,
        )} · ${beneficiaryOriginLabel(beneficiary.origin)} · ${formatNumber(
          beneficiary.quantity,
        )} porsi`}
        meta={
          <span className="flex flex-wrap items-center gap-3">
            {canOpenPickup ? (
              <Link
                href={`/pengambilan/penerima/${beneficiary.id}`}
                className="text-brand-600 underline-offset-2 hover:underline"
              >
                Buka di Pengambilan
              </Link>
            ) : null}
            <Link
              href="/master/penerima"
              className="text-brand-600 underline-offset-2 hover:underline"
            >
              ← Penerima
            </Link>
          </span>
        }
      />

      {beneficiary.isActive ? null : (
        <div className="mb-6">
          <Notice title="Penerima nonaktif">
            Baris ini tidak ikut saat hak konsumsi diterbitkan dan QR-nya tidak
            membuka apa pun. Aktifkan kembali di bawah bila memang masih dipakai.
          </Notice>
        </div>
      )}

      <Section
        title="QR klaim"
        description="Satu QR aktif per penerima. Menerbitkan yang baru mencabut yang lama."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Status sekarang</h3>
            {liveToken ? (
              <>
                <div className="mb-3">
                  <Badge tone={liveTokenExpired ? "warn" : "ok"}>
                    {liveTokenExpired ? "Kedaluwarsa" : "Aktif"}
                  </Badge>
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-ink-muted">Diterbitkan</dt>
                    <dd>{formatDateTime(liveToken.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">Berlaku sampai</dt>
                    <dd>{formatDateTime(liveToken.expiresAt)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-ink-muted">
                  Tautannya tidak bisa ditampilkan lagi: yang tersimpan hanya
                  hash-nya. Kalau QR-nya hilang, terbitkan ulang.
                </p>
              </>
            ) : (
              <Notice title="Belum ada QR aktif">
                Penerima ini belum bisa membuka daftar haknya sendiri. Terbitkan QR
                lewat formulir di samping.
              </Notice>
            )}
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold">
              {liveToken ? "Terbitkan ulang" : "Terbitkan QR"}
            </h3>
            <ClaimTokenForm
              action={issueClaimToken.bind(null, beneficiary.id)}
              hasLiveToken={Boolean(liveToken)}
              defaultExpiresAt={defaultClaimExpiryInput(event?.eventDate ?? null)}
            />
          </Card>
        </div>

        {liveToken ? (
          <div className="mt-4 max-w-xl">
            <Card>
              <h3 className="mb-3 text-sm font-semibold">Cabut tanpa mengganti</h3>
              <p className="mb-3 text-xs text-ink-muted">
                Dipakai saat QR bocor atau salah cetak. Setelah dicabut, penerima
                tidak bisa membuka apa pun sampai QR baru diterbitkan.
              </p>
              <RevokeClaimTokenForm
                action={revokeClaimToken.bind(null, beneficiary.id)}
              />
            </Card>
          </div>
        ) : null}

        {tokenHistory.length > 0 ? (
          <div className="mt-4">
            <TableShell
              caption={`Riwayat QR klaim ${beneficiary.name}`}
              minWidth="44rem"
              head={
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Diterbitkan
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Berlaku sampai
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Dicabut
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Alasan
                  </th>
                </tr>
              }
            >
              {tokenHistory.map((token) => (
                <tr key={token.id} className="border-t border-line">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {formatDateTime(token.createdAt)}
                  </th>
                  <td className="px-3 py-2">{formatDateTime(token.expiresAt)}</td>
                  <td className="px-3 py-2">
                    {token.revokedAt ? (
                      formatDateTime(token.revokedAt)
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {token.revocationReason ?? "—"}
                  </td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : null}
      </Section>

      <Section
        title="Hak konsumsi"
        description="Apa saja yang boleh diambil penerima ini, per slot."
      >
        {entitlements.length === 0 ? (
          <Notice title="Belum ada hak konsumsi">
            Hak diterbitkan per slot lewat generator di halaman slot, bukan satu per
            satu dari sini.
          </Notice>
        ) : (
          <ul className="flex flex-col gap-3">
            {entitlements.map((entitlement) => {
              const isCancelled = entitlement.status === "CANCELLED";
              const isCancellable = !isCancelled && entitlement.pickedQuantity === 0;

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
                        {entitlement.slotName} · {entitlement.slotCode} ·{" "}
                        {formatDate(entitlement.slotDate)} ·{" "}
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
                      <dd className="numeric text-sm text-ink">
                        {formatNumber(entitlement.remainingQuantity)}
                      </dd>
                    </div>
                    <div>
                      <dt>Batas ambil</dt>
                      <dd className="text-sm text-ink">
                        {formatDateTime(
                          entitlement.expiresAt ?? entitlement.pickupDeadline,
                        )}
                      </dd>
                    </div>
                  </dl>

                  {isCancellable ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-alert">
                        Batalkan hak ini
                      </summary>
                      <div className="mt-3 max-w-md">
                        <EntitlementCancelForm
                          action={cancelEntitlement.bind(null, entitlement.id)}
                        />
                      </div>
                    </details>
                  ) : (
                    <p className="mt-3 text-xs text-ink-muted">
                      {isCancelled
                        ? "Sudah dibatalkan. Barisnya tetap disimpan sebagai jejak koreksi."
                        : "Sudah diambil sebagian, jadi tidak bisa dibatalkan. Balikkan pengambilannya lebih dulu."}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Ubah penerima">
        <div className="max-w-3xl">
          <Card>
            <BeneficiaryForm
              action={updateBeneficiary.bind(null, beneficiary.id)}
              types={TYPE_OPTIONS}
              categories={CATEGORY_OPTIONS}
              origins={ORIGIN_OPTIONS}
              areas={areaOptions}
              submitLabel="Simpan perubahan"
              values={{
                code: beneficiary.code,
                name: beneficiary.name,
                beneficiaryType: beneficiary.beneficiaryType,
                beneficiaryCategory: beneficiary.beneficiaryCategory,
                quantity: beneficiary.quantity,
                origin: beneficiary.origin,
                areaId: beneficiary.areaId,
                picHbd: beneficiary.picHbd,
                employeeGroup: beneficiary.employeeGroup,
                sourceReference: beneficiary.sourceReference,
                isActive: beneficiary.isActive,
              }}
            />
          </Card>
        </div>
      </Section>
    </>
  );
}
