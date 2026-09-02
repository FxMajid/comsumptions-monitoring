import type { Metadata } from "next";
import Link from "next/link";
import { requireStaffProfile } from "@/lib/auth/server";
import { createBeneficiary, issueClaimTokens } from "@/lib/actions/beneficiary";
import {
  BENEFICIARY_CATEGORIES,
  BENEFICIARY_CATEGORY_LABELS,
  BENEFICIARY_ORIGINS,
  BENEFICIARY_ORIGIN_LABELS,
  BENEFICIARY_PAGE_SIZE,
  BENEFICIARY_TYPES,
  BENEFICIARY_TYPE_LABELS,
  beneficiaryCategoryLabel,
  beneficiaryTypeLabel,
  getBeneficiaries,
  getBeneficiaryTotals,
} from "@/lib/domain/beneficiary";
import {
  defaultClaimExpiryInput,
  getLiveClaimTokens,
  isTokenExpired,
  type ClaimTokenRecord,
} from "@/lib/domain/claim-token";
import { getActiveEvent } from "@/lib/domain/event";
import { isUuid } from "@/lib/domain/ids";
import { getAreas } from "@/lib/domain/master";
import { formatDateTime, formatNumber } from "@/lib/format";
import { BeneficiaryForm } from "@/components/forms/beneficiary-form";
import { ClaimBulkForm } from "@/components/forms/claim-bulk-form";
import type { Option } from "@/components/forms/options";
import { SelectField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Section, TableShell } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Penerima" };

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

const CATEGORY_VALUES: ReadonlySet<string> = new Set(BENEFICIARY_CATEGORIES);

/** A penerima holds at most one live token, so the cell shows a single state. */
function ClaimStatus({ token }: Readonly<{ token: ClaimTokenRecord | undefined }>) {
  if (!token) {
    return <Badge tone="neutral">Belum ada</Badge>;
  }

  const expired = isTokenExpired(token);

  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone={expired ? "warn" : "ok"}>
        {expired ? "Kedaluwarsa" : "Aktif"}
      </Badge>
      <span className="text-xs text-ink-muted">
        {formatDateTime(token.expiresAt)}
      </span>
    </span>
  );
}

export default async function BeneficiaryListPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ cari?: string; kategori?: string; area?: string }>;
}>) {
  await requireStaffProfile("/master/penerima");

  const { cari, kategori, area } = await searchParams;
  const event = await getActiveEvent();

  if (!event) {
    return (
      <>
        <PageHeader
          title="Penerima"
          description="Daftar penerima konsumsi beserta QR klaimnya."
        />
        <Notice title="Belum ada event">
          Penerima terikat pada satu event. Tambahkan baris di tabel{" "}
          <code>events</code> lebih dulu.
        </Notice>
      </>
    );
  }

  // Filters arrive from the query string, so each one is narrowed before it
  // reaches a query: an unknown kategori or a malformed area id is dropped
  // rather than handed to Postgres.
  const search = cari?.trim() ?? "";
  const category = kategori && CATEGORY_VALUES.has(kategori) ? kategori : "";
  const areaId = isUuid(area) ? area : "";
  const isFiltered = search !== "" || category !== "" || areaId !== "";

  const [beneficiaries, totals, areas, liveTokens] = await Promise.all([
    getBeneficiaries(event.id, { search, category, areaId }),
    getBeneficiaryTotals(event.id),
    getAreas(event.id),
    getLiveClaimTokens(event.id),
  ]);

  const tokenByBeneficiary = new Map(
    liveTokens.map((token) => [token.beneficiaryId, token]),
  );
  const activeTokenCount = liveTokens.filter(
    (token) => !isTokenExpired(token),
  ).length;

  const areaNameById = new Map(areas.map((row) => [row.id, row.name]));
  const areaOptions: Option[] = areas.map((row) => ({
    value: row.id,
    label: `${row.code} · ${row.name}`,
  }));
  const activeAreaOptions: Option[] = areas
    .filter((row) => row.isActive)
    .map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` }));

  const isCapped = beneficiaries.length === BENEFICIARY_PAGE_SIZE;

  return (
    <>
      <PageHeader
        title="Penerima"
        description="Siapa yang berhak menerima konsumsi, dan QR klaim yang mereka bawa."
        meta={
          <Link
            href="/master"
            className="text-brand-600 underline-offset-2 hover:underline"
          >
            ← Data Master
          </Link>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Baris penerima" value={formatNumber(totals.rows)} />
        <StatCard
          label="Penerima aktif"
          value={formatNumber(totals.activeRows)}
          hint="Hanya yang aktif ikut saat hak konsumsi diterbitkan"
        />
        <StatCard
          label="Total porsi"
          value={formatNumber(totals.portions)}
          hint="Grup dihitung sebanyak porsinya"
        />
        <StatCard
          label="QR aktif"
          value={formatNumber(activeTokenCount)}
          tone={activeTokenCount === 0 ? "warn" : "ok"}
          hint="Token belum dicabut dan belum kedaluwarsa"
        />
      </div>

      <Section
        title="Daftar penerima"
        description={`Ditampilkan paling banyak ${formatNumber(
          BENEFICIARY_PAGE_SIZE,
        )} baris sekaligus.`}
      >
        <div className="mb-4">
          <Card>
            <form
              method="get"
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <TextField
                name="cari"
                label="Cari"
                defaultValue={search}
                placeholder="Nama atau kode penerima"
                autoComplete="off"
              />
              <SelectField name="kategori" label="Kategori" defaultValue={category}>
                <option value="">— Semua kategori —</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
              <SelectField name="area" label="Area" defaultValue={areaId}>
                <option value="">— Semua area —</option>
                {areaOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  Terapkan
                </button>
                {isFiltered ? (
                  <Link
                    href="/master/penerima"
                    className="inline-flex items-center justify-center rounded-md border border-line bg-surface-raised px-3 py-2 text-sm font-semibold transition hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    Reset
                  </Link>
                ) : null}
              </div>
            </form>
          </Card>
        </div>

        {beneficiaries.length === 0 ? (
          <Notice title={isFiltered ? "Tidak ada yang cocok" : "Belum ada penerima"}>
            {isFiltered
              ? "Ubah kata kunci atau saringannya."
              : "Tambahkan penerima lewat formulir di bawah sebelum menerbitkan hak konsumsi."}
          </Notice>
        ) : (
          <TableShell
            caption={`Penerima konsumsi untuk ${event.name}`}
            minWidth="64rem"
            head={
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Penerima
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Jenis
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Kategori
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Porsi
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Area
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  QR klaim
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
            {beneficiaries.map((beneficiary) => (
              <tr key={beneficiary.id} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <Link
                    href={`/master/penerima/${beneficiary.id}`}
                    className="font-medium text-brand-600 underline-offset-2 hover:underline"
                  >
                    {beneficiary.name}
                  </Link>
                  <span className="ml-2 text-xs text-ink-muted">
                    {beneficiary.code}
                  </span>
                </th>
                <td className="px-3 py-2">
                  {beneficiaryTypeLabel(beneficiary.beneficiaryType)}
                </td>
                <td className="px-3 py-2">
                  {beneficiaryCategoryLabel(beneficiary.beneficiaryCategory)}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {formatNumber(beneficiary.quantity)}
                </td>
                <td className="px-3 py-2">
                  {beneficiary.areaId
                    ? (areaNameById.get(beneficiary.areaId) ?? "—")
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <ClaimStatus token={tokenByBeneficiary.get(beneficiary.id)} />
                </td>
                <td className="px-3 py-2">
                  {beneficiary.isActive ? (
                    "Aktif"
                  ) : (
                    <span className="text-ink-muted">Nonaktif</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/master/penerima/${beneficiary.id}`}
                    className="text-brand-600 underline-offset-2 hover:underline"
                  >
                    Kelola
                  </Link>
                </td>
              </tr>
            ))}
          </TableShell>
        )}

        {isCapped ? (
          <p className="mt-3 text-xs text-warn">
            Daftar terpotong pada {formatNumber(BENEFICIARY_PAGE_SIZE)} baris.
            Persempit dengan kata kunci, kategori, atau area.
          </p>
        ) : null}
      </Section>

      <Section
        title="Terbitkan QR massal"
        description="Hanya mengisi yang belum punya QR aktif; yang sudah dipegang penerima tidak diganggu."
      >
        <div className="max-w-3xl">
          <Card>
            <ClaimBulkForm
              action={issueClaimTokens}
              categories={CATEGORY_OPTIONS}
              areas={areaOptions}
              defaultExpiresAt={defaultClaimExpiryInput(event.eventDate)}
            />
          </Card>
          <p className="mt-3 text-xs text-ink-muted">
            Tautan hanya tampil sekali karena yang disimpan cuma hash-nya. Salin
            atau cetak sebelum menutup halaman; yang hilang harus diterbitkan ulang.
          </p>
        </div>
      </Section>

      <Section title="Tambah penerima">
        <div className="max-w-3xl">
          <Card>
            <BeneficiaryForm
              action={createBeneficiary}
              types={TYPE_OPTIONS}
              categories={CATEGORY_OPTIONS}
              origins={ORIGIN_OPTIONS}
              areas={activeAreaOptions}
              submitLabel="Tambah penerima"
            />
          </Card>
        </div>
      </Section>
    </>
  );
}
