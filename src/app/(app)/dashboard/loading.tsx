/**
 * Shaped like the real page rather than a spinner, so the layout does not jump
 * when the two Supabase reads land. `aria-hidden` keeps the placeholder bars out
 * of the accessibility tree; the live region below is what gets announced.
 *
 * The bars are `soft-inset` because this skeleton sits on the dashboard's own
 * ground, where `line` — a cool grey mixed for the other surface set — would
 * read as a different material.
 */
function Bar({ className }: Readonly<{ className: string }>) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded bg-soft-inset motion-safe:animate-pulse ${className}`}
    />
  );
}

function Card({
  className = "",
  children,
}: Readonly<{ className?: string; children: React.ReactNode }>) {
  return (
    <div className={`rounded-soft bg-soft-card p-5 shadow-soft ${className}`}>
      {children}
    </div>
  );
}

function StatSkeleton() {
  return (
    <Card>
      <Bar className="size-10 rounded-full" />
      <Bar className="mt-4 h-3 w-24" />
      <Bar className="mt-2 h-7 w-36" />
    </Card>
  );
}

export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="rounded-soft bg-soft-ground p-4 sm:p-5 lg:p-6"
    >
      <span className="sr-only">Memuat ringkasan dashboard…</span>

      <div className="flex flex-wrap items-center gap-4">
        <Bar className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Bar className="h-6 w-52" />
          <Bar className="mt-2 h-4 w-64" />
        </div>
        <Bar className="h-10 w-44 rounded-full" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-12">
        <Card className="sm:col-span-2 xl:col-span-5">
          <Bar className="size-10 rounded-full" />
          <Bar className="mt-4 h-3 w-20" />
          <Bar className="mt-2 h-10 w-60" />
          <Bar className="mt-3 h-4 w-full max-w-80" />
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-soft-hairline pt-4">
            <Bar className="h-8 w-32" />
            <Bar className="h-8 w-32" />
          </div>
          <Bar className="mt-5 h-10 w-40 rounded-full" />
        </Card>

        <div className="grid gap-4 xl:col-span-3">
          <StatSkeleton />
          <StatSkeleton />
        </div>

        <div className="grid content-start justify-items-center gap-3 xl:col-span-2">
          <Bar className="aspect-square w-full max-w-40 rounded-full" />
          <Bar className="h-8 w-full" />
        </div>

        <Card className="sm:col-span-2 xl:col-span-2">
          <Bar className="size-10 rounded-full" />
          <Bar className="mt-4 h-3 w-24" />
          <Bar className="mt-2 h-7 w-24" />
          <Bar className="mt-4 h-16 w-full" />
        </Card>

        <Card className="sm:col-span-2 xl:col-span-7">
          <Bar className="h-10 w-48" />
          <Bar className="mt-5 h-24 w-full" />
          <Bar className="mt-5 h-8 w-full" />
        </Card>

        <Card className="sm:col-span-2 xl:col-span-5">
          <Bar className="h-10 w-40" />
          <Bar className="mt-5 aspect-square w-full max-w-56" />
        </Card>

        <Card className="sm:col-span-2 xl:col-span-5">
          <Bar className="h-10 w-44" />
          <Bar className="mt-4 h-7 w-24" />
          <Bar className="mt-5 h-32 w-full" />
        </Card>

        <Card className="sm:col-span-2 xl:col-span-7">
          <Bar className="h-10 w-40" />
          <Bar className="mt-5 h-2.5 w-full rounded-full" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Bar className="h-10 w-32" />
            <Bar className="h-10 w-32" />
            <Bar className="h-10 w-32" />
          </div>
        </Card>
      </div>
    </div>
  );
}
