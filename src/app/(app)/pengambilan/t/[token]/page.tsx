import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffProfile } from "@/lib/auth/server";
import { getBeneficiary } from "@/lib/domain/beneficiary";
import { findClaimToken, isTokenExpired } from "@/lib/domain/claim-token";
import { formatDateTime } from "@/lib/format";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/section";

/**
 * A token sits in this URL, so it stays out of search engines even though only
 * staff can open it.
 */
export const metadata: Metadata = {
  title: "Token Klaim",
  robots: { index: false, follow: false },
};

/**
 * Where a scan lands. Unlike the participant page, an operator is told exactly
 * why a token failed — revoked, expired, or never issued — because someone is
 * standing at the counter waiting for an answer.
 */
export default async function OperatorClaimTokenPage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>) {
  await requireStaffProfile("/pengambilan");

  const { token } = await params;
  const record = await findClaimToken(token);

  if (record && !record.revokedAt && !isTokenExpired(record)) {
    redirect(`/pengambilan/penerima/${record.beneficiaryId}`);
  }

  const beneficiary = record ? await getBeneficiary(record.beneficiaryId) : null;

  return (
    <>
      <PageHeader
        title="QR tidak bisa dipakai"
        description="Penerimanya tetap bisa dilayani manual setelah dipastikan."
        meta={
          <Link
            href="/pengambilan"
            className="text-brand-600 underline-offset-2 hover:underline"
          >
            ← Pengambilan
          </Link>
        }
      />

      <div className="max-w-2xl">
        {record === null ? (
          <Notice title="Token tidak dikenal">
            Tidak ada QR yang cocok dengan kode ini. Bisa jadi salah pindai, QR dari
            event lain, atau kode yang diketik tidak lengkap. Cari penerimanya lewat
            nama atau kode di halaman Pengambilan.
          </Notice>
        ) : (
          <Card>
            <Notice
              title={
                record.revokedAt ? "QR sudah dicabut" : "QR sudah kedaluwarsa"
              }
            >
              {record.revokedAt
                ? "QR ini dicabut, biasanya karena diganti yang baru atau dilaporkan bocor."
                : "Masa berlaku QR ini sudah lewat. Tetap bisa dilayani, tapi pastikan dulu ke koordinator."}
            </Notice>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ink-muted">Diterbitkan</dt>
                <dd>{formatDateTime(record.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Berlaku sampai</dt>
                <dd>{formatDateTime(record.expiresAt)}</dd>
              </div>
              {record.revokedAt ? (
                <>
                  <div>
                    <dt className="text-xs text-ink-muted">Dicabut</dt>
                    <dd>{formatDateTime(record.revokedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">Alasan</dt>
                    <dd>{record.revocationReason ?? "—"}</dd>
                  </div>
                </>
              ) : null}
            </dl>

            <div className="mt-5 border-t border-line pt-4">
              <p className="text-sm font-medium">
                {beneficiary
                  ? `${beneficiary.name} · ${beneficiary.code}`
                  : "Penerima tidak ditemukan"}
              </p>
              {beneficiary ? (
                <p className="mt-2">
                  <Link
                    href={`/pengambilan/penerima/${beneficiary.id}`}
                    className="text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
                  >
                    Buka daftar haknya →
                  </Link>
                </p>
              ) : (
                <p className="mt-1 text-xs text-ink-muted">
                  Barisnya mungkin sudah dihapus dari event ini.
                </p>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
