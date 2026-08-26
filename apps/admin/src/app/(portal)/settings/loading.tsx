export default function SettingsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-28 rounded bg-ink/8" />
      <div className="h-4 w-48 rounded bg-ink/5" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-ink/8 bg-ink/3 p-5">
            <div className="mb-3 h-4 w-32 rounded bg-ink/8" />
            <div className="h-4 w-48 rounded bg-ink/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
