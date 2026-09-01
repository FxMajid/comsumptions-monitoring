import { requireStaffProfile } from "@/lib/auth/server";
import { getNavItemsForRole } from "@/lib/nav";
import { AppNav } from "@/components/layout/app-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { STAFF_ROLE_LABELS } from "@/types/staff";

/*
 * Every page in this group renders per-signed-in-user data behind RLS. Without
 * this, a build that runs before the Supabase env vars are set prerenders the
 * shell as a static redirect to /login and ships it that way.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The route group has no path of its own, so the per-route check runs in each
  // page. This resolves the profile once for the shell and redirects anyone
  // without a usable role.
  const profile = await requireStaffProfile("/dashboard");
  const navItems = getNavItemsForRole(profile.role);

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside className="border-b border-line bg-surface-raised lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex flex-col gap-6 p-4 lg:sticky lg:top-0 lg:h-dvh">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">
              Divisi Konsumsi
            </p>
            <p className="text-base font-semibold tracking-tight">Monitoring</p>
          </div>

          <AppNav items={navItems} />

          <div className="mt-auto border-t border-line pt-4">
            <p className="truncate text-sm font-medium">{profile.fullName}</p>
            <p className="mb-3 truncate text-xs text-ink-muted">
              {STAFF_ROLE_LABELS[profile.role]}
            </p>
            <SignOutButton />
          </div>
        </div>
      </aside>

      <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
