'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  Clock3,
  ClipboardList,
  Home,
  MapPin,
  Play,
  UserRound,
} from 'lucide-react';
import { formatLagosDisplay } from '@fazoo/config';
import { WorkspaceBrand } from '@/components/workspace-brand';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import {
  applyWorkerCommand,
  initialWorkerSession,
  nextAction,
  personas,
  statusLabels,
  workerSessionSchema,
  type Assignment,
  type Persona,
  type WorkerCommand,
  type WorkerSession,
} from '@/lib/worker-preview/model';

const storageKey = 'fazoo-personal-workspace-v1';
const tabs = ['Home', 'My work', 'Notifications', 'Profile'] as const;
type Tab = (typeof tabs)[number];
const icons = {
  Home,
  'My work': ClipboardList,
  Notifications: Bell,
  Profile: UserRound,
};
const when = (at: string) => formatLagosDisplay(at);
const active = (j: Assignment) =>
  ['acknowledged', 'arrived', 'in_progress', 'awaiting_parts'].includes(
    j.status,
  );
function StatusBadge({ job }: { job: Assignment }) {
  return (
    <Badge
      tone={
        job.status === 'new'
          ? 'purple'
          : job.status === 'completed'
            ? 'success'
            : job.status === 'awaiting_parts' ||
                job.status === 'reassignment_requested'
              ? 'warning'
              : 'neutral'
      }
    >
      {statusLabels[job.status]}
    </Badge>
  );
}
function Priority({ job }: { job: Assignment }) {
  return (
    <Badge
      tone={
        job.priority === 'Urgent'
          ? 'danger'
          : job.priority === 'High'
            ? 'warning'
            : 'neutral'
      }
    >
      {job.priority} priority
    </Badge>
  );
}
async function readPhoto(file: File): Promise<string> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 5000000
  )
    throw new Error('Choose a JPEG, PNG or WebP photo under 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Photo could not be prepared.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/jpeg', 0.5);
    if (result.length > 160000)
      throw new Error('This photo is too detailed. Choose a smaller photo.');
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
function AssignmentCard({
  job,
  open,
}: {
  job: Assignment;
  open: (id: string) => void;
}) {
  return (
    <Card
      className={job.priority === 'Urgent' ? 'border-l-4' : ''}
      style={{
        borderLeftColor:
          job.priority === 'Urgent' ? 'var(--color-bad)' : undefined,
      }}
    >
      <CardBody>
        <div className="mb-3 flex flex-wrap justify-between gap-2">
          <Priority job={job} />
          <StatusBadge job={job} />
        </div>
        <h3 className="text-sm font-semibold leading-6 text-ink">
          {job.title}
        </h3>
        <p className="mt-2 flex items-center gap-2 text-xs text-muted">
          <MapPin size={14} aria-hidden="true" />
          {job.location}
        </p>
        <p className="mt-3 text-xs text-muted">Due {when(job.dueAt)}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full sm:w-auto"
          onClick={() => open(job.id)}
        >
          {nextAction(job)}
          <ArrowUpRight size={15} aria-hidden="true" />
        </Button>
      </CardBody>
    </Card>
  );
}
function AssignmentDetails({
  job,
  send,
  back,
}: {
  job: Assignment;
  send: (c: WorkerCommand) => boolean;
  back: () => void;
}) {
  const [note, setNote] = useState('');
  const [reassign, setReassign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tech = job.persona === 'Technician';
  function notes(
    action: 'submit' | 'block' | 'resume' | 'requestReassignment',
  ) {
    if (note.trim().length < (action === 'submit' ? 10 : 5)) {
      setError(
        action === 'submit'
          ? 'Add a completion summary of at least 10 characters.'
          : 'Add a reason or update of at least 5 characters.',
      );
      return;
    }
    setError('');
    if (send({ action, id: job.id, note: note.trim() })) setNote('');
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    notes('submit');
  }
  return (
    <div>
      <Button type="button" variant="ghost" className="mb-4" onClick={back}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back to my work
      </Button>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Priority job={job} />
        <StatusBadge job={job} />
      </div>
      <h1 className="max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
        {job.title}
      </h1>
      <p className="mt-3 text-xs text-muted">
        {job.company} · Assigned by {job.supervisor}
      </p>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardBody>
              <h2 className="text-sm font-semibold">Assignment details</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted">Location</dt>
                  <dd className="mt-1 text-sm font-medium">{job.location}</dd>
                  <dd className="mt-1 text-xs leading-6 text-muted">
                    {job.address}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Deadline</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {when(job.dueAt)}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-xs leading-6 text-muted">{job.access}</p>
              <h3 className="mt-5 text-xs font-semibold">Work instructions</h3>
              <p className="mt-2 text-sm leading-7">{job.instructions}</p>
              {job.arrivedAt ? (
                <p className="mt-4 flex items-center gap-2 text-xs text-ok">
                  <CheckCircle2 size={15} aria-hidden="true" />
                  {tech ? 'Arrival' : 'Check-in'} recorded:{' '}
                  {when(job.arrivedAt)}
                </p>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <h2 className="text-sm font-semibold">Your next step</h2>
              {job.status === 'new' ? (
                <>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    Review the instructions and acknowledge the assignment so
                    your supervisor knows you have seen it.
                  </p>
                  <Button
                    type="button"
                    className="mt-4 w-full sm:w-auto"
                    onClick={() => send({ action: 'acknowledge', id: job.id })}
                  >
                    <Check size={16} aria-hidden="true" />
                    Acknowledge assignment
                  </Button>
                </>
              ) : null}
              {job.status === 'acknowledged' ? (
                <>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    {tech
                      ? 'Record your arrival when you reach the assigned site.'
                      : 'Check in when you reach the assigned store.'}
                  </p>
                  <Button
                    type="button"
                    className="mt-4 w-full sm:w-auto"
                    onClick={() => send({ action: 'arrive', id: job.id })}
                  >
                    <MapPin size={16} aria-hidden="true" />
                    {tech ? 'Record arrival' : 'Check in at store'}
                  </Button>
                </>
              ) : null}
              {job.status === 'arrived' ? (
                <>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    You are checked in. Start the {tech ? 'job' : 'visit'} to
                    complete your checklist and add updates.
                  </p>
                  <Button
                    type="button"
                    className="mt-4 w-full sm:w-auto"
                    onClick={() => send({ action: 'start', id: job.id })}
                  >
                    <Play size={16} aria-hidden="true" />
                    {tech ? 'Start work' : 'Start visit'}
                  </Button>
                </>
              ) : null}
              {['new', 'acknowledged'].includes(job.status) ? (
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setReassign(!reassign)}
                  >
                    Request reassignment
                  </Button>
                  {reassign ? (
                    <div className="mt-3">
                      <Label htmlFor="reassignment-reason">Reason</Label>
                      <Input
                        id="reassignment-reason"
                        value={note}
                        maxLength={1500}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Explain why you cannot attend"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3"
                        onClick={() => notes('requestReassignment')}
                      >
                        Send request
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {job.status === 'in_progress' ? (
                <>
                  <p className="mt-3 text-xs leading-6 text-muted">
                    Complete the required tasks, attach evidence and submit a
                    clear summary.
                  </p>
                  <fieldset className="mt-4 space-y-2">
                    <legend className="mb-3 text-xs font-semibold">
                      Required checklist
                    </legend>
                    {job.tasks.map((t) => (
                      <label
                        key={t.id}
                        className="flex min-h-11 items-center gap-3 rounded-xl border border-ink/10 px-3 py-2 text-sm"
                      >
                        <input
                          className="size-4 shrink-0 accent-primary"
                          type="checkbox"
                          checked={t.done}
                          disabled={t.id === 'photo'}
                          onChange={(e) =>
                            send({
                              action: 'task',
                              id: job.id,
                              taskId: t.id,
                              done: e.target.checked,
                            })
                          }
                        />
                        <span>
                          {t.label}
                          {t.id === 'photo' ? (
                            <small className="mt-1 block text-xs text-muted">
                              Completed when a photo is attached.
                            </small>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="mt-5">
                    <Label htmlFor="work-photo">
                      {tech
                        ? 'Work photos · optional'
                        : 'Display photo · required'}
                    </Label>
                    <Input
                      id="work-photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      disabled={busy || job.photos.length >= 3}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setBusy(true);
                        setError('');
                        try {
                          const data = await readPhoto(file);
                          send({ action: 'photo', id: job.id, data });
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : 'Photo could not be attached.',
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                    <p className="mt-2 text-xs text-muted">
                      Up to three photos. {job.photos.length} attached.
                    </p>
                    {job.photos.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {job.photos.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt={'Work evidence ' + (i + 1)}
                            className="h-24 w-24 rounded-lg object-cover"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <form onSubmit={submit} className="mt-5">
                    <Label htmlFor="completion-summary">
                      {tech
                        ? 'Repair outcome and test results'
                        : 'Visit summary and follow-up'}
                    </Label>
                    <textarea
                      id="completion-summary"
                      className="fazoo-field min-h-28 w-full rounded-xl border bg-white p-3 text-sm text-ink"
                      required
                      minLength={10}
                      maxLength={1500}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={
                        tech
                          ? 'Describe the work completed and the test results.'
                          : 'Summarize the visit, stock gaps and actions needed.'
                      }
                    />
                    <Button
                      type="submit"
                      className="mt-3 w-full sm:w-auto"
                      disabled={busy}
                    >
                      {tech ? 'Submit completion' : 'Submit report & check out'}
                    </Button>
                  </form>
                  {tech ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 w-full sm:w-auto"
                      onClick={() => notes('block')}
                    >
                      Report parts delay
                    </Button>
                  ) : null}
                </>
              ) : null}
              {job.status === 'awaiting_parts' ? (
                <>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    {job.note || 'This job is waiting for parts.'}
                  </p>
                  <div className="mt-4">
                    <Label htmlFor="resume-note">Progress update</Label>
                    <Input
                      id="resume-note"
                      value={note}
                      maxLength={1500}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Record the parts received or next steps."
                    />
                    <Button
                      type="button"
                      className="mt-3"
                      onClick={() => notes('resume')}
                    >
                      Resume work
                    </Button>
                  </div>
                </>
              ) : null}
              {job.status === 'ready_for_review' ? (
                <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-deep">
                    <Clock3 size={17} aria-hidden="true" />
                    Awaiting supervisor approval
                  </h3>
                  <p className="mt-3 text-sm leading-7">{job.note}</p>
                  <p className="mt-3 text-xs leading-6 text-muted">
                    Your submission is complete. Follow-up instructions and the
                    review decision will appear with this assignment.
                  </p>
                </div>
              ) : null}
              {job.status === 'reassignment_requested' ? (
                <div className="mt-4 rounded-xl border border-warn/20 bg-warn/5 p-4">
                  <h3 className="text-sm font-semibold">
                    Reassignment requested
                  </h3>
                  <p className="mt-3 text-sm leading-7">{job.note}</p>
                  <p className="mt-3 text-xs text-muted">
                    Awaiting your supervisor’s decision.
                  </p>
                </div>
              ) : null}
              {job.status === 'completed' ? (
                <p className="mt-4 text-sm text-ok">
                  Work completed and approved.
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="mt-4 text-sm text-bad">
                  {error}
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
        <Card className="self-start">
          <CardBody>
            <h2 className="text-sm font-semibold">Activity</h2>
            <ol className="mt-4 space-y-4">
              {[...job.events].reverse().map((e, i) => (
                <li
                  key={e.at + i}
                  className="border-l-2 border-primary/20 pl-4"
                >
                  <p className="text-xs font-medium leading-6">{e.text}</p>
                  <p className="mt-1 text-[10px] text-muted">{when(e.at)}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export function WorkerWorkspace({
  initialPersona = 'Technician',
  initialAssignmentId,
}: {
  initialPersona?: Persona;
  initialAssignmentId?: string;
}) {
  const [session, setSession] = useState<WorkerSession | null>(null);
  const current = useRef<WorkerSession | null>(null);
  const [persona, setPersona] = useState<Persona>(initialPersona);
  const [tab, setTab] = useState<Tab>('Home');
  const [selected, setSelected] = useState<string | null>(
    initialAssignmentId ?? null,
  );
  const [filter, setFilter] = useState('All');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reset, setReset] = useState(false);
  useEffect(() => {
    let data: WorkerSession;
    try {
      const saved = localStorage.getItem(storageKey);
      data = saved
        ? workerSessionSchema.parse(JSON.parse(saved))
        : initialWorkerSession();
    } catch {
      data = initialWorkerSession();
      setError(
        'Saved workspace data could not be read. Starting assignments are shown.',
      );
    }
    if (initialAssignmentId) {
      if (
        data.assignments.some(
          (j) => j.id === initialAssignmentId && j.persona === initialPersona,
        )
      ) {
        data = applyWorkerCommand(data, initialPersona, {
          action: 'open',
          id: initialAssignmentId,
        });
        try {
          localStorage.setItem(storageKey, JSON.stringify(data));
        } catch {
          setError('Read status could not be saved in this browser.');
        }
      } else {
        setSelected(null);
        setError('That assignment is not available in this workspace.');
      }
    }
    current.current = data;
    setSession(data);
  }, [initialPersona, initialAssignmentId]);
  function persist(next: WorkerSession) {
    try {
      workerSessionSchema.parse(next);
      localStorage.setItem(storageKey, JSON.stringify(next));
      current.current = next;
      setSession(next);
      return true;
    } catch {
      setError(
        'Your changes could not be saved. Free browser storage and try again.',
      );
      return false;
    }
  }
  function send(command: WorkerCommand) {
    if (!current.current) return false;
    setError('');
    setMessage('');
    try {
      const next = applyWorkerCommand(current.current, persona, command);
      if (!persist(next)) return false;
      if (command.action !== 'open')
        setMessage(
          command.action === 'submit'
            ? 'Submitted for supervisor review.'
            : command.action === 'requestReassignment'
              ? 'Reassignment request recorded.'
              : 'Assignment updated.',
        );
      return true;
    } catch (err) {
      setError(
        err instanceof Error && err.name !== 'ZodError'
          ? err.message
          : 'Check the required fields.',
      );
      return false;
    }
  }
  function open(id: string) {
    if (send({ action: 'open', id })) {
      setSelected(id);
      setTab('My work');
    }
  }
  function navigate(next: Tab) {
    setSelected(null);
    setTab(next);
    setMessage('');
    setError('');
  }
  if (!session)
    return (
      <main id="main-content" className="p-8">
        <p role="status">Opening your workspace…</p>
      </main>
    );
  const jobs = session.assignments.filter((j) => j.persona === persona);
  const unread = jobs.filter((j) => !j.read).length;
  const newJobs = jobs.filter((j) => j.status === 'new');
  const top = [...newJobs].sort(
    (a, b) =>
      ({ Urgent: 0, High: 1, Normal: 2 })[a.priority] -
      { Urgent: 0, High: 1, Normal: 2 }[b.priority],
  )[0];
  const job = jobs.find((j) => j.id === selected);
  const filtered = jobs.filter(
    (j) =>
      filter === 'All' ||
      (filter === 'New' && j.status === 'new') ||
      (filter === 'Active' && active(j)) ||
      (filter === 'For review' && j.status === 'ready_for_review'),
  );
  const company = persona === 'Technician' ? 'Airtel' : 'Hanan';
  const day = formatLagosDisplay(new Date());
  return (
    <div data-personal-workspace className="fazoo-shell flex min-h-screen">
      <aside
        className="fazoo-glass-dark sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r px-3 py-5 xl:flex"
        aria-label="Personal navigation"
      >
        <WorkspaceBrand />
        <p className="fazoo-nav-caption">{company} · My workspace</p>
        <nav className="flex-1 space-y-1">
          {tabs.map((name) => {
            const Icon = icons[name];
            return (
              <button
                type="button"
                key={name}
                aria-current={tab === name ? 'page' : undefined}
                className="fazoo-nav-link w-full text-left"
                onClick={() => navigate(name)}
              >
                <Icon size={17} aria-hidden="true" />
                {name}
                {name === 'Notifications' && unread ? (
                  <span className="ml-auto rounded-md bg-white/10 px-2">
                    {unread}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <Link
          href="/maintenance-preview/expansion"
          className="fazoo-nav-link mt-5"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Workspaces
        </Link>
      </aside>
      <div className="flex w-full min-w-0 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-white px-4 py-3 sm:px-6 xl:px-8">
          <div>
            <p className="text-xs font-semibold text-ink">{company}</p>
            <p className="mt-1 text-[10px] text-muted">{persona}</p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              className="w-auto max-w-[11.5rem] text-xs"
              aria-label="Workspace role"
              value={persona}
              onChange={(e) => {
                setPersona(e.target.value as Persona);
                setSelected(null);
                setTab('Home');
                setError('');
                setMessage('');
                setFilter('All');
              }}
            >
              {personas.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
            <button
              type="button"
              className="relative inline-flex size-11 items-center justify-center rounded-xl border border-ink/10 text-ink hover:bg-lavender focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={'Notifications, ' + unread + ' unread'}
              onClick={() => navigate('Notifications')}
            >
              <Bell size={20} aria-hidden="true" />
              {unread ? (
                <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-[#fff]">
                  {unread}
                </span>
              ) : null}
            </button>
          </div>
        </header>
        <main
          id="main-content"
          className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 xl:px-8"
        >
          {error ? (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-bad/20 bg-bad/5 p-3 text-sm text-bad"
            >
              {error}
            </p>
          ) : null}
          {message ? (
            <p
              role="status"
              className="mb-4 rounded-xl border border-ok/20 bg-ok/5 p-3 text-sm text-ok"
            >
              {message}
            </p>
          ) : null}
          {job ? (
            <AssignmentDetails
              key={job.id + job.status}
              job={job}
              send={send}
              back={() => navigate('My work')}
            />
          ) : (
            <>
              <div className="mb-5">
                <p className="text-[10px] font-medium uppercase tracking-[.15em] text-muted">
                  {day}
                </p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {tab === 'Home' ? 'Your day, clearly planned.' : tab}
                </h1>
                <p className="mt-2 text-xs leading-6 text-muted">
                  {tab === 'Home'
                    ? 'Your assignments, updates and next steps in one place.'
                    : tab === 'Notifications'
                      ? 'Open an update to go directly to the assigned work.'
                      : tab === 'My work'
                        ? 'Keep assigned work moving through to completion.'
                        : 'Your role and workspace details.'}
                </p>
              </div>
              {tab === 'Home' ? (
                <>
                  <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                      { label: 'New assignments', value: newJobs.length },
                      {
                        label: 'In progress',
                        value: jobs.filter((j) => j.status === 'in_progress')
                          .length,
                      },
                      {
                        label: 'Awaiting review',
                        value: jobs.filter(
                          (j) => j.status === 'ready_for_review',
                        ).length,
                      },
                      {
                        label: 'Active work',
                        value: jobs.filter(active).length,
                      },
                    ].map((stat) => (
                      <Card key={stat.label}>
                        <CardBody>
                          <p className="text-[10px] text-muted">{stat.label}</p>
                          <p className="mt-2 text-2xl font-semibold tabular-nums">
                            {stat.value}
                          </p>
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                  {top ? (
                    <section
                      className="mb-6 rounded-2xl border border-[#8c79ba55] bg-[linear-gradient(125deg,#19243f,#2c2449)] p-5 text-[#f4f0fc] sm:p-6"
                      aria-label="New assignment"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-md border border-[#d5c4ee55] bg-[#d5c4ee15] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#d5c4ee]">
                          New assignment
                        </span>
                        <Priority job={top} />
                      </div>
                      <h2 className="mt-4 max-w-2xl text-xl font-semibold leading-7 tracking-tight sm:text-2xl">
                        {top.title}
                      </h2>
                      <p className="mt-3 flex items-center gap-2 text-xs text-[#cec8dd]">
                        <MapPin size={15} aria-hidden="true" />
                        {top.location}
                      </p>
                      <p className="mt-3 text-xs text-[#cec8dd]">
                        Deadline: {when(top.dueAt)}
                      </p>
                      <p className="mt-2 text-xs text-[#cec8dd]">
                        Assigned by {top.supervisor}
                      </p>
                      <button
                        type="button"
                        className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[#d5c4ee] px-5 text-sm font-semibold text-[#302040] hover:bg-[#e2d4f4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d5c4ee] sm:w-auto"
                        onClick={() => open(top.id)}
                      >
                        View assignment
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </button>
                    </section>
                  ) : (
                    <div className="mb-6 rounded-2xl border border-ok/15 bg-ok/5 p-5 text-sm text-ok">
                      You’re up to date. Your active work is listed below.
                    </div>
                  )}
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">My active work</h2>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('My work')}
                    >
                      View all
                    </Button>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {jobs
                      .filter(
                        (j) => active(j) || j.status === 'ready_for_review',
                      )
                      .map((j) => (
                        <AssignmentCard key={j.id} job={j} open={open} />
                      ))}
                  </div>
                </>
              ) : null}
              {tab === 'My work' ? (
                <>
                  <div
                    role="group"
                    aria-label="Filter my work"
                    className="mb-5 flex flex-wrap gap-2"
                  >
                    {['All', 'New', 'Active', 'For review'].map((v) => (
                      <button
                        type="button"
                        key={v}
                        aria-pressed={filter === v}
                        className={
                          'min-h-10 rounded-lg border px-3 text-xs font-semibold ' +
                          (filter === v
                            ? 'border-primary/25 bg-primary/10 text-deep'
                            : 'border-ink/10 bg-white text-muted')
                        }
                        onClick={() => setFilter(v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {filtered.map((j) => (
                      <AssignmentCard key={j.id} job={j} open={open} />
                    ))}
                  </div>
                  {!filtered.length ? (
                    <p className="rounded-xl border border-dashed border-ink/15 p-8 text-center text-sm text-muted">
                      No assignments in this view.
                    </p>
                  ) : null}
                </>
              ) : null}
              {tab === 'Notifications' ? (
                <div className="space-y-3">
                  {[...jobs]
                    .sort((a, b) => Number(a.read) - Number(b.read))
                    .map((j) => (
                      <button
                        type="button"
                        key={j.id}
                        className={
                          'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors hover:border-primary/30 focus-visible:outline-2 focus-visible:outline-primary ' +
                          (!j.read
                            ? 'border-primary/25 bg-primary/5'
                            : 'border-ink/10 bg-white')
                        }
                        onClick={() => open(j.id)}
                      >
                        <span className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Bell size={17} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                            {!j.read ? <Badge tone="purple">New</Badge> : null}
                            Assignment from {j.supervisor}
                          </span>
                          <span className="mt-2 block text-sm font-semibold leading-6">
                            {j.title}
                          </span>
                          <span className="mt-2 block text-xs text-muted">
                            {j.location} · Due {when(j.dueAt)}
                          </span>
                          <span className="mt-2 block text-[10px] text-muted">
                            {when(j.assignedAt)}
                          </span>
                        </span>
                        <ArrowUpRight
                          size={17}
                          className="mt-1 shrink-0"
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                </div>
              ) : null}
              {tab === 'Profile' ? (
                <Card className="max-w-2xl">
                  <CardBody>
                    <h2 className="text-sm font-semibold">My workspace</h2>
                    <dl className="mt-5 grid gap-4 text-sm">
                      <div>
                        <dt className="text-xs text-muted">Organization</dt>
                        <dd className="mt-1 font-medium">{company}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Role</dt>
                        <dd className="mt-1 font-medium">{persona}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">
                          Assigned supervisor
                        </dt>
                        <dd className="mt-1 font-medium">
                          {persona === 'Technician'
                            ? 'Service manager'
                            : 'Field supervisor'}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-5 text-xs leading-6 text-muted">
                      Sample workspace. Assignments, photos and arrival records
                      stay in this browser. Location verification and external
                      push notifications are not connected.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-5"
                      onClick={() => setReset(!reset)}
                    >
                      Restore sample data
                    </Button>
                    {reset ? (
                      <div className="mt-4 rounded-xl border border-ink/10 p-4">
                        <p className="text-xs leading-6 text-muted">
                          Restore starting assignments for all three roles and
                          clear local progress?
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            onClick={() => {
                              if (persist(initialWorkerSession())) {
                                setReset(false);
                                setMessage('Starting assignments restored.');
                              }
                            }}
                          >
                            Restore starting assignments
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setReset(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </CardBody>
                </Card>
              ) : null}
            </>
          )}
          <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-ink/10 pt-4 text-[10px] leading-5 text-muted">
            <span>{company} · Sample workspace · Not affiliated</span>
            <span>
              Times shown in Lagos time · Changes stay in this browser
            </span>
          </footer>
        </main>
        <nav
          aria-label="Personal mobile navigation"
          className="fazoo-mobile-nav fixed inset-x-0 bottom-0 z-30 border-t xl:hidden"
        >
          <div className="mx-auto grid max-w-xl grid-cols-4 gap-1 px-2 py-1">
            {tabs.map((name) => {
              const Icon = icons[name];
              return (
                <button
                  type="button"
                  key={name}
                  aria-current={tab === name ? 'page' : undefined}
                  className="relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium text-muted focus-visible:outline-2 focus-visible:outline-primary"
                  onClick={() => navigate(name)}
                >
                  <Icon size={20} aria-hidden="true" />
                  {name}
                  {name === 'Notifications' && unread ? (
                    <span className="absolute right-5 top-1 rounded-full bg-primary px-1 text-[9px] text-[#fff]">
                      {unread}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
