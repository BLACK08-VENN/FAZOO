'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Store, Building2, GraduationCap, Users } from 'lucide-react';
import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/brand-ambassadors', label: 'Team', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Store },
  { href: '/veda-assignments', label: 'Schools', icon: GraduationCap },
  { href: '/brands', label: 'Brands', icon: Building2 },
] as const;

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary mobile"
      className="fazoo-mobile-nav no-print fixed inset-x-0 bottom-0 z-30 border-t lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4 px-2 pt-1.5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary',
                active ? 'text-primary' : 'text-muted hover:bg-primary/5 hover:text-ink',
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
