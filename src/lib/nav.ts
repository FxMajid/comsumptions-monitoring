import { getAllowedRolesForPath } from "@/lib/auth/roles";
import type { StaffRole } from "@/types/staff";

/**
 * Icons travel as names, not components. This list is built in a Server
 * Component and handed to a Client Component, and only serializable values
 * cross that boundary — a Lucide component would be rejected. `AppNav` maps
 * these names back to the real components on the client side.
 */
export type NavIconName =
  | "layout-dashboard"
  | "clipboard-list"
  | "wallet"
  | "calendar-days"
  | "store"
  | "database"
  | "boxes"
  | "scan-line"
  | "scale"
  | "users";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  /** False while the section has no page yet, so the shell reads as intended. */
  available: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard", available: true },
  {
    href: "/panitia",
    label: "Ancar-ancar Panitia",
    icon: "clipboard-list",
    available: true,
  },
  { href: "/anggaran", label: "Anggaran", icon: "wallet", available: true },
  { href: "/perencanaan", label: "Perencanaan", icon: "calendar-days", available: true },
  { href: "/vendor", label: "Vendor & Pesanan", icon: "store", available: true },
  { href: "/master", label: "Data Master", icon: "database", available: true },
  { href: "/gudang", label: "Gudang & Stok", icon: "boxes", available: false },
  { href: "/pengambilan", label: "Pengambilan", icon: "scan-line", available: true },
  { href: "/rekonsiliasi", label: "Rekonsiliasi", icon: "scale", available: false },
  { href: "/pengguna", label: "Pengguna", icon: "users", available: false },
];

/** Hides sections the role cannot open at all, rather than showing a dead end. */
export function getNavItemsForRole(role: StaffRole): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    const allowedRoles = getAllowedRolesForPath(item.href);

    return !allowedRoles || allowedRoles.includes(role);
  });
}
