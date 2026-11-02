'use client';

import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { navFor, type OrgKind } from '@/lib/nav';

export function SidebarNav({ orgKind }: { orgKind: OrgKind }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
      {[
        { href: '/overview', label: 'Overview', icon: LayoutDashboard },
        ...navFor(orgKind),
      ].map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="fazoo-nav-link"
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
