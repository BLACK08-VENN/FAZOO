export default function CampaignDetailLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 rounded bg-ink/8" />
      <div className="h-4 w-72 rounded bg-ink/5" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-ink/5 p-4">
            <div className="h-3 w-16 rounded bg-ink/8" />
            <div className="mt-2 h-7 w-12 rounded bg-ink/8" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-ink/5 p-4">
          <div className="h-4 w-32 rounded bg-ink/8" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 w-full rounded bg-ink/5" />
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-ink/5 p-4">
          <div className="h-4 w-24 rounded bg-ink/8" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 w-full rounded bg-ink/5" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
