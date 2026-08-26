import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-lavender px-4">
      <div className="w-full max-w-md rounded-xl border border-ink/8 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <span className="text-xl font-bold text-primary">404</span>
        </div>
        <h1 className="text-lg font-semibold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-muted">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/overview"
          className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Go to Overview
        </Link>
      </div>
    </main>
  );
}

export function generateMetadata() {
  return { title: 'Not found — Fazoo Admin' };
}
