import { getStaffProfile } from "@/lib/auth/server";
import type { StaffProfile, StaffRole } from "@/types/staff";

/**
 * The same sets the RLS policies allow. Keeping the app check aligned with the
 * policy means a rejected write shows a readable message instead of an opaque
 * row level security error.
 */
export const MANAGER_ROLES: StaffRole[] = ["ADMIN", "CONSUMPTION_MANAGER"];

export const WAREHOUSE_ROLES: StaffRole[] = [
  "ADMIN",
  "CONSUMPTION_MANAGER",
  "WAREHOUSE_OPERATOR",
];

export const PICKUP_ROLES: StaffRole[] = [
  "ADMIN",
  "PICKUP_OPERATOR",
  "AREA_PIC",
  "WAREHOUSE_OPERATOR",
];

/**
 * Every server action calls one of these first. A Server Action is a POST
 * endpoint that exists whether or not its form was rendered, so authorisation
 * cannot be left to the page that happens to show the button.
 */
export async function getProfileForRoles(
  roles: StaffRole[],
): Promise<StaffProfile | null> {
  const profile = await getStaffProfile();

  return profile && roles.includes(profile.role) ? profile : null;
}

export async function getManagerProfile(): Promise<StaffProfile | null> {
  return getProfileForRoles(MANAGER_ROLES);
}

export async function getWarehouseProfile(): Promise<StaffProfile | null> {
  return getProfileForRoles(WAREHOUSE_ROLES);
}

export async function getPickupProfile(): Promise<StaffProfile | null> {
  return getProfileForRoles(PICKUP_ROLES);
}
