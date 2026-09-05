import type { Metadata } from "next";
import { CalendarPlus } from "lucide-react";
import { canAccessPath } from "@/lib/auth/roles";
import { requireStaffProfile } from "@/lib/auth/server";
import { getActiveEvent } from "@/lib/domain/event";
import { getBudgetSummary } from "@/lib/domain/budget";
import {
  getEntitlementCounts,
  toEntitlementDistribution,
} from "@/lib/domain/entitlement";
import { IconChip, PillLink } from "@/components/ui/soft";
import { Ringkasan } from "@/components/dashboard/ringkasan";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The page is only the data boundary: authenticate, read the three event-scoped
 * figures, and hand them to `Ringkasan`, which owns the whole composition. The
 * role never crosses into the component — it is resolved into link permissions
 * here, where the access contract lives.
 */
export default async function DashboardPage() {
  const profile = await requireStaffProfile("/dashboard");
  const event = await getActiveEvent();

  if (!event) {
    return (
      <div className="rounded-soft bg-soft-ground p-4 sm:p-6">
        <div className="mx-auto max-w-xl rounded-soft bg-soft-card p-8 text-center shadow-soft">
          <div className="flex justify-center">
            <IconChip>
              <CalendarPlus aria-hidden="true" className="size-5" />
            </IconChip>
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">
            Belum ada event
          </h1>
          <p className="mx-auto mt-2 max-w-prose text-sm text-pretty text-ink-muted">
            Setiap angka di halaman ini dihitung per event, jadi tidak ada yang
            bisa ditampilkan sampai ada satu. Tambahkan satu baris di tabel{" "}
            <code className="font-mono">events</code>, lalu tandai statusnya{" "}
            <code className="font-mono">active</code>.
          </p>
          {/* The committee estimate needs no event row, so it stays reachable. */}
          {canAccessPath("/panitia", profile.role) ? (
            <div className="mt-5 flex justify-center">
              <PillLink href="/panitia" tone="ink" arrow>
                Buka ancar-ancar panitia
              </PillLink>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const [budget, entitlements] = await Promise.all([
    getBudgetSummary(event.id),
    getEntitlementCounts(event.id),
  ]);

  return (
    <Ringkasan
      event={event}
      budget={budget}
      distribution={toEntitlementDistribution(entitlements)}
      links={{
        anggaran: canAccessPath("/anggaran", profile.role),
        vendor: canAccessPath("/vendor", profile.role),
        pengambilan: canAccessPath("/pengambilan", profile.role),
        panitia: canAccessPath("/panitia", profile.role),
      }}
    />
  );
}
