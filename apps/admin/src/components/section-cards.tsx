import Link from 'next/link';
import { navFor, type OrgKind } from '@/lib/nav';

export function SectionCards({ orgKind }: { orgKind: OrgKind }) {
  const sections = navFor(orgKind);

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
      {sections.map(({ href, cardLabel, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="group flex min-h-24 flex-col items-start justify-between gap-2 rounded-xl border border-ink/10 bg-white/80 p-3 transition-colors hover:border-primary/40 hover:bg-white sm:min-h-0 sm:flex-row sm:items-center sm:justify-start sm:gap-3 sm:p-4"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-lavender transition-colors group-hover:bg-primary group-hover:text-white">
            <Icon size={18} aria-hidden="true" />
          </span>
          <span className="text-left text-xs font-semibold leading-tight text-ink sm:text-sm">
            {cardLabel}
          </span>
        </Link>
      ))}
    </div>
  );
}
