import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireStaffProfile } from "@/lib/auth/server";
import {
  beneficiaryCategoryLabel,
  beneficiaryTypeLabel,
  getBeneficiaries,
} from "@/lib/domain/beneficiary";
import { getEntitlementCounts } from "@/lib/domain/entitlement";
import { getActiveEvent } from "@/lib/domain/event";
import { getAreas } from "@/lib/domain/master";
import { formatNumber } from "@/lib/format";
import { TokenScanner } from "@/components/forms/token-scanner";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Section } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";

export const metadata: Metadata = { title: "Pengambilan" };

/** Short enough to stay one thumb-scroll on the phone the counter actually uses. */
const SEARCH_LIMIT = 25;

export default async function PickupPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ cari?: string }> }>) {
  await requireStaffProfile("/pengambilan");

  const { cari } = await searchParams;
  const search = cari?.trim() ?? "";

  const event = await getActiveEvent();

  if (!event) {
    return (
      <>
        <PageHeader
          title="Pengambilan"
          description="Pindai QR penerima lalu catat pengambilan."
        />
        <Notice title="Belum ada event">
          Pengambilan mengikuti event yang aktif. Tambahkan baris di tabel{" "}
          <code>events</code> lebih dulu.
        </Notice>
      </>
    );
  }

  const [counts, matches, areas] = await Promise.all([
    getEntitlementCounts(event.id),
    search === ""
      ? Promise.resolve([])
      : getBeneficiaries(event.id, { search, limit: SEARCH_LIMIT }),
    getAreas(event.id),
  ]);

  const areaNameById = new Map(areas.map((area) => [area.id, area.name]));

  return (
    <>
      <PageHeader
        title="Pengambilan"
        description="Pindai QR penerima, lalu catat berapa yang benar-benar diambil."
        meta={
          <span>
            {event.code ? `${event.code} · ` : ""}
            {event.name}
          </span>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <StatCard label="Belum diambil" value={formatNumber(counts.pending)} />
        <StatCard
          label="Sebagian"
          value={formatNumber(counts.partiallyPicked)}
          tone={counts.partiallyPicked > 0 ? "warn" : "neutral"}
        />
        <StatCard label="Sudah diambil" value={formatNumber(counts.pickedUp)} />
      </div>

      <Section
        title="Pindai QR"
        description="Kamera baru menyala saat diminta, jadi stasiun yang tidak memindai tidak akan ditanyai izin."
      >
        <Card>
          <TokenScanner />
        </Card>
      </Section>

      <Section
        title="Cari penerima"
        description="Jalan keluar saat QR hilang atau rusak: cari nama atau kode penerima."
      >
        <Card>
          <form method="get" className="flex flex-col gap-2">
            <label htmlFor="cari" className="text-sm font-medium">
              Nama atau kode penerima
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="cari"
                name="cari"
                defaultValue={search}
                autoComplete="off"
                placeholder="Misal: Budi atau PST-0142"
                className="min-w-0 flex-1 rounded-md border border-line bg-surface-raised px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                Cari
              </button>
              {search === "" ? null : (
                <Link
                  href="/pengambilan"
                  className="inline-flex items-center justify-center rounded-md border border-line bg-surface-raised px-3 py-2 text-sm font-semibold hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  Reset
                </Link>
              )}
            </div>
            <p className="text-xs text-ink-muted">
              Mencatat lewat pencarian tetap tercatat sebagai pengambilan manual
              oleh akun Anda.
            </p>
          </form>
        </Card>

        {search === "" ? null : (
          <div className="mt-4">
            {matches.length === 0 ? (
              <Notice title="Tidak ada yang cocok">
                Coba potongan kode penerima, atau periksa daftar lengkapnya di Data
                Master.
              </Notice>
            ) : (
              <ul className="flex flex-col gap-2">
                {matches.map((beneficiary) => (
                  <li key={beneficiary.id}>
                    <Link
                      href={`/pengambilan/penerima/${beneficiary.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised p-4 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {beneficiary.name}
                          {beneficiary.isActive ? null : (
                            <span className="ml-2 text-xs text-ink-muted">
                              nonaktif
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {beneficiary.code} ·{" "}
                          {beneficiaryCategoryLabel(
                            beneficiary.beneficiaryCategory,
                          )}{" "}
                          · {beneficiaryTypeLabel(beneficiary.beneficiaryType)}
                          {beneficiary.areaId
                            ? ` · ${areaNameById.get(beneficiary.areaId) ?? "—"}`
                            : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="numeric text-sm font-semibold">
                          {formatNumber(beneficiary.quantity)}
                        </span>
                        <ChevronRight
                          aria-hidden
                          className="size-4 text-ink-muted"
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {matches.length === SEARCH_LIMIT ? (
              <p className="mt-3 text-xs text-warn">
                Hanya {SEARCH_LIMIT} hasil teratas yang ditampilkan. Persempit kata
                kuncinya.
              </p>
            ) : null}
          </div>
        )}
      </Section>
    </>
  );
}
