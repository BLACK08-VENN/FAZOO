import { notFound } from 'next/navigation';
import { initialOperations } from '@/lib/operations/preview';
import { OperationsWorkspace } from '@/components/operations/workspace';

export const metadata = {
  title: 'Daily operations — Fazoo',
  robots: { index: false, follow: false },
};
export default function OperationsPreviewPage() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.NEXT_PUBLIC_SUPABASE_URL) notFound();
  return <OperationsWorkspace initial={initialOperations()} preview />;
}
