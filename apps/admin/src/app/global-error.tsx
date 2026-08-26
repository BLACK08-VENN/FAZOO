'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-lavender px-4">
          <div className="w-full max-w-md rounded-xl border border-ink/8 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bad/10">
              <span className="text-xl font-bold text-bad">!</span>
            </div>
            <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted">
              An unexpected error occurred. Please try again.
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-xs text-muted">Error: {error.digest}</p>
            )}
            <button
              onClick={reset}
              className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
