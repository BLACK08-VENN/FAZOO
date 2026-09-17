'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { submitLeaveRequest, initialLeaveFormState } from './actions';

export type LeaveAssignment = {
  id: string;
  label: string;
};

const fieldClass =
  'mt-1 min-h-11 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

export function LeaveForm({ assignments }: { assignments: LeaveAssignment[] }) {
  const [state, formAction, pending] = useActionState(
    submitLeaveRequest,
    initialLeaveFormState,
  );
  const [supervisorInformed, setSupervisorInformed] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setSupervisorInformed(true);
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      <fieldset disabled={pending || assignments.length === 0} className="space-y-6 disabled:opacity-70">
        <div>
          <label htmlFor="assignment_id" className="text-sm font-semibold text-ink">Assignment</label>
          <select id="assignment_id" name="assignment_id" className={fieldClass} required defaultValue="">
            <option value="" disabled>Choose an assignment</option>
            {assignments.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>{assignment.label}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="leave_type" className="text-sm font-semibold text-ink">Type of leave</label>
            <select id="leave_type" name="leave_type" className={fieldClass} defaultValue="annual_leave" required>
              <option value="annual_leave">Annual leave</option>
              <option value="sick_leave">Sick leave</option>
              <option value="paternity_leave">Paternity leave</option>
              <option value="maternity_leave">Maternity leave</option>
              <option value="casual_leave">Casual leave</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="start_date" className="text-sm font-semibold text-ink">Start date</label>
            <input id="start_date" name="start_date" type="date" className={fieldClass} required />
          </div>
          <div>
            <label htmlFor="end_date" className="text-sm font-semibold text-ink">End date</label>
            <input id="end_date" name="end_date" type="date" className={fieldClass} required />
          </div>
          <div>
            <label htmlFor="expected_return_date" className="text-sm font-semibold text-ink">Expected return date</label>
            <input id="expected_return_date" name="expected_return_date" type="date" className={fieldClass} required />
          </div>
        </div>

        <div className="rounded-xl border border-ink/10 bg-ink/[0.02] p-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-ink">
            <input
              name="supervisor_informed"
              type="checkbox"
              defaultChecked
              onChange={(event) => setSupervisorInformed(event.target.checked)}
              className="size-5 accent-primary"
            />
            I have informed my supervisor
          </label>
          {!supervisorInformed ? (
            <div className="mt-3">
              <label htmlFor="supervisor_not_informed_reason" className="text-sm font-semibold text-ink">Why has your supervisor not been informed?</label>
              <textarea id="supervisor_not_informed_reason" name="supervisor_not_informed_reason" rows={3} className={fieldClass} required minLength={5} maxLength={500} />
            </div>
          ) : null}
        </div>

        <div>
          <label htmlFor="reason" className="text-sm font-semibold text-ink">Reason for leave</label>
          <textarea id="reason" name="reason" rows={4} className={fieldClass} required minLength={5} maxLength={2000} placeholder="Give the reviewing admin the necessary details." />
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-ink">Supporting documents available</legend>
          <p className="mt-1 text-xs text-muted">Select all that apply. Do not combine “Not applicable” with another option.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              ['medical_report', 'Medical report'],
              ['hospital_card', 'Hospital card'],
              ['travel_confirmation', 'Travel confirmation'],
              ['other_supporting_document', 'Other supporting document'],
              ['not_applicable', 'Not applicable'],
            ].map(([value, label]) => (
              <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink">
                <input name="supporting_document_types" type="checkbox" value={value} className="size-4 accent-primary" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-lavender/50 p-4 text-sm leading-5 text-ink">
          <input name="policy_acknowledged" type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" required />
          <span>I confirm these details are accurate and understand that my leave is not approved until an admin confirms it.</span>
        </label>
      </fieldset>

      {assignments.length === 0 ? (
        <p role="alert" className="rounded-lg bg-warn/10 px-4 py-3 text-sm font-medium text-warn">No active assignment is available. Ask an admin to assign you before applying for leave.</p>
      ) : null}
      {state.error ? <p role="alert" className="rounded-lg bg-bad/10 px-4 py-3 text-sm font-medium text-bad">{state.error}</p> : null}
      {state.success ? <p role="status" className="rounded-lg bg-ok/10 px-4 py-3 text-sm font-medium text-ok">{state.success}</p> : null}

      <Button type="submit" size="lg" disabled={pending || assignments.length === 0} className="w-full sm:w-auto">
        <Send size={16} aria-hidden="true" />
        {pending ? 'Sending…' : 'Send leave request'}
      </Button>
    </form>
  );
}
