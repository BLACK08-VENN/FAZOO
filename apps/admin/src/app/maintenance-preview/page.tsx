import { initialDemo } from '@/lib/maintenance/demo';
import { notFound } from 'next/navigation';
import { MaintenanceWorkspace } from '@/components/maintenance/workspace';

export const metadata = {
  title: 'Service desk — Fazoo',
  robots: { index: false, follow: false },
};
export default function MaintenancePreviewPage() {
  // Only credential-free preview deployments may expose the fictional simulator.
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  )
    notFound();
  return <MaintenanceWorkspace initial={initialDemo()} demo />;
}
