export default function PortalLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 rounded bg-ink/8" />
      <div className="h-4 w-72 rounded bg-ink/5" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-ink/5" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-ink/5" />
    </div>
  );
}
