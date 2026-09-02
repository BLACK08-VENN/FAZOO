'use client';

import { useActionState } from 'react';
import { addBaAction, type AddBaState } from './actions';
import { WEEKDAY_NAMES } from '@fazoo/config';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';

const initialState: AddBaState = { error: null };

export function AddBaForm() {
  const [state, formAction, pending] = useActionState(addBaAction, initialState);

  return (
    <Card>
      <CardHeader
        title="Add a Brand Ambassador"
        description="Creates a login. Assign the BA to campaigns and stores afterwards."
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
            <fieldset>
              <legend className="text-sm font-medium text-ink">Weekly off-days</legend>
              <p className="mb-2 mt-0.5 text-xs text-muted">
                Select one or more days the BA is off each week.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {WEEKDAY_NAMES.map((d, i) => (
                  <label
                    key={d}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-primary/20 bg-white px-3 py-2 text-sm text-charcoal has-[:checked]:border-primary has-[:checked]:bg-lavender"
                  >
                    <input
                      type="checkbox"
                      name="weekly_off_day"
                      value={i}
                      className="size-4 accent-primary"
                    />
                    {d.slice(0, 3)}
                  </label>
                ))}
              </div>
            </fieldset>
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
