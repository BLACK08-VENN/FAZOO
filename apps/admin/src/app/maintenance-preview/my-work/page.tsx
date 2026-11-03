import { notFound } from 'next/navigation';
import { WorkerWorkspace } from '@/components/worker-preview/workspace';
import type { Persona } from '@/lib/worker-preview/model';
export const metadata = {
  title: 'My work — Fazoo',
  robots: { index: false, follow: false },
};
export default async function MyWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; job?: string }>;
}) {
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  )
    notFound();
  const params = await searchParams;
  const roles: Record<string, Persona> = {
    technician: 'Technician',
    ambassador: 'Brand ambassador',
    merchandiser: 'Merchandiser',
  };
  const persona = roles[params.role ?? ''] ?? 'Technician';
  const job =
    params.job && /^(tech|ba|merch)-[1-4]$/.test(params.job)
      ? params.job
      : undefined;
  return <WorkerWorkspace initialPersona={persona} initialAssignmentId={job} />;
}
