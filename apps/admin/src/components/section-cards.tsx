import Link from 'next/link';
import {
  Boxes,
  Building2,
  CalendarRange,
  GraduationCap,
  MapPin,
  Store,
  Users,
} from 'lucide-react';

const SECTIONS = [
  { href: '/brand-ambassadors', label: 'Brand Ambassadors', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Store },
  { href: '/stores', label: 'Stores', icon: MapPin },
  { href: '/skus', label: 'SKUs', icon: Boxes },
  { href: '/veda-activations', label: 'Brand Activations', icon: GraduationCap },
  { href: '/veda-assignments', label: 'Brand Assignments', icon: CalendarRange },
  { href: '/brands', label: 'Add Brand', icon: Building2 },
] as const;

export function SectionCards() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
      {SECTIONS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="group flex min-h-24 flex-col items-start justify-between gap-2 rounded-xl border border-ink/10 bg-white/80 p-3 transition-colors hover:border-primary/40 hover:bg-white sm:min-h-0 sm:flex-row sm:items-center sm:justify-start sm:gap-3 sm:p-4"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-lavender transition-colors group-hover:bg-primary group-hover:text-white">
            <Icon size={18} aria-hidden="true" />
          </span>
          <span className="text-left text-xs font-semibold leading-tight text-ink sm:text-sm">
            {label}
          </span>
        </Link>
      ))}
    </div>
  );
}
