import { Label, Select } from '@/components/ui/input';

export interface BrandOption {
  id: string;
  name: string;
}

/**
 * GET-submitting brand selector. Every selection is reflected in the URL
 * (`?org=<id>`) so it is shareable and bookmarkable. RLS already restricts the
 * supplied org list to the brands the current staff member may read.
 */
export function BrandPicker({
  action,
  brands,
  current,
}: {
  action: string;
  brands: BrandOption[];
  current?: string;
}) {
  return (
    <form method="get" action={action} role="search" aria-label="Select brand">
      <div className="flex max-w-md items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="org">Brand</Label>
          <Select id="org" name="org" defaultValue={current ?? ''}>
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          View
        </button>
      </div>
    </form>
  );
}
