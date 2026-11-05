import Link from 'next/link';
import { Wrench, Truck } from 'lucide-react';
import { requireApprovedProfile } from '@/lib/auth';

export async function MaintenanceEntry() {
  const maintenance = process.env.MAINTENANCE_ENABLED === 'true';
  const operations = process.env.OPERATIONS_ENABLED === 'true';
  if (!maintenance && !operations) return null;
  const { profile } = await requireApprovedProfile();
  return (
    <>
      {maintenance ? (
        <Link href="/service-desk" className="fazoo-nav-link my-2">
          <Wrench size={16} aria-hidden="true" /> Service desk
        </Link>
      ) : null}
      {operations && profile.role !== 'client' ? (
        <Link href="/operations" className="fazoo-nav-link my-2">
          <Truck size={16} aria-hidden="true" /> Daily operations
        </Link>
      ) : null}
    </>
  );
}
