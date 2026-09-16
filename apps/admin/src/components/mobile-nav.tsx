'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { mobileNavFor, type OrgKind } from '@/lib/nav';
import { cn } from '@/lib/cn';

export function MobileNav({ orgKind }: { orgKind: OrgKind }) {
  const pathname = usePathname();
  const items = mobileNavFor(orgKind);

  return (
    <nav
      aria-label="Primary mobile"
      className="fazoo-mobile-nav no-print fixed inset-x-0 bottom-0 z-30 border-t xl:hidden"
    >
      <div className="mx-auto flex max-w-3xl snap-x snap-mandatory gap-1 overflow-x-auto px-2 pt-1.5">
        {items.map(({ href, shortLabel, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-14 min-w-[4.75rem] flex-1 snap-start flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:text-[11px]',
                active ? 'text-primary' : 'text-muted hover:bg-primary/5 hover:text-ink',
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
              <span className="whitespace-nowrap">{shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
