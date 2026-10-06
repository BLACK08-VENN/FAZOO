import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth';

// Keep old bookmarks working while authenticator sign-in is paused.
export default async function MfaPage() {
  await requireStaff();
  redirect('/overview');
}
