import { notFound } from 'next/navigation';
import { WorkspaceStylePreview } from '@/components/workspace-style-preview';

export const metadata = {
  title: 'Operations overview — Fazoo',
  robots: { index: false, follow: false },
};

export default function WorkspaceStylePreviewPage() {
  // The showcase never connects to company data or bypasses real workspace login.
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  )
    notFound();
  return <WorkspaceStylePreview />;
}
