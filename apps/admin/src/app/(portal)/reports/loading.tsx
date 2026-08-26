export default function ReportsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-28 rounded bg-ink/8" />
      <div className="h-4 w-52 rounded bg-ink/5" />
      <div className="rounded-xl bg-ink/5 p-4">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 w-28 rounded bg-ink/8" />
              <div className="h-4 w-20 rounded bg-ink/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
