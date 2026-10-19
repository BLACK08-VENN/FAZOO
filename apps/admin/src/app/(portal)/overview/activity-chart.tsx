import type { LogRow } from '@/lib/logs-query';

export function ActivityChart({
  rows,
  from,
  to,
}: {
  rows: LogRow[];
  from: string;
  to: string;
}) {
  // Show the last seven calendar days in the selected range, including zero days.
  const end = Date.parse(`${to}T00:00:00Z`);
  const start = Math.max(Date.parse(`${from}T00:00:00Z`), end - 6 * 86_400_000);
  const days = [];
  for (let time = start; time <= end; time += 86_400_000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const logs = rows.filter((row) => row.attendance_date === date);
    days.push({
      date,
      checkins: logs.filter((row) => row.checkin_at).length,
      reports: logs.filter(
        (row) => row.status === 'completed' && row.attendance_status === 'present',
      ).length,
    });
  }
  const maximum = Math.max(1, ...days.flatMap((day) => [day.checkins, day.reports]));
  return (
    <div className="p-5">
      <h2 className="font-semibold">Weekly activity</h2>
      <p className="mt-1 text-xs text-muted">
        Last seven days of the selected range · completed attendance reports
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted">
        <span>
          <span className="mr-2 inline-block size-2 rounded-full bg-primary" />
          Check-ins
        </span>
        <span>
          <span className="mr-2 inline-block size-2 rounded-full bg-purple-300" />
          Reports submitted
        </span>
      </div>
      <div className="mt-5 flex h-44 items-end gap-3 border-b border-ink/10" aria-hidden="true">
        {days.map((day) => (
          <div
            key={day.date}
            className="flex h-full min-w-0 flex-1 items-end justify-center gap-1"
          >
            <div
              className="w-5 rounded-t bg-primary"
              style={{ height: `${(day.checkins / maximum) * 100}%` }}
              title={`${day.checkins} check-ins`}
            />
            <div
              className="w-5 rounded-t bg-purple-300"
              style={{ height: `${(day.reports / maximum) * 100}%` }}
              title={`${day.reports} reports`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-center text-[10px] text-muted" aria-hidden="true">
        {days.map((day) => (
          <span key={day.date} className="min-w-0 flex-1">
            {day.date.slice(5)}
          </span>
        ))}
      </div>
      <details className="mt-4 text-xs">
        <summary className="cursor-pointer text-primary">View activity counts</summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">Daily check-ins and completed reports</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Check-ins</th>
              <th scope="col">Reports</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <th scope="row" className="py-1 font-normal">
                  {day.date}
                </th>
                <td>{day.checkins}</td>
                <td>{day.reports}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
