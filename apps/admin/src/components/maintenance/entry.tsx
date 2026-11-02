import Link from 'next/link';
import { Wrench } from 'lucide-react';

export function MaintenanceEntry() {
  if (process.env.MAINTENANCE_ENABLED !== 'true') return null;
  return (
    <Link
      href="/service-desk"
      className="fazoo-nav-link my-2"
    >
      <Wrench size={16} aria-hidden="true" /> Service desk
    </Link>
  );
}
