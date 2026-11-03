import Link from 'next/link';
import { notFound } from 'next/navigation';

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  )
    notFound();
  return (
    <>
      <nav
        aria-label="Workspace navigation"
        className="no-print flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/10 bg-[#15223e] px-4 py-3 text-[11px] text-[#e8e4f3] sm:px-8"
      >
        <Link
          href="/maintenance-preview/expansion"
          className="inline-flex min-h-9 items-center font-semibold text-[#d5c4ee] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Workspaces
        </Link>
        <Link
          href="/sign-in"
          className="inline-flex min-h-9 items-center hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Sign in
        </Link>
        <Link
          href="/maintenance-preview/style"
          className="inline-flex min-h-9 items-center hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Operations
        </Link>
        <Link
          href="/maintenance-preview"
          className="inline-flex min-h-9 items-center hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Maintenance
        </Link>
        <Link
          href="/maintenance-preview/hanan"
          className="inline-flex min-h-9 items-center hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Hanan retail
        </Link>
        <Link
          href="/maintenance-preview/airtel"
          className="inline-flex min-h-9 items-center hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Airtel maintenance
        </Link>
      </nav>
      {children}
    </>
  );
}
