'use client';

import { useActionState } from 'react';
import { addBaAction, type AddBaState } from './actions';
import { weeklyOffDayName, WEEKDAY_NAMES } from '@fazoo/config';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';

const initialState: AddBaState = { error: null };

export type BaLookup = {
  campaigns: { id: string; name: string }[];
  stores: { id: string; name: string }[];
};

export function AddBaForm({ campaigns, stores }: BaLookup) {
  const [state, formAction, pending] = useActionState(addBaAction, initialState);

  return (
    <Card>
      <CardHeader
        title="Add a Brand Ambassador"
        description="Creates a login and assigns them to a campaign + store."
      />
      <CardBody className="space-y-3">
        {state.created ? (
          <div className="space-y-3">
            <p className="text-sm text-ok" role="status">
              {state.created.full_name} added successfully.
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              <li>
                Login: <code className="text-charcoal">{state.created.phone}</code>
              </li>
              <li>
                Password: <code className="text-charcoal">{state.created.password}</code>
              </li>
            </ul>
            <p className="text-xs text-muted">
              Share these credentials securely with the BA. The password is shown once.
            </p>
          </div>
        ) : (
          <form action={formAction} className="space-y-3">
            <div>
              <Label htmlFor="ba-name">Full name</Label>
              <Input
                id="ba-name"
                name="full_name"
                placeholder="As shown on their ID"
                required
              />
            </div>
            <div>
              <Label htmlFor="ba-phone">Mobile number</Label>
              <Input
                id="ba-phone"
                name="phone"
                placeholder="+234 803 123 4567"
                inputMode="tel"
                required
              />
            </div>
            <div>
              <Label htmlFor="ba-campaign">Campaign</Label>
              <Select id="ba-campaign" name="campaign_id" required>
                <option value="">Select campaign…</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ba-store">Store</Label>
              <Select id="ba-store" name="store_id" required>
                <option value="">Select store…</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ba-off">Weekly off-day</Label>
              <Select id="ba-off" name="weekly_off_day" defaultValue="0">
                {WEEKDAY_NAMES.map((d, i) => (
                  <option key={d} value={i}>
                    {weeklyOffDayName(i)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ba-start">Effective from</Label>
                <Input id="ba-start" name="start_date" type="date" required />
              </div>
              <div>
                <Label htmlFor="ba-end">End (optional)</Label>
                <Input id="ba-end" name="end_date" type="date" />
              </div>
            </div>
            {state.error ? (
              <p
                role="alert"
                className="rounded-lg bg-bad/10 px-3 py-2 text-sm font-medium text-bad"
              >
                {state.error}
              </p>
            ) : null}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? 'Adding BA…' : 'Add BA'}
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
