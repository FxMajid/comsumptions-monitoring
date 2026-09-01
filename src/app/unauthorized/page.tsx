import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata: Metadata = { title: "Akses ditolak" };

export default function UnauthorizedPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <ShieldAlert aria-hidden="true" className="mx-auto size-10 text-warn" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          Akses ditolak
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Role akun Anda tidak punya izin untuk halaman ini. Hubungi admin bila
          seharusnya punya akses.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-md border border-line px-4 py-2 text-sm font-medium transition hover:bg-surface-sunken"
        >
          Kembali ke dashboard
        </Link>
      </div>
    </main>
  );
}
