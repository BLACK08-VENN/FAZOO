import { Input, Label, Select } from '@/components/ui/input';

export interface FilterOption {
  id: string;
  label: string;
}

/**
 * URL-encoded filters — the form submits via GET so every filter state is
 * shareable, bookmarkable and reflected in CSV exports automatically.
 */
export function LogFiltersForm({
  action,
  campaigns,
  bas,
  stores,
  current,
}: {
  action: string;
  campaigns: FilterOption[];
  bas: FilterOption[];
  stores: FilterOption[];
  current: Record<string, string | undefined>;
}) {
  return (
    <form
      method="get"
      action={action}
      role="search"
      aria-label="Filter daily logs"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-7"
    >
      <div>
        <Label htmlFor="f-preset">Range</Label>
        <Select id="f-preset" name="preset" defaultValue={current.preset ?? '30d'}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="custom">Custom</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="f-from">From</Label>
        <Input id="f-from" name="from" type="date" defaultValue={current.from ?? ''} />
      </div>
      <div>
        <Label htmlFor="f-to">To</Label>
        <Input id="f-to" name="to" type="date" defaultValue={current.to ?? ''} />
      </div>
      <div>
        <Label htmlFor="f-campaign">Campaign</Label>
        <Select id="f-campaign" name="campaign_id" defaultValue={current.campaign_id ?? ''}>
          <option value="">All</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="f-ba">Brand Ambassador</Label>
        <Select id="f-ba" name="ba_id" defaultValue={current.ba_id ?? ''}>
          <option value="">All</option>
          {bas.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="f-store">Store</Label>
        <Select id="f-store" name="store_id" defaultValue={current.store_id ?? ''}>
          <option value="">All</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="f-status">Status</Label>
          <Select
            id="f-status"
            name="attendance_status"
            defaultValue={current.attendance_status ?? ''}
          >
            <option value="">All</option>
            <option value="present">Present</option>
            <option value="sick_leave">Sick leave</option>
            <option value="weekly_off">Weekly off</option>
            <option value="absent">Absent</option>
          </Select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Apply
        </button>
      </div>
      {/* preserve completion/sku across submissions */}
      <input type="hidden" name="completion_status" value={current.completion_status ?? ''} />
      <input type="hidden" name="sku_id" value={current.sku_id ?? ''} />
    </form>
  );
}
