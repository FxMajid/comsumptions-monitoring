import { STAFF_ROLES, type StaffRole } from "@/types/staff";

const ALL_ROLES: StaffRole[] = [...STAFF_ROLES];

/**
 * The access contract for the whole app. Routes listed here require a signed-in
 * staff member holding one of the roles; anything not listed is public.
 *
 * This is an optimistic gate only. Row level security in Postgres is the real
 * boundary: a role that slips past this map still reads nothing it should not.
 */
const ROUTE_ROLES: Array<{ path: string; roles: StaffRole[] }> = [
  { path: "/dashboard", roles: ALL_ROLES },
  { path: "/panitia/impor", roles: ["ADMIN"] },
  { path: "/panitia", roles: ALL_ROLES },
  { path: "/anggaran", roles: ["ADMIN", "CONSUMPTION_MANAGER", "MANAGEMENT"] },
  { path: "/perencanaan", roles: ["ADMIN", "CONSUMPTION_MANAGER"] },
  { path: "/vendor", roles: ["ADMIN", "CONSUMPTION_MANAGER"] },
  { path: "/master", roles: ["ADMIN", "CONSUMPTION_MANAGER"] },
  {
    path: "/gudang",
    roles: ["ADMIN", "CONSUMPTION_MANAGER", "WAREHOUSE_OPERATOR"],
  },
  {
    path: "/pengambilan",
    roles: ["ADMIN", "PICKUP_OPERATOR", "AREA_PIC", "WAREHOUSE_OPERATOR"],
  },
  {
    path: "/rekonsiliasi",
    roles: ["ADMIN", "CONSUMPTION_MANAGER", "WAREHOUSE_OPERATOR", "MANAGEMENT"],
  },
  { path: "/pengguna", roles: ["ADMIN"] },
];

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && ALL_ROLES.includes(value as StaffRole);
}

export function getAllowedRolesForPath(pathname: string): StaffRole[] | null {
  return (
    ROUTE_ROLES.find(
      (route) => pathname === route.path || pathname.startsWith(`${route.path}/`),
    )?.roles ?? null
  );
}

export function canAccessPath(pathname: string, role: StaffRole | null): boolean {
  const allowedRoles = getAllowedRolesForPath(pathname);

  if (!allowedRoles) {
    return true;
  }

  return role ? allowedRoles.includes(role) : false;
}
