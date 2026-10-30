import Link from 'next/link';
import { redirect } from 'next/navigation';
import { serverSupabase } from '@fazoo/database';
import { postSignInPath } from '@/lib/auth-routing';
import { signOutAction } from '../(portal)/actions';
import { FazooMark } from '@/components/fazoo-mark';
import { Button } from '@/components/ui/button';
import styles from '../sign-in/sign-in.module.css';

const STATUS_MESSAGES: Record<string, { title: string; description: string }> = {
  pending: {
    title: 'Your account is awaiting approval',
    description:
      'Your registration is with your organization administrator. You can open your workspace once your account is approved.',
  },
  suspended: {
    title: 'Your access is currently suspended',
    description: 'Contact your organization administrator to discuss restoring your access.',
  },
  rejected: {
    title: 'Your account has not been approved',
    description:
      'Contact your organization administrator if you believe this needs to be reviewed.',
  },
  inactive: {
    title: 'Your account is inactive',
    description: 'Contact your organization administrator if you need to use Fazoo again.',
  },
};

export const metadata = { title: 'Account access — Fazoo' };

export default async function AccountStatusPage() {
  const client = await serverSupabase();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect('/sign-in');
  const { data: profile, error } = await client
    .from('profiles')
    .select('role, account_status')
    .eq('id', user.id)
    .maybeSingle();
  if (!error && profile) {
    const destination = postSignInPath(profile);
    if (destination !== '/account-status') redirect(destination);
  }
  const message = !error && profile ? STATUS_MESSAGES[profile.account_status] : undefined;

  return (
    <main
      id="main-content"
      className={`${styles.surface} flex min-h-screen items-center justify-center px-5 py-10`}
    >
      <section className="w-full max-w-md rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-xl">
        <FazooMark />
        <h1 className="mt-6 text-2xl font-semibold text-ink">
          {message?.title ?? 'Your workspace is not available yet'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {message?.description ??
            'We could not confirm your workspace access. Try again or contact your organization administrator.'}
        </p>
        <Link
          href="/sign-in"
          prefetch={false}
          className="mt-6 inline-flex min-h-12 items-center font-semibold text-deep underline underline-offset-4"
        >
          Check access again
        </Link>
        <form action={signOutAction} className="mt-4">
          <Button type="submit" className="w-full" size="lg">
            Sign out
          </Button>
        </form>
      </section>
    </main>
  );
}
