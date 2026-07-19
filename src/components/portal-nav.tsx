"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Package, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/server/actions/auth-actions";

const links = [
  { href: "/portal", label: "Catalog", icon: Package },
  { href: "/portal/orders", label: "My Orders", icon: ClipboardList },
];

export function PortalNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);

  return (
    <nav className="flex items-center gap-1">
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors",
            isActive(href) ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-100",
          )}
        >
          <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
          {label}
        </Link>
      ))}
      <form action={signOutAction} className="ml-1">
        <button
          type="submit"
          title="Sign out"
          className="flex h-9 items-center gap-2 rounded-[10px] px-3 text-sm font-medium text-ink-500 transition-colors hover:bg-ink-100"
        >
          <LogOut className="h-[17px] w-[17px]" strokeWidth={1.9} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </form>
    </nav>
  );
}
