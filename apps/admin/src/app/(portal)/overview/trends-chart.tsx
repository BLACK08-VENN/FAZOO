'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface TrendPoint {
  day: string;
  units: number;
  completionPct: number;
}

interface TooltipPayloadItem {
  dataKey: string;
  name: string;
  value: number;
  color: string;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink/10 bg-white px-3 py-2 shadow-lg" role="tooltip">
      <p className="mb-1 text-xs font-semibold text-ink">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: {entry.dataKey === 'completionPct' ? `${entry.value}%` : entry.value}
        </p>
      ))}
    </div>
  );
}

function formatTick(d: string) {
  const parts = d.split('-');
  if (parts.length === 3 && parts[1] && parts[2]) return `${parts[1]}/${parts[2].slice(0, 2)}`;
  return d;
}

export function TrendsChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted">No activity in this range.</p>
    );
  }

  const avgUnits = Math.round(data.reduce((s, d) => s + d.units, 0) / data.length);
  const avgCompletion = Math.round(
    data.reduce((s, d) => s + d.completionPct, 0) / data.length,
  );

  return (
    <div className="w-full px-2 pb-4">
      <div className="mb-3 flex flex-wrap gap-4 px-3 text-xs text-muted">
        <span>
          Avg units/day: <strong className="text-ink">{avgUnits}</strong>
        </span>
        <span>
          Avg completion: <strong className="text-ink">{avgCompletion}%</strong>
        </span>
        <span>
          Data points: <strong className="text-ink">{data.length}</strong>
        </span>
      </div>
      <div className="h-72" role="img" aria-label="Line chart showing sales units and completion percentage trends over time">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#17171c14" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: '#6b6472' }}
              tickFormatter={formatTick}
              interval={data.length > 14 ? Math.floor(data.length / 7) : 0}
              aria-label="Date"
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: '#6b6472' }}
              allowDecimals={false}
              aria-label="Units sold"
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: '#6b6472' }}
              unit="%"
              aria-label="Completion percentage"
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              yAxisId="left"
              type="monotone"
              name="Units sold"
              dataKey="units"
              stroke="#7B2FBE"
              strokeWidth={2}
              dot={data.length <= 14}
              activeDot={{ r: 4, fill: '#7B2FBE', stroke: '#fff', strokeWidth: 2 }}
              animationDuration={600}
            />
            <Line
              yAxisId="right"
              type="monotone"
              name="Completion %"
              dataKey="completionPct"
              stroke="#22C55E"
              strokeWidth={2}
              dot={data.length <= 14}
              activeDot={{ r: 4, fill: '#22C55E', stroke: '#fff', strokeWidth: 2 }}
              animationDuration={600}
              animationBegin={200}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
