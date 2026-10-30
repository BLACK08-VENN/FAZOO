import Link from 'next/link';
import { FazooMark } from '@/components/fazoo-mark';
import styles from '../sign-in/sign-in.module.css';

export const metadata = { title: 'Account recovery — Fazoo' };

export default function ForgotPasswordPage() {
  return (
    <main
      id="main-content"
      className={`${styles.surface} flex min-h-screen items-center justify-center px-5 py-10`}
    >
      <section className="w-full max-w-md rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-xl">
        <FazooMark />
        <h1 className="mt-6 text-2xl font-semibold text-ink">Recover your account</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Contact your organization administrator to request a password reset. Share the email
          or phone number you registered with so they can find your account.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">
          Never share your password. If you have not received access yet, ask your administrator
          to check your account approval.
        </p>
        <Link
          href="/sign-in"
          className="mt-7 inline-flex min-h-12 items-center font-semibold text-deep underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
