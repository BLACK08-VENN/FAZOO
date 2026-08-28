'use client';

import { useActionState } from 'react';
import { createBrandAction, type CreateBrandState } from './actions';
import { weeklyOffDayName, WEEKDAY_NAMES } from '@fazoo/config';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';

const initialState: CreateBrandState = { error: null };

export type BaOption = { id: string; full_name: string; phone: string };

export function CreateBrandForm({ bas }: { bas: BaOption[] }) {
  const [state, formAction, pending] = useActionState(createBrandAction, initialState);

  return (
    <div className="space-y-6">
      {state.created ? (
        <Card>
          <CardHeader
            title="Brand created"
            description="Share these details with the new brand admin. The password is shown only once."
          />
          <CardBody className="space-y-4 text-sm">
            <ul className="space-y-1.5 list-disc pl-5">
              <li>
                Brand: <span className="font-medium">{state.created.organization_slug}</span>
              </li>
              <li>
                Brand admin login: <span className="font-medium">{state.created.admin_email}</span>
                {' / '}
                <code>{state.created.admin_password}</code>
              </li>
              {state.created.access_code ? (
                <li>
                  BA access code: <code>{state.created.access_code}</code>
                </li>
              ) : null}
              <li>
                BAs linked: <span className="font-medium">{state.created.bas_linked}</span>
                {state.created.assignments_created > 0
                  ? ` · assignments created: ${state.created.assignments_created}`
                  : ''}
              </li>
            </ul>
            <p className="text-xs text-muted">
              Save the brand admin credentials now — they cannot be recovered later.
            </p>
          </CardBody>
        </Card>
      ) : (
        <form action={formAction} className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Brand" description="The organization (tenant)." />
            <CardBody className="space-y-3">
              <div>
                <Label htmlFor="name">Brand name</Label>
                <Input id="name" name="name" placeholder="Acme Retail" required />
              </div>
              <div>
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" name="slug" placeholder="acme-retail" required />
              </div>
              <div>
                <Label htmlFor="access_code">BA access code (optional)</Label>
                <Input id="access_code" name="access_code" placeholder="ACME-DEMO" />
                <p className="mt-1 text-xs text-muted">Leave blank for an open brand.</p>
              </div>
              <div>
                <Label htmlFor="timezone">Timezone</Label>
                <Input id="timezone" name="timezone" defaultValue="Africa/Lagos" />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Brand admin" description="An org-admin login for the new brand." />
            <CardBody className="space-y-3">
              <div>
                <Label htmlFor="admin_name">Full name</Label>
                <Input id="admin_name" name="admin_name" required />
              </div>
              <div>
                <Label htmlFor="admin_email">Email (login)</Label>
                <Input id="admin_email" name="admin_email" type="email" required />
              </div>
              <div>
                <Label htmlFor="admin_phone">Mobile</Label>
                <Input id="admin_phone" name="admin_phone" placeholder="+234 803 123 4567" required />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Campaign" description="First campaign for the new brand." />
            <CardBody className="space-y-3">
              <div>
                <Label htmlFor="campaign_name">Campaign name</Label>
                <Input id="campaign_name" name="campaign_name" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="campaign_start">Start</Label>
                  <Input id="campaign_start" name="campaign_start" type="date" required />
                </div>
                <div>
                  <Label htmlFor="campaign_end">End</Label>
                  <Input id="campaign_end" name="campaign_end" type="date" />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="First store (optional)" description="Lets linked BAs get assignments immediately." />
            <CardBody className="space-y-3">
              <div>
                <Label htmlFor="store_name">Store name</Label>
                <Input id="store_name" name="store_name" />
              </div>
              <div>
                <Label htmlFor="store_address">Address</Label>
                <Input id="store_address" name="store_address" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="store_lat">Latitude</Label>
                  <Input id="store_lat" name="store_lat" type="number" step="any" />
                </div>
                <div>
                  <Label htmlFor="store_lng">Longitude</Label>
                  <Input id="store_lng" name="store_lng" type="number" step="any" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="store_radius">Radius (m)</Label>
                  <Input id="store_radius" name="store_radius" type="number" defaultValue="200" />
                </div>
                <div>
                  <Label htmlFor="weekly_off_day">BA weekly off</Label>
                  <Select id="weekly_off_day" name="weekly_off_day" defaultValue="0">
                    {WEEKDAY_NAMES.map((d, i) => (
                      <option key={d} value={i}>{weeklyOffDayName(i)}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Add BAs" description="Link existing approved Brand Ambassadors to the new brand." />
            <CardBody className="space-y-3">
              {bas.length === 0 ? (
                <p className="text-sm text-muted">No approved Brand Ambassadors are available in your scope.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {bas.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm hover:bg-lavender/40"
                    >
                      <input
                        type="checkbox"
                        name="ba_ids"
                        value={b.id}
                        className="h-4 w-4 rounded border-ink/20 accent-primary"
                      />
                      <span className="truncate">{b.full_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {state.error ? (
            <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm font-medium text-bad lg:col-span-2">
              {state.error}
            </p>
          ) : null}

          <div className="lg:col-span-2">
            <Button type="submit" disabled={pending} className="w-full lg:w-auto">
              {pending ? 'Creating brand…' : 'Create brand'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
