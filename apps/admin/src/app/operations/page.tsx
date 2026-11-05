import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireApprovedProfile } from '@/lib/auth';
import { loadOperations } from '@/lib/operations/server';
import { OperationsWorkspace } from '@/components/operations/workspace';

export const metadata = { title: 'Daily operations — Fazoo' };
export default async function OperationsPage() {
  if (process.env.OPERATIONS_ENABLED !== 'true') notFound();
  const { client, profile } = await requireApprovedProfile();
  if (profile.role === 'client') notFound();
  let workspace;
  try {
    workspace = await loadOperations(client);
  } catch {
    return (
      <main id="main-content" className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-semibold">Operations unavailable</h1>
        <p className="my-4">
          Please refresh or contact your administrator if the problem continues.
        </p>
        <Link href="/operations" className="underline">
          Try again
        </Link>
      </main>
    );
  }
  return <OperationsWorkspace initial={workspace} />;
}
