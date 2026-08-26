export default function BrandAmbassadorsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-52 rounded bg-ink/8" />
      <div className="h-4 w-64 rounded bg-ink/5" />
      <div className="rounded-xl bg-ink/5 p-4">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 w-32 rounded bg-ink/8" />
              <div className="h-4 w-24 rounded bg-ink/5" />
              <div className="h-4 w-16 rounded bg-ink/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
