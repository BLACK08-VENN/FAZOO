import Link from 'next/link';
import {
  Boxes,
  Building2,
  CalendarCheck2,
  CalendarRange,
  ClipboardList,
  Download,
  FileClock,
  GraduationCap,
  MapPin,
  ScrollText,
  Settings,
  Store,
  Users,
} from 'lucide-react';

const SECTIONS = [
  { href: '/daily-logs', label: 'Daily Logs', icon: CalendarCheck2 },
  { href: '/leave-requests', label: 'Leave Requests', icon: FileClock },
  { href: '/sales', label: 'Sales', icon: ClipboardList },
  { href: '/brand-ambassadors', label: 'Brand Ambassadors', icon: Users },
  { href: '/stores', label: 'Stores', icon: MapPin },
  { href: '/skus', label: 'SKUs', icon: Boxes },
  { href: '/campaigns', label: 'Campaigns', icon: Store },
  { href: '/veda-activations', label: 'Veda Activations', icon: GraduationCap },
  { href: '/veda-assignments', label: 'Veda Assignments', icon: CalendarRange },
  { href: '/brands', label: 'Add Brand', icon: Building2 },
  { href: '/reports', label: 'Reports', icon: Download },
  { href: '/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function SectionCards() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {SECTIONS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-center gap-3 rounded-xl border border-ink/10 bg-white/80 p-4 transition-colors hover:border-primary/40 hover:bg-white"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-lavender transition-colors group-hover:bg-primary group-hover:text-white">
            <Icon size={18} aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold text-ink">{label}</span>
        </Link>
      ))}
    </div>
  );
}
