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
      {/* Nine nav items sit between the top of the page and the content, which is
          a long way to tab through on every navigation. */}
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-10 focus:rounded-full focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Lompat ke konten
      </a>

      {/* The rail is separated from the content by fill, not a hairline: it is a
          shade darker than the page, the same way a card is a shade lighter than
          the dashboard's ground. */}
      <aside className="bg-soft-ground lg:w-64 lg:shrink-0">
        <div className="flex flex-col gap-6 p-4 lg:sticky lg:top-0 lg:h-dvh">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-text">
              Divisi Konsumsi
            </p>
            <p className="text-base font-semibold tracking-tight">Monitoring</p>
          </div>

          <AppNav items={navItems} />

          <div className="mt-auto border-t border-soft-hairline pt-4">
            <p className="truncate text-sm font-medium">{profile.fullName}</p>
            <p className="mb-3 truncate text-xs text-ink-muted">
              {STAFF_ROLE_LABELS[profile.role]}
            </p>
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/*
        Without a cap the figures spread into a thin band on a wide monitor. The
        bottom padding runs longer than the top so the last card does not sit
        flush against the fold.
      */}
      <main
        id="konten"
        className="flex-1 px-4 pt-6 pb-12 lg:px-8 lg:pt-8 lg:pb-16"
      >
        <div className="mx-auto w-full max-w-[88rem]">{children}</div>
      </main>
    </div>
  );
}
