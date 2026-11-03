import { notFound } from 'next/navigation';
import { HananDemo } from '@/components/retail-demo/workspace';

export const metadata = {
  title: 'Hanan retail operations — Fazoo',
  robots: { index: false, follow: false },
};
export default function HananPreviewPage() {
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  )
    notFound();
  return <HananDemo />;
}
