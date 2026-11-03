'use client';

import { initialAirtelDemo } from '@/lib/maintenance/airtel-demo';
import { MaintenanceDashboardCard } from './dashboard-card';
import { maintenanceSummary } from '@/lib/maintenance/summary';
import { LocationPicker } from './location-picker';
import { locationMapUrl, type LocationPin } from '@/lib/maintenance/location';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Flag,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPin,
  Plus,
  Search,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import {
  formatLagosDisplay,
  lagosDateTime,
  lagosDateTimeToUtc,
} from '@fazoo/config';
import { FazooMark } from '@/components/fazoo-mark';
import { mutateMaintenance } from '@/app/service-desk/actions';
import {
  applyDemo,
  DEMO_MANAGER,
  DEMO_REPORTER,
  DEMO_TECH,
  initialDemo,
} from '@/lib/maintenance/demo';
import {
  byPriority,
  canRead,
  canReview,
  canUpdate,
  commandSchema,
  jobNumber,
  overdue,
  statusLabels,
  type Command,
  type Job,
  type Workspace,
} from '@/lib/maintenance/model';
import styles from './workspace.module.css';

type Submit = (command: Command) => Promise<boolean>;
export function MaintenanceWorkspace({
  initial,
  demo = false,
  startNew = false,
  demoCompany,
}: {
  initial: Workspace;
  demo?: boolean;
  startNew?: boolean;
  demoCompany?: 'Airtel';
}) {
  const [workspace, setWorkspace] = useState(initial);
  const [selectedId, setSelectedId] = useState(
    [...initial.jobs].sort(byPriority)[0]?.id ?? '',
  );
  const [filter, setFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(startNew);
  const [dashboardView, setDashboardView] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const visible = workspace.jobs.filter((job) =>
    canRead(job, workspace.viewer),
  );
  const jobs = visible
    .filter(
      (job) =>
        (filter === 'all' ||
          (filter === 'mine'
            ? job.assigned_to === workspace.viewer.id
            : job.status === filter)) &&
        (priorityFilter === 'all' || job.priority === priorityFilter) &&
        `${job.title} ${job.location} ${job.address} ${job.location_details} ${jobNumber(job)}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(byPriority);
  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0];
  const totals = [
    {
      name: 'Open requests',
      value: visible.filter((j) => j.status === 'requested').length,
      icon: ClipboardList,
      filter: 'requested',
    },
    {
      name: 'Active work orders',
      value: visible.filter((j) =>
        ['assigned', 'in_progress', 'awaiting_parts'].includes(j.status),
      ).length,
      icon: Wrench,
      filter: 'all',
    },
    {
      name: 'Awaiting approval',
      value: visible.filter((j) => j.status === 'ready_for_review').length,
      icon: CheckCircle2,
      filter: 'ready_for_review',
    },
    {
      name: 'Overdue',
      value: visible.filter((j) => overdue(j, now)).length,
      icon: Clock3,
      filter: 'all',
    },
  ];
  const submit: Submit = async (raw) => {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) {
      setFeedback({
        error: true,
        text: parsed.error.issues[0]?.message ?? 'Check your details.',
      });
      return false;
    }
    const command = parsed.data;
    setPending(true);
    setFeedback(null);
    try {
      if (demo) {
        const next = applyDemo(workspace, command);
        setWorkspace(next);
        if (command.action === 'create') setSelectedId(next.jobs[0]?.id ?? '');
      } else {
        const key = JSON.stringify(command);
        if (attempt.current?.key !== key)
          attempt.current = { key, id: crypto.randomUUID() };
        const result = await mutateMaintenance({
          client_request_id: attempt.current.id,
          command,
        });
        if (result.error) {
          if ('saved' in result) attempt.current = null;
          throw new Error(result.error);
        }
        if (!result.workspace)
          throw new Error('Refresh to check the latest job.');
        setWorkspace(result.workspace);
        if (command.action === 'create')
          setSelectedId(result.workspace.jobs[0]?.id ?? '');
      }
      attempt.current = null;
      setNow(Date.now());
      setFeedback({
        error: false,
        text: demo
          ? 'Demo updated in this tab. No company records changed.'
          : 'Your update has been saved.',
      });
      return true;
    } catch (error) {
      setFeedback({
        error: true,
        text:
          error instanceof Error
            ? error.message
            : 'The update could not be saved.',
      });
      return false;
    } finally {
      setPending(false);
    }
  };
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/sign-in" className={styles.brand}>
          <FazooMark className="size-12" />
          <span>
            FAZOO<small>Field & service operations</small>
          </span>
        </Link>
        <p className={styles.navLabel}>WORKSPACE</p>
        {demo ? (
          <button
            type="button"
            className={dashboardView ? styles.activeNav : styles.back}
            onClick={() => setDashboardView(true)}
          >
            My dashboard
          </button>
        ) : null}
        <button
          type="button"
          className={!dashboardView ? styles.activeNav : styles.back}
          onClick={() => setDashboardView(false)}
        >
          <Wrench size={17} aria-hidden="true" /> Service desk
        </button>
        <div className={styles.sidebarNote}>
          <span className={styles.smallDot} /> One shared picture
          <p>From the first report to the final sign-off.</p>
        </div>
        <Link href="/sign-in" className={styles.back}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to Fazoo
        </Link>
      </aside>
      <main id="main-content" className={styles.main}>
        {demo ? (
          <div className={styles.demoBanner}>
            <span>
              <strong>
                {demoCompany
                  ? demoCompany + ' case-study demo'
                  : 'Interactive preview'}
              </strong>{' '}
              · Fictional data.{' '}
              {demoCompany
                ? 'Not affiliated. No live network or customer data. '
                : ''}
              Changes reset on refresh.
            </span>
            <Link
              href="/maintenance-preview/hanan"
              className="font-semibold underline"
            >
              Hanan case study
            </Link>
            <Link
              href="/maintenance-preview/style"
              className="font-semibold underline"
            >
              Explore app styling
            </Link>
            <button
              type="button"
              onClick={() => {
                setWorkspace(
                  demoCompany === 'Airtel'
                    ? initialAirtelDemo()
                    : initialDemo(),
                );
                setFeedback(null);
                setCreating(false);
                setFilter('all');
                setSearch('');
                setPriorityFilter('all');
              }}
              disabled={pending}
            >
              Reset demo
            </button>
          </div>
        ) : null}
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>
              {demoCompany
                ? 'AIRTEL · INTERNET SERVICE OPERATIONS'
                : 'MAINTENANCE & SERVICES'}
            </p>
            <h1>
              {demoCompany
                ? 'Keep every connection running.'
                : 'Keep every service moving.'}
            </h1>
            <p>
              {demoCompany
                ? 'Track simulated network faults, technician visits and service completion.'
                : 'Report an issue. Coordinate the work. Close the loop.'}
            </p>
          </div>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              setDashboardView(false);
              setCreating(true);
            }}
            disabled={pending}
          >
            <Plus size={17} aria-hidden="true" /> New service request
          </button>
        </header>
        <div className={styles.identity}>
          <span>
            <UserRound size={15} aria-hidden="true" /> {workspace.viewer.name}
          </span>
          {demo ? (
            <label>
              Preview as{' '}
              <select
                aria-label="Preview role"
                value={workspace.viewer.id}
                disabled={pending}
                onChange={(e) => {
                  const viewer = [DEMO_MANAGER, DEMO_TECH, DEMO_REPORTER].find(
                    (v) => v.id === e.target.value,
                  );
                  if (viewer) {
                    setWorkspace((w) => ({ ...w, viewer }));
                    setFeedback(null);
                    setFilter('all');
                    setCreating(false);
                  }
                }}
              >
                <option value={DEMO_MANAGER.id}>Administrator</option>
                <option value={DEMO_TECH.id}>Technician</option>
                <option value={DEMO_REPORTER.id}>Requester</option>
              </select>
            </label>
          ) : (
            <span>
              {workspace.viewer.can_manage
                ? 'Administrator workspace'
                : 'Your requests & assigned work'}
            </span>
          )}
        </div>
        {demo ? (
          <div
            className={styles.previewNavigation}
            role="group"
            aria-label="Preview dashboard navigation"
          >
            <button
              type="button"
              aria-pressed={dashboardView}
              onClick={() => setDashboardView(true)}
            >
              My dashboard
            </button>
            <button
              type="button"
              aria-pressed={!dashboardView}
              onClick={() => setDashboardView(false)}
            >
              Service desk
            </button>
          </div>
        ) : null}
        {dashboardView ? (
          <MaintenanceDashboardCard
            summary={maintenanceSummary(
              workspace,
              workspace.viewer.id === DEMO_REPORTER.id,
              now,
            )}
            onOpen={() => setDashboardView(false)}
            onNew={() => {
              setDashboardView(false);
              setCreating(true);
            }}
          />
        ) : (
          <>
            <section className={styles.metrics} aria-label="Service summary">
              {totals.map(({ name, value, icon: Icon }) => (
                <div className={styles.metric} key={name}>
                  <span>
                    {name}
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <strong>{value}</strong>
                </div>
              ))}
            </section>
            {feedback ? (
              <p
                className={feedback.error ? styles.error : styles.success}
                role={feedback.error ? 'alert' : 'status'}
              >
                {feedback.error ? (
                  <AlertCircle size={17} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={17} aria-hidden="true" />
                )}
                {feedback.text}
                {feedback.error && !demo ? (
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                  >
                    Refresh workspace
                  </button>
                ) : null}
              </p>
            ) : null}
            {creating ? (
              <RequestForm
                submit={submit}
                pending={pending}
                close={() => setCreating(false)}
              />
            ) : null}
            <div className={styles.sectionHeading}>
              <div>
                <h2>Service activity</h2>
                <p>
                  {demo
                    ? 'Try the full request-to-approval workflow.'
                    : 'Your most recent 250 visible jobs. Times shown in Lagos time.'}
                </p>
              </div>
              <span className={styles.count}>{visible.length} jobs</span>
            </div>
            <div className={styles.toolbar}>
              <div
                className={styles.filters}
                role="group"
                aria-label="Filter jobs"
              >
                {[
                  ['all', 'All jobs'],
                  ['requested', 'Requests'],
                  ['mine', 'My work'],
                  ['ready_for_review', 'For approval'],
                  ['completed', 'Completed'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value ?? 'all')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className={styles.priorityFilter}>
                Priority
                <select
                  aria-label="Filter by priority"
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                >
                  <option value="all">All priorities</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className={styles.search}>
                <Search size={16} aria-hidden="true" />
                <input
                  aria-label="Search jobs"
                  placeholder="Search jobs or locations"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className={styles.board}>
              <section
                className={styles.jobList}
                aria-label="Service requests and work orders"
              >
                {jobs.length ? (
                  jobs.map((job) => (
                    <button
                      type="button"
                      className={`${styles.job} ${selected?.id === job.id ? styles.selected : ''}`}
                      data-priority={job.priority}
                      key={job.id}
                      onClick={() => setSelectedId(job.id)}
                      aria-pressed={selected?.id === job.id}
                    >
                      <div className={styles.jobTop}>
                        <span>{jobNumber(job)}</span>
                        <PriorityBadge priority={job.priority} />
                      </div>
                      <h3>{job.title}</h3>
                      <p>
                        <MapPin size={13} aria-hidden="true" />
                        {job.location}
                      </p>
                      {job.address ? (
                        <p className={styles.jobAddress}>{job.address}</p>
                      ) : null}
                      {job.pin ? (
                        <span className={styles.pinTag}>
                          <MapPin size={11} aria-hidden="true" /> Map pin
                          attached
                        </span>
                      ) : null}
                      <div className={styles.jobBottom}>
                        <span
                          className={styles.status}
                          data-status={job.status}
                        >
                          {statusLabels[job.status]}
                        </span>
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </div>
                      <div className={styles.jobMeta}>
                        <span>{job.technician_name ?? 'Unassigned'}</span>
                        {overdue(job, now) ? (
                          <span className={styles.overdue}>Overdue</span>
                        ) : null}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className={styles.empty}>
                    <ClipboardList size={28} aria-hidden="true" />
                    <h3>No jobs here yet</h3>
                    <p>Change your filters or create a service request.</p>
                  </div>
                )}
              </section>
              {selected ? (
                <JobDetail
                  key={`${selected.id}-${selected.version}-${workspace.viewer.id}`}
                  job={selected}
                  workspace={workspace}
                  submit={submit}
                  pending={pending}
                />
              ) : (
                <section className={styles.detail}>
                  <h3>Your job details will appear here</h3>
                  <p>
                    Choose a request to see its instructions, updates and review
                    history.
                  </p>
                </section>
              )}
            </div>
          </>
        )}
        <footer className={styles.footer}>
          <span>FAZOO · Service operations</span>
          <span>Reported → Assigned → In progress → Reviewed</span>
        </footer>
      </main>
    </div>
  );
}

function RequestForm({
  submit,
  pending,
  close,
}: {
  submit: Submit;
  pending: boolean;
  close: () => void;
}) {
  const [pin, setPin] = useState<LocationPin | null>(null);
  const [locationError, setLocationError] = useState('');
  const [locating, setLocating] = useState(false);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locationError || locating) return;
    const form = new FormData(event.currentTarget);
    const ok = await submit({
      action: 'create',
      title: String(form.get('title')),
      description: String(form.get('description')),
      location: String(form.get('location')),
      address: String(form.get('address')),
      location_details: String(form.get('location_details')),
      pin,
      priority: String(form.get('priority')) as 'normal',
    });
    if (ok) close();
  }
  return (
    <section className={styles.requestForm} aria-labelledby="new-request-title">
      <div className={styles.sectionHeading}>
        <h2 id="new-request-title">Report a service issue</h2>
        <button
          type="button"
          className={styles.iconButton}
          onClick={close}
          disabled={pending || locating}
          aria-label="Close new request"
        >
          <X size={20} />
        </button>
      </div>
      <form onSubmit={send} className={styles.form} aria-busy={pending}>
        <label>
          Issue title
          <input
            name="title"
            placeholder="What needs attention?"
            minLength={5}
            maxLength={160}
            required
            autoFocus
          />
        </label>
        <fieldset className={styles.priorityChoices}>
          <legend>Job priority</legend>
          {(
            [
              ['urgent', 'Immediate attention'],
              ['high', 'Time-sensitive'],
              ['normal', 'Routine work'],
              ['low', 'Can be scheduled'],
            ] as const
          ).map(([value, description]) => (
            <label key={value} data-priority={value}>
              <input
                type="radio"
                name="priority"
                value={value}
                defaultChecked={value === 'normal'}
                required
              />
              <span>
                <strong>{value}</strong>
                <small>{description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className={styles.formRow}>
          <label>
            Site / building name
            <input
              name="location"
              placeholder="Name of the site or building"
              minLength={3}
              maxLength={240}
              required
            />
          </label>
          <label>
            Full site address
            <input
              name="address"
              placeholder="Street, area and city"
              minLength={5}
              maxLength={500}
              required
            />
          </label>
        </div>
        <label>
          Floor, room, equipment & access details
          <input
            name="location_details"
            placeholder="Floor, room, equipment label, entrance or nearby landmark"
            maxLength={500}
          />
        </label>
        <LocationPicker
          disabled={pending}
          onBusyChange={setLocating}
          onChange={(next, error) => {
            setPin(next);
            setLocationError(error);
          }}
        />
        <label>
          Describe the issue
          <textarea
            name="description"
            placeholder="Explain the fault, impact and any safety concerns."
            minLength={10}
            maxLength={3000}
            rows={3}
            required
          />
        </label>
        <button
          type="submit"
          className={styles.primary}
          disabled={pending || locating || Boolean(locationError)}
        >
          {pending ? 'Saving…' : 'Create service request'}
        </button>
      </form>
    </section>
  );
}

function JobDetail({
  job,
  workspace,
  submit,
  pending,
}: {
  job: Job;
  workspace: Workspace;
  submit: Submit;
  pending: boolean;
}) {
  const [localError, setLocalError] = useState('');
  const base = { job_id: job.id, expected_version: job.version };
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLocalError('');
    try {
      await submit({
        action: 'assign',
        ...base,
        technician_id: String(form.get('technician')),
        due_at: lagosDateTimeToUtc(String(form.get('deadline'))),
        instructions: String(form.get('instructions')),
      });
    } catch {
      setLocalError('Enter a valid deadline in Lagos time.');
    }
  }
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit({
      action: 'update',
      ...base,
      status: String(form.get('status')) as 'in_progress',
      note: String(form.get('note')),
    });
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit({
      action: String(form.get('decision')) as 'approve' | 'reopen',
      ...base,
      note: String(form.get('note')),
    });
  }
  return (
    <section className={styles.detail} aria-labelledby="job-detail-title">
      <div className={styles.detailHeading}>
        <span className={styles.eyebrow}>{jobNumber(job)} · JOB DETAILS</span>
        <span className={styles.status} data-status={job.status}>
          {statusLabels[job.status]}
        </span>
      </div>
      <div className={styles.detailPriority}>
        <PriorityBadge priority={job.priority} />
      </div>
      <h2 id="job-detail-title">{job.title}</h2>
      <p className={styles.location}>
        <MapPin size={15} aria-hidden="true" />
        {job.location}
      </p>
      <div className={styles.preciseLocation}>
        {job.address ? (
          <p>
            <strong>Site address</strong>
            {job.address}
          </p>
        ) : null}
        {job.location_details ? (
          <p>
            <strong>Find the exact spot</strong>
            {job.location_details}
          </p>
        ) : null}
        {job.pin ? (
          <>
            <p>
              <strong>Pinned coordinates</strong>
              {job.pin.latitude.toFixed(6)}, {job.pin.longitude.toFixed(6)}
            </p>
            <p className={styles.pinHint}>
              {job.pin.source === 'gps'
                ? `Device GPS · reported accuracy ±${Math.ceil(job.pin.accuracy_m ?? 0)} m`
                : 'Manual pin · accuracy not measured'}
              {job.pin.captured_at
                ? ` · Captured ${formatLagosDisplay(job.pin.captured_at)} (Lagos time)`
                : ''}
            </p>
            <div className={styles.mapActions}>
              <a
                href={locationMapUrl(job.pin)}
                target="_blank"
                rel="noopener noreferrer"
              >
                View map pin ↗
              </a>
              <a
                href={locationMapUrl(job.pin, true)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get directions ↗
              </a>
            </div>
          </>
        ) : (
          <p className={styles.pinHint}>
            No map pin recorded. Use the site details to locate this job.
          </p>
        )}
      </div>
      <p className={styles.description}>{job.description}</p>
      <dl className={styles.facts}>
        <div>
          <dt>Assigned technician</dt>
          <dd>{job.technician_name ?? 'Not assigned yet'}</dd>
        </div>
        <div>
          <dt>Deadline · Lagos time</dt>
          <dd>
            {job.due_at ? formatLagosDisplay(job.due_at) : 'Set when assigning'}
          </dd>
        </div>
      </dl>
      {job.instructions ? (
        <div className={styles.note}>
          <h3>Work instructions</h3>
          <p>{job.instructions}</p>
        </div>
      ) : null}
      {job.completion_note ? (
        <div className={styles.completion}>
          <Check size={17} aria-hidden="true" />
          <div>
            <h3>Completion summary</h3>
            <p>{job.completion_note}</p>
          </div>
        </div>
      ) : null}
      {workspace.viewer.can_manage &&
      ['requested', 'assigned'].includes(job.status) ? (
        <form onSubmit={assign} className={styles.form} aria-busy={pending}>
          <h3>
            {job.status === 'requested'
              ? 'Create work order'
              : 'Update assignment'}
          </h3>
          <label>
            Assign technician
            <select
              name="technician"
              defaultValue={job.assigned_to ?? ''}
              required
            >
              <option value="" disabled>
                Select a team member
              </option>
              {workspace.technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Deadline (Lagos time)
            <input
              type="datetime-local"
              name="deadline"
              defaultValue={
                job.due_at ? lagosDateTime(job.due_at).replace(' ', 'T') : ''
              }
              required
            />
          </label>
          <label>
            Work instructions
            <textarea
              name="instructions"
              rows={3}
              defaultValue={job.instructions}
              minLength={5}
              maxLength={2000}
              required
            />
          </label>
          {localError ? (
            <p role="alert" className={styles.error}>
              {localError}
            </p>
          ) : null}
          <button
            className={styles.primary}
            type="submit"
            disabled={pending || !workspace.technicians.length}
          >
            {pending ? 'Saving…' : 'Assign work order'}
          </button>
        </form>
      ) : null}
      {canUpdate(job, workspace.viewer) ? (
        <form onSubmit={update} className={styles.form} aria-busy={pending}>
          <h3>Update your work</h3>
          <label>
            Progress
            <select name="status" defaultValue="in_progress">
              <option value="in_progress">
                {job.status === 'assigned' ? 'Start work' : 'In progress'}
              </option>
              {job.status !== 'assigned' ? (
                <option value="awaiting_parts">Awaiting parts</option>
              ) : null}
              {job.status === 'in_progress' ? (
                <option value="ready_for_review">Submit for approval</option>
              ) : null}
            </select>
          </label>
          <label>
            Work notes
            <textarea
              name="note"
              rows={3}
              placeholder="Describe the work done, a blocker, or the completed repair and checks."
              minLength={5}
              maxLength={2000}
              required
            />
          </label>
          <button className={styles.primary} type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save work update'}
          </button>
        </form>
      ) : null}
      {canReview(job, workspace.viewer) ? (
        <form onSubmit={review} className={styles.form} aria-busy={pending}>
          <h3>Review the completed work</h3>
          <label>
            Decision
            <select name="decision">
              <option value="approve">Approve and close</option>
              <option value="reopen">Reopen for further work</option>
            </select>
          </label>
          <label>
            Review comments
            <textarea
              name="note"
              rows={3}
              placeholder="Explain your approval or what still needs attention."
              minLength={5}
              maxLength={2000}
              required
            />
          </label>
          <button className={styles.primary} type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save review decision'}
          </button>
        </form>
      ) : null}
      {job.status === 'ready_for_review' &&
      !canReview(job, workspace.viewer) ? (
        <p className={styles.note}>
          Awaiting an independent administrator’s review.
        </p>
      ) : null}
      {job.status === 'completed' ? (
        <p className={styles.closed}>
          <CheckCircle2 size={17} aria-hidden="true" /> Work completed and
          approved.
        </p>
      ) : null}
      <section className={styles.timeline} aria-label="Job history">
        <h3>Activity & review history</h3>
        <ol>
          {job.events.map((event) => (
            <li key={event.id}>
              <span className={styles.timelineDot} />
              <div>
                <p>
                  <strong>{event.actor_name}</strong>
                  <span>
                    {event.action === 'create'
                      ? 'Reported issue'
                      : event.action === 'assign'
                        ? 'Assigned work'
                        : event.action === 'approve'
                          ? 'Approved completion'
                          : event.action === 'reopen'
                            ? 'Reopened work'
                            : 'Updated progress'}
                  </span>
                </p>
                <p className={styles.eventNote}>{event.note}</p>
                <time dateTime={event.created_at}>
                  {formatLagosDisplay(event.created_at)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function PriorityBadge({ priority }: { priority: Job['priority'] }) {
  return (
    <span className={`${styles.priority} ${styles[priority]}`}>
      {priority === 'urgent' ? (
        <AlertCircle size={14} aria-hidden="true" />
      ) : (
        <Flag size={13} aria-hidden="true" />
      )}
      {priority} priority
    </span>
  );
}
