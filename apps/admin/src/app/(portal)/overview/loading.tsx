export default function OverviewLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-36 rounded bg-ink/8" />
      <div className="h-4 w-64 rounded bg-ink/5" />
      <div className="mb-6 h-12 rounded-xl border border-ink/8 bg-ink/3" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-ink/5" />
        ))}
      </div>
      <div className="mt-6 rounded-xl bg-ink/5 p-5">
        <div className="mb-3 h-4 w-40 rounded bg-ink/8" />
        <div className="h-48 rounded bg-ink/5" />
      </div>
    </div>
  );
}
