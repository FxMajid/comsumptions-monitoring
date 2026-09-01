import { createBrowserClient } from "@supabase/ssr";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  hasSupabaseConfig,
} from "@/lib/supabase/env";

export { hasSupabaseConfig };

export function createSupabaseBrowserClient() {
  if (!hasSupabaseConfig() || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Konfigurasi Supabase belum lengkap.");
  }

  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
