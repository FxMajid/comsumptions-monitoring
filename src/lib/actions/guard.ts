import { getStaffProfile } from "@/lib/auth/server";
import type { StaffProfile, StaffRole } from "@/types/staff";

/**
 * The same set the *_write_manager_roles RLS policies allow. Keeping the app
 * check aligned with the policy means a rejected write shows a readable message
 * instead of an opaque row level security error.
 */
export const MANAGER_ROLES: StaffRole[] = ["ADMIN", "CONSUMPTION_MANAGER"];

/**
 * Every server action calls this first. A Server Action is a POST endpoint that
 * exists whether or not its form was rendered, so authorisation cannot be left
 * to the page that happens to show the button.
 */
export async function getManagerProfile(): Promise<StaffProfile | null> {
  const profile = await getStaffProfile();

  return profile && MANAGER_ROLES.includes(profile.role) ? profile : null;
}
