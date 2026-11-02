import Link from 'next/link';
import { Wrench } from 'lucide-react';

export function MaintenanceEntry() {
  if (process.env.MAINTENANCE_ENABLED !== 'true') return null;
  return (
    <Link
      href="/service-desk"
      className="my-2 flex min-h-11 items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-white"
    >
      <Wrench size={16} aria-hidden="true" /> Service desk
    </Link>
  );
}
