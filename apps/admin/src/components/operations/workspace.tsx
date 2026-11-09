'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { browserSupabase } from '@fazoo/database/browser';
import { lagosDate, lagosDateTime, lagosDateTimeToUtc } from '@fazoo/config';
import { PageHeader, StatCard } from '@/components/page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { mutateOperations } from '@/app/operations/actions';
import {
  commandSchema,
  dailyTasks,
  kinds,
  labels,
  states,
  type Command,
  type Task,
  type Workspace,
} from '@/lib/operations/model';
import { applyOperations } from '@/lib/operations/preview';

const furnitureKinds: Record<Task['kind'], string> = {
  task: 'After-sales service',
  delivery: 'Delivery',
  collection: 'Return collection',
  setup: 'Installation',
};

type Item = { name: string; quantity: number };
type Submit = (command: Command) => Promise<boolean>;
const lagosClock = {
  name: 'Lagos',
  day: lagosDate,
  display: lagosDateTime,
  toUtc: lagosDateTimeToUtc,
};
const nairobiClock: typeof lagosClock = {
  name: 'Nairobi',
  day: (time = new Date()) => nairobiClock.display(time).slice(0, 10),
  display: (time) =>
    new Date(new Date(time).getTime() + 3 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16)
      .replace('T', ' '),
  toUtc: (value) => new Date(`${value}:00+03:00`).toISOString(),
};
function Items({
  value,
  onChange,
  label,
}: {
  value: Item[];
  onChange: (value: Item[]) => void;
  label: string;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-2 rounded-xl border border-ink/10 p-3">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      {value.map((item, index) => (
        <div key={index} className="grid grid-cols-[1fr_90px_auto] items-end gap-2">
          <div>
            <Label htmlFor={`${id}-name-${index}`}>Item</Label>
            <Input
              id={`${id}-name-${index}`}
              required
              maxLength={120}
              value={item.name}
              onChange={(event) =>
                onChange(
                  value.map((row, at) =>
                    at === index ? { ...row, name: event.target.value } : row,
                  ),
                )
              }
            />
          </div>
          <div>
            <Label htmlFor={`${id}-qty-${index}`}>Quantity</Label>
            <Input
              id={`${id}-qty-${index}`}
              required
              type="number"
              min={1}
              max={1000000}
              step={1}
              value={item.quantity || ''}
              onChange={(event) =>
                onChange(
                  value.map((row, at) =>
                    at === index ? { ...row, quantity: Number(event.target.value) } : row,
                  ),
                )
              }
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Remove item ${index + 1}`}
            onClick={() => onChange(value.filter((_, at) => at !== index))}
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={value.length >= 30}
        onClick={() => onChange([...value, { name: '', quantity: 1 }])}
      >
        Add item
      </Button>
    </fieldset>
  );
}

export function OperationsWorkspace({
  initial,
  preview = false,
  furniture = false,
}: {
  initial: Workspace;
  preview?: boolean;
  furniture?: boolean;
}) {
  const [workspace, setWorkspace] = useState(initial);
  const title = furniture ? 'Furniture Rama · Deliveries & service' : 'Daily operations';
  const clock = furniture ? nairobiClock : lagosClock;
  const [date, setDate] = useState(() => (furniture ? '' : clock.day()));
  const [campaign, setCampaign] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState('');
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const visible = workspace.tasks.filter(
    (task) => workspace.viewer.can_manage || task.assigned_to === workspace.viewer.id,
  );
  const daily = dailyTasks(visible, furniture ? '' : date, campaign).filter(
    (task) => !furniture || !date || clock.day(task.due_at) === date,
  );
  const tasks = daily
    .filter((task) => !status || task.status === status)
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const task = tasks.find((item) => item.id === selected) ?? tasks[0];
  const submit: Submit = async (raw) => {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) {
      setMessage({
        error: true,
        text: parsed.error.issues[0]?.message ?? 'Check the required fields.',
      });
      return false;
    }
    setPending(true);
    setMessage(null);
    try {
      if (preview) {
        const next = applyOperations(workspace, parsed.data);
        setWorkspace((current) => ({ ...next, evidence_urls: current.evidence_urls }));
      } else {
        const key = JSON.stringify(parsed.data);
        if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
        const result = await mutateOperations({
          client_request_id: attempt.current.id,
          command: parsed.data,
        });
        if (result.error) {
          if ('saved' in result) attempt.current = null;
          throw new Error(result.error);
        }
        if (!result.workspace) throw new Error('Refresh to check the latest tasks.');
        setWorkspace(result.workspace);
      }
      attempt.current = null;
      setMessage({ error: false, text: 'Task updated successfully.' });
      return true;
    } catch (error) {
      setMessage({
        error: true,
        text: error instanceof Error ? error.message : 'Unable to save this update.',
      });
      return false;
    } finally {
      setPending(false);
    }
  };
  return (
    <main id="main-content" className="min-h-screen bg-lavender/30 text-ink">
      <div className="border-b border-ink/10 bg-deep px-5 py-4 text-white">
        <nav
          aria-label="Workspace"
          className="mx-auto flex max-w-7xl flex-wrap items-center gap-5 text-sm"
        >
          <Link href={preview ? '/maintenance-preview/expansion' : '/service-desk'}>
            {preview ? 'FAZOO · Workspaces' : 'FAZOO · Service desk'}
          </Link>
          <span className="font-semibold">{title}</span>
          {!preview ? (
            <Link href="/brand" className="ml-auto">
              My workspace
            </Link>
          ) : furniture ? null : (
            <Link href="/maintenance-preview/hanan" className="ml-auto">
              Retail workspace
            </Link>
          )}
        </nav>
      </div>
      <div className="mx-auto max-w-7xl p-4 sm:p-7">
        <PageHeader
          title={title}
          description={
            furniture
              ? 'Assign deliveries and installations, track damage or missing parts, and schedule return visits from blocked jobs.'
              : 'Coordinate tasks, deliveries and collections across your campaign teams.'
          }
        >
          {workspace.viewer.can_manage ? (
            <Button onClick={() => setCreating(!creating)}>
              {creating ? 'Close task form' : 'Allocate task'}
            </Button>
          ) : null}
        </PageHeader>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <p className="text-sm">
            Signed in as <strong>{workspace.viewer.name}</strong> ·{' '}
            {workspace.viewer.can_manage ? 'Operations manager' : 'My assignments'}
          </p>
          {preview ? (
            <>
              <Label htmlFor="ops-view" className="mb-0">
                View as
              </Label>
              <Select
                id="ops-view"
                className="w-auto"
                value={workspace.viewer.can_manage ? 'manager' : 'worker'}
                onChange={(event) => {
                  setWorkspace({
                    ...workspace,
                    viewer:
                      event.target.value === 'manager'
                        ? initial.viewer
                        : {
                            ...initial.workers[0]!,
                            organization_id: initial.viewer.organization_id,
                            can_manage: false,
                          },
                  });
                  setCreating(false);
                  setSelected('');
                  setMessage(null);
                }}
              >
                <option value="manager">Operations manager</option>
                <option value="worker">
                  {furniture ? 'Delivery & installation crew' : 'Field staff'}
                </option>
              </Select>
            </>
          ) : (
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          )}
        </div>
        {message ? (
          <div
            role={message.error ? 'alert' : 'status'}
            className={`mb-4 rounded-xl border p-3 text-sm ${message.error ? 'border-bad/40 bg-bad/5' : 'border-ink/10 bg-white'}`}
          >
            {message.text}
          </div>
        ) : null}
        {creating && workspace.viewer.can_manage ? (
          <CreateTask
            workspace={workspace}
            furniture={furniture}
            clock={clock}
            pending={pending}
            submit={submit}
            onClose={() => {
              setCreating(false);
              setStatus('');
              setDate('');
            }}
          />
        ) : null}
        <Card className="mb-5 grid gap-3 p-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="ops-date">Due date ({clock.name} time)</Label>
            <Input
              id="ops-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <Button variant="ghost" size="sm" onClick={() => setDate(date ? '' : clock.day())}>
              {date ? 'Show all dates' : 'Show today'}
            </Button>
          </div>
          <div>
            <Label htmlFor="ops-campaign">Campaign</Label>
            <Select
              id="ops-campaign"
              value={campaign}
              onChange={(event) => setCampaign(event.target.value)}
            >
              <option value="">All accessible campaigns</option>
              {workspace.campaigns.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ops-status">Status</Label>
            <Select
              id="ops-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {states.map((state) => (
                <option key={state} value={state}>
                  {labels[state]}
                </option>
              ))}
            </Select>
          </div>
        </Card>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Allocated tasks" value={daily.length} />
          <StatCard
            label="Completed"
            value={daily.filter((t) => t.status === 'completed').length}
          />
          <StatCard
            label="Blocked"
            value={daily.filter((t) => t.status === 'blocked').length}
          />
          <StatCard
            label="Awaiting review"
            value={daily.filter((t) => t.status === 'ready_for_review').length}
          />
        </div>
        <p className="mb-4 text-xs text-muted">
          Showing up to 250 recent accessible tasks. Counts follow the date and campaign
          filters; statuses filter the list below.
        </p>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(260px,1fr)_2fr]">
          <Card className="space-y-2 p-3">
            <h2 className="p-2 font-semibold">Tasks ({tasks.length})</h2>
            {!tasks.length ? (
              <p className="p-3 text-sm text-muted">
                No tasks match these filters. Try another date or campaign.
              </p>
            ) : (
              tasks.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded-xl border p-3 text-left ${task?.id === item.id ? 'border-primary bg-primary/5' : 'border-ink/10'}`}
                  onClick={() => setSelected(item.id)}
                  aria-pressed={task?.id === item.id}
                >
                  <span className="block text-xs text-muted">
                    {item.campaign_name} · {furniture ? furnitureKinds[item.kind] : item.kind}
                  </span>
                  <strong className="my-1 block text-sm">{item.title}</strong>
                  <span className="block text-xs">
                    {labels[item.status]} · {item.priority}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    Due {clock.display(item.due_at)}
                  </span>
                </button>
              ))
            )}
          </Card>
          {task ? (
            <Card className="space-y-5 p-4 sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase text-muted">
                  {task.campaign_name} · {furniture ? furnitureKinds[task.kind] : task.kind}
                </p>
                <h2 className="mt-1 text-xl font-semibold">{task.title}</h2>
                <p className="mt-2 text-sm">
                  {labels[task.status]} · {task.priority} priority · {task.assignee_name}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Due {clock.display(task.due_at)} ({clock.name})
                  {task.status !== 'completed' && Date.parse(task.due_at) < Date.now()
                    ? ' · Overdue'
                    : ''}
                </p>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-semibold">Origin</dt>
                  <dd>{task.origin || '—'}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Destination / location</dt>
                  <dd>{task.destination}</dd>
                </div>
              </dl>
              <p className="whitespace-pre-wrap text-sm">{task.instructions}</p>
              {task.items.length ? (
                <div>
                  <h3 className="text-sm font-semibold">Expected items</h3>
                  <ul className="mt-1 list-inside list-disc text-sm">
                    {task.items.map((item, index) => (
                      <li key={index}>
                        {item.name}: {item.quantity}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {task.completion_note ? (
                <div className="rounded-xl bg-lavender/50 p-3 text-sm">
                  <h3 className="font-semibold">Submitted completion</h3>
                  <p className="my-2 whitespace-pre-wrap">{task.completion_note}</p>
                  {task.recipient ? (
                    <p>Recipient acknowledgement recorded by staff: {task.recipient}</p>
                  ) : null}
                  <ul className="my-2 list-inside list-disc">
                    {task.actual_items.map((item, index) => (
                      <li key={index}>
                        {item.name}: {item.quantity}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-3">
                    {task.evidence.map((path, index) =>
                      workspace.evidence_urls[path] ? (
                        preview ? (
                          /* Local photo data URLs are rendered inline. */
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={path}
                            src={workspace.evidence_urls[path]}
                            alt={`Completion photo ${index + 1}`}
                            className="max-h-48 max-w-full rounded-lg object-contain"
                          />
                        ) : (
                          <a
                            key={path}
                            href={workspace.evidence_urls[path]}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            View photo {index + 1}
                          </a>
                        )
                      ) : (
                        <span key={path}>Photo {index + 1}: refresh to view</span>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
              <TaskActions
                key={`${task.id}:${task.version}:${workspace.viewer.id}`}
                task={task}
                workspace={workspace}
                submit={submit}
                pending={pending}
                preview={preview}
                furniture={furniture}
                clock={clock}
                onPhoto={(path, url) =>
                  setWorkspace((current) => ({
                    ...current,
                    evidence_urls: { ...current.evidence_urls, [path]: url },
                  }))
                }
              />
              <details>
                <summary className="cursor-pointer text-sm font-semibold">
                  Activity history ({task.events.length})
                </summary>
                <ol className="mt-3 space-y-3 text-sm">
                  {task.events.map((event) => (
                    <li key={event.id} className="border-l-2 border-primary/30 pl-3">
                      <p className="font-medium">
                        {event.actor_name} · {event.action}
                      </p>
                      <p className="whitespace-pre-wrap">{event.note}</p>
                      <p className="text-xs text-muted">{clock.display(event.created_at)}</p>
                    </li>
                  ))}
                </ol>
              </details>
            </Card>
          ) : null}
        </div>
        {preview ? (
          <p className="mt-8 text-xs text-muted">
            Interactive sample with fictional records. Changes stay in this tab.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function CreateTask({
  workspace,
  pending,
  submit,
  onClose,
  furniture,
  clock,
}: {
  workspace: Workspace;
  furniture: boolean;
  clock: typeof lagosClock;
  pending: boolean;
  submit: Submit;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Task['kind']>('task');
  const [items, setItems] = useState<Item[]>([]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const success = await submit({
      action: 'create',
      kind,
      campaign_id: String(form.get('campaign')),
      assigned_to: String(form.get('worker')),
      title: String(form.get('title')),
      instructions: String(form.get('instructions')),
      origin: String(form.get('origin')),
      destination: String(form.get('destination')),
      due_at: clock.toUtc(String(form.get('due'))),
      priority: String(form.get('priority')) as Task['priority'],
      items,
    });
    if (success) onClose();
  }
  return (
    <Card className="mb-5 p-4">
      <h2 className="mb-4 font-semibold">Allocate an operations task</h2>
      <form onSubmit={create}>
        <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="create-kind">Task type</Label>
            <Select
              id="create-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as Task['kind'])}
            >
              {kinds.map((value) => (
                <option key={value} value={value}>
                  {furniture ? furnitureKinds[value] : value[0]!.toUpperCase() + value.slice(1)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="create-campaign">Campaign</Label>
            <Select id="create-campaign" name="campaign" required defaultValue="">
              <option value="" disabled>
                Select campaign
              </option>
              {workspace.campaigns
                .filter((c) => c.status === 'active')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="create-worker">Assign to</Label>
            <Select id="create-worker" name="worker" required defaultValue="">
              <option value="" disabled>
                Select staff member
              </option>
              {workspace.workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="create-due">Due date and time ({clock.name})</Label>
            <Input id="create-due" name="due" type="datetime-local" required />
          </div>
          <div>
            <Label htmlFor="create-title">Task title</Label>
            <Input id="create-title" name="title" required minLength={5} maxLength={160} />
          </div>
          <div>
            <Label htmlFor="create-priority">Priority</Label>
            <Select id="create-priority" name="priority">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="create-origin">Origin</Label>
            <Input
              id="create-origin"
              name="origin"
              maxLength={240}
              minLength={['delivery', 'collection'].includes(kind) ? 3 : undefined}
              required={['delivery', 'collection'].includes(kind)}
            />
          </div>
          <div>
            <Label htmlFor="create-destination">Destination / work location</Label>
            <Input
              id="create-destination"
              name="destination"
              required
              minLength={3}
              maxLength={240}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="create-instructions">Instructions</Label>
            <textarea
              id="create-instructions"
              name="instructions"
              required
              minLength={5}
              maxLength={2000}
              className="fazoo-field min-h-24 w-full rounded-lg border p-3"
            />
          </div>
          <div className="sm:col-span-2">
            <Items value={items} onChange={setItems} label="Expected items and quantities" />
          </div>
          <Button
            type="submit"
            disabled={
              !workspace.campaigns.some((c) => c.status === 'active') ||
              !workspace.workers.length
            }
          >
            {pending ? 'Saving…' : 'Allocate task'}
          </Button>
        </fieldset>
      </form>
    </Card>
  );
}

function TaskActions({
  task,
  workspace,
  submit,
  pending,
  preview,
  furniture,
  clock,
  onPhoto,
}: {
  task: Task;
  workspace: Workspace;
  submit: Submit;
  pending: boolean;
  preview: boolean;
  furniture: boolean;
  clock: typeof lagosClock;
  onPhoto: (path: string, url: string) => void;
}) {
  const schedulingReturn = furniture && task.status === 'blocked';
  const [action, setAction] = useState<'in_progress' | 'blocked' | 'ready_for_review'>(
    task.status === 'in_progress' ? 'ready_for_review' : 'in_progress',
  );
  const [items, setItems] = useState<Item[]>(
    task.actual_items.length ? task.actual_items : task.items,
  );
  const [evidence, setEvidence] = useState(task.evidence);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadedFiles = useRef(new Set<File>());
  const busy = pending || uploading;
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    setUploading(true);
    try {
      const files = [...(fileInput.current?.files ?? [])].filter(
        (file) => !uploadedFiles.current.has(file),
      );
      if (evidence.length + files.length > 4)
        throw new Error('Attach up to four photos per task.');
      if (
        files.some(
          (file) =>
            !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
            file.size > 5242880,
        )
      )
        throw new Error('Use JPG, PNG or WebP photos up to 5 MB each.');
      const paths = [...evidence];
      for (const file of files) {
        const extension =
          file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${workspace.viewer.organization_id}/${task.campaign_id}/${task.id}/${crypto.randomUUID()}.${extension}`;
        if (preview) {
          const url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error('Unable to read photo.'));
            reader.readAsDataURL(file);
          });
          onPhoto(path, url);
        } else {
          const { error: uploadError } = await browserSupabase()
            .storage.from('operations-evidence')
            .upload(path, file, { contentType: file.type, upsert: false });
          if (uploadError)
            throw new Error('Photo upload failed. Your update has not been submitted.');
        }
        paths.push(path);
        uploadedFiles.current.add(file);
        setEvidence([...paths]);
      }
      if (fileInput.current) fileInput.current.value = '';
      await submit({
        action: 'update',
        task_id: task.id,
        expected_version: task.version,
        status: action,
        note: String(form.get('note')),
        recipient: String(form.get('recipient') ?? ''),
        actual_items: items,
        evidence: paths,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this update.');
    } finally {
      setUploading(false);
    }
  }
  const canUpdate =
    workspace.viewer.id === task.assigned_to &&
    ['assigned', 'in_progress', 'blocked'].includes(task.status);
  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
      {canUpdate ? (
        <form onSubmit={update}>
          <fieldset disabled={busy} className="space-y-3">
            <h3 className="font-semibold">Update my task</h3>
            <div>
              <Label htmlFor="task-status">Progress</Label>
              <Select
                id="task-status"
                value={action}
                onChange={(event) => setAction(event.target.value as typeof action)}
              >
                <option value="in_progress">
                  {task.status === 'blocked' ? 'Resume work' : 'Start / update work'}
                </option>
                {task.status !== 'assigned' ? (
                  <option value="blocked">Report an issue / blocked</option>
                ) : null}
                {task.status === 'in_progress' ? (
                  <option value="ready_for_review">Submit completion for review</option>
                ) : null}
              </Select>
            </div>
            <div>
              <Label htmlFor="task-note">
                {action === 'blocked'
                  ? 'What is blocking this task?'
                  : 'Work update / completion notes'}
              </Label>
              <textarea
                id="task-note"
                name="note"
                required
                minLength={5}
                maxLength={2000}
                className="fazoo-field min-h-24 w-full rounded-lg border p-3"
              />
            </div>
            {action === 'ready_for_review' ? (
              <>
                <Items
                  value={items}
                  onChange={setItems}
                  label="Actual delivered / collected items"
                />
                <div>
                  <Label htmlFor="task-recipient">
                    Recipient name acknowledging delivery / collection
                  </Label>
                  <Input
                    id="task-recipient"
                    name="recipient"
                    required={['delivery', 'collection'].includes(task.kind)}
                    minLength={['delivery', 'collection'].includes(task.kind) ? 2 : undefined}
                    maxLength={160}
                    defaultValue={task.recipient}
                  />
                  <p className="mt-1 text-xs text-muted">
                    Recorded by the staff member; this is not a digital signature.
                  </p>
                </div>
                <div>
                  <Label htmlFor="task-photos">Completion photos (up to 4, 5 MB each)</Label>
                  <input
                    ref={fileInput}
                    id="task-photos"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="w-full text-sm"
                  />
                  <p className="mt-2 text-xs text-muted">
                    {evidence.length} attached. Keep work notes clear if quantities differ.
                  </p>
                </div>
              </>
            ) : null}
            <Button type="submit">{busy ? 'Saving…' : 'Save progress'}</Button>
          </fieldset>
        </form>
      ) : null}
      {workspace.viewer.can_manage &&
      task.assigned_to !== workspace.viewer.id &&
      task.status === 'ready_for_review' ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            await submit({
              action: String(form.get('decision')) as 'approve' | 'reopen',
              task_id: task.id,
              expected_version: task.version,
              note: String(form.get('note')),
            });
          }}
        >
          <fieldset
            disabled={pending}
            className="space-y-3 rounded-xl border border-ink/10 p-3"
          >
            <h3 className="font-semibold">Review completion</h3>
            <Label htmlFor="review-note">Review note</Label>
            <Input id="review-note" name="note" required minLength={5} maxLength={2000} />
            <Label htmlFor="review-decision">Decision</Label>
            <Select id="review-decision" name="decision">
              <option value="approve">Approve completion</option>
              <option value="reopen">Return for follow-up</option>
            </Select>
            <Button type="submit">Save review</Button>
          </fieldset>
        </form>
      ) : null}
      {workspace.viewer.can_manage && ['assigned', 'blocked'].includes(task.status) ? (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            {schedulingReturn ? 'Schedule return visit' : 'Reassign task / adjust deadline'}
          </summary>
          <form
            className="mt-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await submit({
                action: 'assign',
                task_id: task.id,
                expected_version: task.version,
                assigned_to: String(form.get('worker')),
                due_at: clock.toUtc(String(form.get('due'))),
              });
            }}
          >
            <fieldset disabled={pending} className="space-y-3">
              <Label htmlFor="reassign-worker">Staff member</Label>
              <Select id="reassign-worker" name="worker" defaultValue={task.assigned_to}>
                {workspace.workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
              <Label htmlFor="reassign-due">New deadline ({clock.name})</Label>
              <Input
                id="reassign-due"
                name="due"
                type="datetime-local"
                required
                defaultValue={clock.display(task.due_at).replace(' ', 'T')}
              />
              <Button type="submit" variant="outline">
                {schedulingReturn ? 'Save return visit' : 'Save assignment'}
              </Button>
            </fieldset>
          </form>
        </details>
      ) : null}
      {task.status === 'ready_for_review' && workspace.viewer.id === task.assigned_to ? (
        <p className="text-sm text-muted">
          Waiting for an independent administrator to review this completion.
        </p>
      ) : null}
    </div>
  );
}
