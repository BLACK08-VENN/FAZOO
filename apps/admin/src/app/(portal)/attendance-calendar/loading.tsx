export default function AttendanceCalendarLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-44 rounded bg-ink/8" />
      <div className="h-4 w-64 rounded bg-ink/5" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-ink/5" />
        ))}
      </div>
      <div className="h-10 rounded-xl bg-ink/5" />
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-lg bg-ink/5" />
        ))}
      </div>
    </div>
  );
}