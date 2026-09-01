import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  hasSupabaseConfig,
} from "@/lib/supabase/env";

export async function createSupabaseServerClient() {
  if (!hasSupabaseConfig() || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Konfigurasi Supabase belum lengkap.");
  }

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components may only read cookies. Session refresh writes
          // happen in the proxy, which runs before rendering.
        }
      },
    },
  });
}
