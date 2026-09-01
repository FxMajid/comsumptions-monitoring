export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const PLACEHOLDERS = ["your-project-url", "your-publishable-key"];

/**
 * True once real values are in place. The scaffolded .env.example ships
 * placeholders so the app can boot and show a setup message instead of
 * crashing with an opaque Supabase error.
 */
export function hasSupabaseConfig(): boolean {
  return Boolean(
    SUPABASE_URL &&
      SUPABASE_PUBLISHABLE_KEY &&
      !PLACEHOLDERS.includes(SUPABASE_URL) &&
      !PLACEHOLDERS.includes(SUPABASE_PUBLISHABLE_KEY),
  );
}
