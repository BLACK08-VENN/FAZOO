
export default function NotAuthorized() {
  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-lavender px-4">
      <div className="w-full max-w-md rounded-xl border border-ink/8 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bad/10">
          <span className="text-xl font-bold text-bad">✕</span>
        </div>
        <h1 className="text-lg font-semibold text-ink">Not authorized</h1>
        <p className="mt-2 text-sm text-muted">
          This portal is for approved Fazoo staff. Brand Ambassadors use the
          mobile app; if you believe you should have access, contact your
          administrator.
        </p>
      </div>
    </main>
  );
}

export function generateMetadata() {
  return { title: 'Not authorized — Fazoo Admin' };
}
