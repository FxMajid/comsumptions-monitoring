import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only same-site paths, so a crafted ?next= cannot bounce a signed-in staff
  // member to another origin.
  const nextPath = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            Divisi Konsumsi
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Monitoring Konsumsi
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Masuk dengan akun staff yang sudah didaftarkan admin.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface-raised p-6">
          <LoginForm nextPath={nextPath} />
        </div>
      </div>
    </main>
  );
}
