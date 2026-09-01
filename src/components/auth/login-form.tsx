"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import {
  createSupabaseBrowserClient,
  hasSupabaseConfig,
} from "@/lib/supabase/client";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const configured = hasSupabaseConfig();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage("Email atau password salah.");
        return;
      }

      // The server needs to re-read the freshly written session cookie before
      // the protected layout runs its own role check.
      router.replace(nextPath);
      router.refresh();
    } catch {
      setMessage("Tidak bisa menghubungi Supabase.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {!configured && (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
          Environment Supabase belum diisi. Salin <code>.env.example</code> ke{" "}
          <code>.env.local</code> lalu isi URL dan publishable key.
        </p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-line bg-surface-raised px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-md border border-line bg-surface-raised px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
        />
      </label>

      {message && (
        <p role="alert" className="text-sm text-alert">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !configured}
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LogIn aria-hidden="true" className="size-4" />
        {isSubmitting ? "Memproses…" : "Masuk"}
      </button>
    </form>
  );
}
