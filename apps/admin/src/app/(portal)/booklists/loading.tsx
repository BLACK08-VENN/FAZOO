export default function BooklistsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-44 rounded bg-ink/8" />
      <div className="h-4 w-72 rounded bg-ink/5" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-ink/5" />
        ))}
      </div>
      <div className="rounded-xl bg-ink/5 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-ink/8" />
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-ink/5 p-5">
        <div className="mb-3 h-4 w-48 rounded bg-ink/8" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-2 h-10 rounded-lg bg-ink/8" />
        ))}
      </div>
    </div>
  );
}