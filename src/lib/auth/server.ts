import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { canAccessPath, isStaffRole } from "@/lib/auth/roles";
import type { StaffProfile } from "@/types/staff";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  is_active: boolean | null;
};

/**
 * Resolves the signed-in staff member, or null. Reads through RLS, so an
 * inactive account or one with no profile row resolves to null even though the
 * auth session itself is valid.
 */
export async function getStaffProfile(): Promise<StaffProfile | null> {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (!data || !isStaffRole(data.role) || data.is_active === false) {
    return null;
  }

  return {
    id: data.id,
    email: data.email ?? user.email ?? "",
    fullName: data.full_name ?? data.email ?? "Staff",
    role: data.role,
    isActive: true,
  };
}

/**
 * The authoritative check. The proxy performs the same test optimistically to
 * avoid rendering a page that will be thrown away, but every protected layout
 * calls this so a request that bypasses the proxy still cannot render.
 */
export async function requireStaffProfile(pathname: string): Promise<StaffProfile> {
  const profile = await getStaffProfile();

  if (!profile) {
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  if (!canAccessPath(pathname, profile.role)) {
    redirect("/unauthorized");
  }

  return profile;
}
