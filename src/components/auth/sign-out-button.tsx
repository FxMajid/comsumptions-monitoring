"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    setIsPending(true);

    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-full border border-soft-hairline px-3 py-1.5 text-sm font-medium transition hover:bg-soft-card disabled:opacity-50"
    >
      <LogOut aria-hidden="true" className="size-4" />
      {isPending ? "Keluar…" : "Keluar"}
    </button>
  );
}
