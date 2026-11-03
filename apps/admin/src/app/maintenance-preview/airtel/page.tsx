import { notFound } from 'next/navigation';
import { MaintenanceWorkspace } from '@/components/maintenance/workspace';
import { initialAirtelDemo } from '@/lib/maintenance/airtel-demo';

export const metadata = {
  title: 'Airtel maintenance — Fazoo',
  robots: { index: false, follow: false },
};
export default function AirtelPreviewPage() {
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  )
    notFound();
  return (
    <MaintenanceWorkspace
      initial={initialAirtelDemo()}
      demo
      demoCompany="Airtel"
    />
  );
}
