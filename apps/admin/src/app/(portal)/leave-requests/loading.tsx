export default function LeaveRequestsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-44 rounded bg-ink/8" />
      <div className="h-4 w-64 rounded bg-ink/5" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-28 rounded-full bg-ink/8" />
        ))}
      </div>
      <div className="rounded-xl bg-ink/5 p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-2 h-12 rounded-lg bg-ink/8" />
        ))}
      </div>
    </div>
  );
}