export default function DailyLogsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-36 rounded bg-ink/8" />
      <div className="h-4 w-56 rounded bg-ink/5" />
      <div className="mb-4 h-12 rounded-xl border border-ink/8 bg-ink/3" />
      <div className="rounded-xl bg-ink/5 p-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 w-20 rounded bg-ink/8" />
              <div className="h-4 w-32 rounded bg-ink/5" />
              <div className="h-4 w-16 rounded bg-ink/5" />
              <div className="h-4 w-24 rounded bg-ink/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
