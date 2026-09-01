import {
  Boxes,
  CalendarDays,
  Database,
  LayoutDashboard,
  Scale,
  ScanLine,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { getAllowedRolesForPath } from "@/lib/auth/roles";
import type { StaffRole } from "@/types/staff";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** False while the section has no page yet, so the shell reads as intended. */
  available: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, available: true },
  { href: "/anggaran", label: "Anggaran", icon: Wallet, available: true },
  { href: "/perencanaan", label: "Perencanaan", icon: CalendarDays, available: false },
  { href: "/vendor", label: "Vendor & Pesanan", icon: Store, available: false },
  { href: "/master", label: "Data Master", icon: Database, available: false },
  { href: "/gudang", label: "Gudang & Stok", icon: Boxes, available: false },
  { href: "/pengambilan", label: "Pengambilan", icon: ScanLine, available: false },
  { href: "/rekonsiliasi", label: "Rekonsiliasi", icon: Scale, available: false },
  { href: "/pengguna", label: "Pengguna", icon: Users, available: false },
];

/** Hides sections the role cannot open at all, rather than showing a dead end. */
export function getNavItemsForRole(role: StaffRole): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    const allowedRoles = getAllowedRolesForPath(item.href);

    return !allowedRoles || allowedRoles.includes(role);
  });
}
