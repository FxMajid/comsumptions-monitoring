import type { Metadata } from "next";
import {
  beneficiaryCategoryLabel,
  beneficiaryTypeLabel,
} from "@/lib/domain/beneficiary";
import {
  entitlementStatusLabel,
  entitlementStatusTone,
} from "@/lib/domain/entitlement";
import type { ClaimEntitlement } from "@/lib/domain/claim";
import { resolveClaim } from "@/lib/domain/claim";
import { buildClaimUrl } from "@/lib/domain/claim-token";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatTimeRange,
} from "@/lib/format";
import { QrCode } from "@/components/ui/qr-code";
import { Badge } from "@/components/ui/status-badge";

/**
 * A token in the URL must never be cached or indexed, and the entitlement
 * figures change the moment a counter records a pickup.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Klaim Konsumsi",
  robots: { index: false, follow: false },
};

type SlotGroup = {
  key: string;
  name: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  pickupDeadline: string | null;
  items: ClaimEntitlement[];
};

/** The RPC already sorts by slot then item, so a single pass keeps that order. */
function groupBySlot(entitlements: ClaimEntitlement[]): SlotGroup[] {
  const groups = new Map<string, SlotGroup>();

  for (const item of entitlements) {
    const existing = groups.get(item.slotCode);

    if (existing) {
      existing.items.push(item);

      continue;
    }

    groups.set(item.slotCode, {
      key: item.slotCode,
      name: item.slotName,
      date: item.slotDate,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      pickupDeadline: item.pickupDeadline,
      items: [item],
    });
  }

  return [...groups.values()];
}

/**
 * The only page without an account behind it. Every failure reads the same on
 * purpose: an unknown, revoked, and expired token must not be told apart from
 * out here, or the page becomes a way to probe which tokens exist.
 */
export default async function ClaimPage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params;
  const claim = await resolveClaim(token);

  if (!claim) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="rounded-lg border border-line bg-surface-raised p-6">
            <h1 className="text-lg font-semibold tracking-tight">
              Tautan tidak berlaku
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              Tautan atau QR ini tidak bisa dipakai lagi. Bisa jadi masa
              berlakunya sudah lewat, atau sudah diganti dengan yang baru.
            </p>
            <p className="mt-4 text-sm text-ink-muted">
              Hubungi panitia divisi konsumsi untuk minta tautan pengganti.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { identity, entitlements } = claim;
  const claimUrl = await buildClaimUrl(token);
  const groups = groupBySlot(entitlements);
  const totalRemaining = entitlements.reduce(
    (sum, item) => sum + item.remainingQuantity,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
        {identity.eventCode ? `${identity.eventCode} · ` : ""}
        {identity.eventName}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {identity.beneficiaryName}
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        {identity.beneficiaryCode} ·{" "}
        {beneficiaryCategoryLabel(identity.beneficiaryCategory)} ·{" "}
        {beneficiaryTypeLabel(identity.beneficiaryType)}
        {identity.areaName ? ` · ${identity.areaName}` : ""}
      </p>

      <section className="mt-6 rounded-lg border border-line bg-surface-raised p-5">
        <h2 className="text-sm font-semibold">Tunjukkan QR ini ke petugas</h2>
        <div className="mt-4 flex justify-center">
          <QrCode
            value={claimUrl}
            label={`QR klaim konsumsi untuk ${identity.beneficiaryName}`}
            pixelSize={224}
          />
        </div>
        <p className="mt-4 text-center text-xs text-ink-muted">
          Berlaku sampai {formatDateTime(identity.tokenExpiresAt)}. Jangan
          dibagikan: siapa pun yang punya tautan ini bisa dianggap Anda.
        </p>
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Hak konsumsi Anda</h2>
          <p className="text-xs text-ink-muted">
            Sisa belum diambil:{" "}
            <span className="numeric font-semibold text-ink">
              {formatNumber(totalRemaining)}
            </span>
          </p>
        </div>

        {groups.length === 0 ? (
          <div className="mt-3 rounded-lg border border-line bg-surface-raised p-5">
            <p className="text-sm text-ink-muted">
              Belum ada jadwal konsumsi yang terdaftar untuk Anda. Cek lagi nanti
              atau tanyakan ke panitia.
            </p>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {groups.map((group) => (
              <li
                key={group.key}
                className="rounded-lg border border-line bg-surface-raised p-4"
              >
                <p className="font-medium">{group.name}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {formatDate(group.date)} ·{" "}
                  {formatTimeRange(group.startsAt, group.endsAt)}
                </p>

                <ul className="mt-3 flex flex-col gap-2">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {item.itemName}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          Hak {formatNumber(item.quantity)} {item.unitOfMeasure} ·
                          sisa {formatNumber(item.remainingQuantity)}
                        </span>
                      </span>
                      <Badge tone={entitlementStatusTone(item.status)}>
                        {entitlementStatusLabel(item.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>

                {group.pickupDeadline ? (
                  <p className="mt-3 text-xs text-ink-muted">
                    Batas pengambilan {formatDateTime(group.pickupDeadline)}.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-ink-muted">
        Jumlah di halaman ini ikut berubah begitu petugas mencatat pengambilan.
        Muat ulang bila terasa belum sesuai.
      </p>
    </main>
  );
}
