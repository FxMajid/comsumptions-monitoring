"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
import type { NavIconName, NavItem } from "@/lib/nav";

/** Turns the serializable names from `@/lib/nav` back into components. */
const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  wallet: Wallet,
  "calendar-days": CalendarDays,
  store: Store,
  database: Database,
  boxes: Boxes,
  "scan-line": ScanLine,
  scale: Scale,
  users: Users,
};

export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = NAV_ICONS[item.icon];

        if (!item.available) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title="Belum tersedia"
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink-muted/60"
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              <span className="ml-auto rounded border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase">
                Nanti
              </span>
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "flex items-center gap-2.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white"
                : "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition hover:bg-surface-sunken"
            }
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
