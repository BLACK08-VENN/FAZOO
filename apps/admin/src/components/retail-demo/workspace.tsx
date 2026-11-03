'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
} from 'react';
import Link from 'next/link';
import { workspaceLabel } from '@/lib/retail-demo/copy';
import {
  AlertTriangle,
  ArrowUpRight,
  ClipboardCheck,
  LayoutDashboard,
  Plus,
  Radio,
  ShoppingCart,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import {
  formatLagosDisplay,
  lagosDate,
  lagosDateTimeToUtc,
} from '@fazoo/config';
import { WorkspaceBrand } from '@/components/workspace-brand';
import { PageHeader, StatCard } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  applyCommand,
  initialSession,
  sessionSchema,
  withCompetitorSamples,
  products,
  outlets,
  roles,
  type Command,
  type Role,
  type Session,
} from '@/lib/retail-demo/model';

const tabs = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Shelf checks', icon: ClipboardCheck },
  { name: 'Stock gaps', icon: AlertTriangle },
  { name: 'Orders', icon: ShoppingCart },
  { name: 'Competitor intel', icon: Radio },
  { name: 'Equipment', icon: Wrench },
  { name: 'Offline queue', icon: WifiOff },
] as const;
type Tab = (typeof tabs)[number]['name'];
const key = 'fazoo-hanan-demo-v1';
const time = (s: string) => formatLagosDisplay(s);
const tomorrow = () => lagosDate(new Date(Date.now() + 86400000));
const rank = { Urgent: 0, High: 1, Normal: 2 };
type Prefill = {
  gapId: string;
  outlet: (typeof outlets)[number];
  product: (typeof products)[number];
} | null;

function Field({
  label,
  options,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  options?: readonly string[];
}) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {options ? (
        <Select
          id={id}
          name={props.name}
          required={props.required !== false}
          defaultValue={props.defaultValue}
        >
          {options.map((v) => (
            <option key={v} value={v}>
              {workspaceLabel(v)}
            </option>
          ))}
        </Select>
      ) : (
        <Input id={id} required={props.required !== false} {...props} />
      )}
    </div>
  );
}
async function photoData(file: File): Promise<string> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 5000000
  )
    throw new Error('Choose a JPEG, PNG or WebP image under 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 800 / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image preview is unavailable.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/jpeg', 0.55);
    if (result.length > 180000)
      throw new Error('Image is too large to save. Choose a smaller image.');
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
function CaptureForm({
  tab,
  prefill,
  send,
  close,
}: {
  tab: Tab;
  prefill: Prefill;
  send: (c: Command) => boolean;
  close: () => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const value = (n: string) => String(fd.get(n) ?? '').trim();
    const num = (n: string) => Number(value(n));
    try {
      const common = {
        outlet: value('outlet') as (typeof outlets)[number],
        product: value('product') as (typeof products)[number],
      };
      let c: Command;
      if (tab === 'Shelf checks')
        c = {
          action: 'check',
          ...common,
          stock: num('stock'),
          price: num('price'),
          display: value('display') as 'Meets standard' | 'Needs attention',
          note: value('note'),
          photo,
        };
      else if (tab === 'Stock gaps')
        c = {
          action: 'gap',
          ...common,
          priority: value('priority') as 'Urgent' | 'High' | 'Normal',
          note: value('note'),
        };
      else if (tab === 'Orders')
        c = {
          action: 'order',
          ...common,
          quantity: num('quantity'),
          gapId: prefill?.gapId ?? null,
          note: value('note'),
        };
      else if (tab === 'Competitor intel')
        c = {
          action: 'competitor',
          outlet: common.outlet,
          category: common.product,
          competitor: value('competitor'),
          price: num('price'),
          promotion: value('note'),
        };
      else
        c = {
          action: 'asset',
          name: value('asset'),
          location: value('location'),
          intervalDays: num('interval'),
          nextDue: lagosDateTimeToUtc(value('nextDue') + 'T17:00'),
        };
      if (send(c)) close();
    } catch {
      setError('Check the form values and dates.');
    }
  }
  const retail = tab !== 'Equipment';
  return (
    <Card className="mb-6">
      <CardHeader
        title={
          'New ' +
          (tab === 'Equipment'
            ? 'equipment record'
            : tab.toLowerCase().replace(/s$/, ''))
        }
        description="Enter the details below."
        actions={
          <Button
            type="button"
            variant="ghost"
            onClick={close}
            aria-label="Close entry form"
          >
            <X size={17} />
          </Button>
        }
      />
      <CardBody>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {retail ? (
            <>
              <Field
                label="Outlet"
                name="outlet"
                options={outlets}
                defaultValue={prefill?.outlet}
              />
              <Field
                label={
                  tab === 'Competitor intel' ? 'Product category' : 'Product'
                }
                name="product"
                options={products}
                defaultValue={prefill?.product}
              />
            </>
          ) : (
            <>
              <Field
                label="Equipment name"
                name="asset"
                minLength={3}
                maxLength={100}
              />
              <Field
                label="Equipment location"
                name="location"
                minLength={3}
                maxLength={160}
              />
              <Field
                label="Service interval (days)"
                name="interval"
                type="number"
                min={1}
                max={365}
                defaultValue={30}
              />
              <Field
                label="Next service date · Lagos time"
                name="nextDue"
                type="date"
                defaultValue={tomorrow()}
              />
            </>
          )}
          {tab === 'Shelf checks' ? (
            <>
              <Field
                label="Units on shelf"
                name="stock"
                type="number"
                min={0}
                max={10000}
                defaultValue={0}
              />
              <Field
                label="Shelf price · KES"
                name="price"
                type="number"
                min={0}
                max={1000000}
                step=".01"
              />
              <Field
                label="Display standard"
                name="display"
                options={['Meets standard', 'Needs attention']}
              />
              <div>
                <Label htmlFor="retail-photo">Shelf photo · optional</Label>
                <Input
                  id="retail-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    setPhoto(null);
                    if (!file) return;
                    setBusy(true);
                    setError('');
                    try {
                      setPhoto(await photoData(file));
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : 'Image could not be read.',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </div>
              {photo ? (
                <img
                  src={photo}
                  alt="Shelf photo"
                  className="h-32 w-40 rounded-lg object-cover"
                />
              ) : null}
            </>
          ) : null}
          {tab === 'Stock gaps' ? (
            <Field
              label="Priority"
              name="priority"
              options={['Normal', 'High', 'Urgent']}
            />
          ) : null}
          {tab === 'Orders' ? (
            <Field
              label="Requested quantity · units"
              name="quantity"
              type="number"
              min={1}
              max={10000}
              defaultValue={12}
            />
          ) : null}
          {tab === 'Competitor intel' ? (
            <>
              <Field
                label="Competitor name"
                name="competitor"
                minLength={3}
                maxLength={100}
              />
              <Field
                label="Observed price · KES"
                name="price"
                type="number"
                min=".01"
                max={1000000}
                step=".01"
              />
            </>
          ) : null}
          {retail ? (
            <div className="sm:col-span-2">
              <Field
                label={
                  tab === 'Competitor intel'
                    ? 'Promotion or observation'
                    : 'Notes / evidence description'
                }
                name="note"
                minLength={3}
                maxLength={600}
              />
            </div>
          ) : null}
          {prefill && tab === 'Orders' ? (
            <p className="text-xs text-deep sm:col-span-2">
              Linked to the selected stock gap. Outlet and product must match.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-bad sm:col-span-2">
              {error}
            </p>
          ) : null}
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Preparing photo…' : 'Save entry'}
            </Button>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
function StepForm({
  label,
  disabled,
  onSubmit,
  deadline = false,
}: {
  label: string;
  disabled: boolean;
  onSubmit: (note: string, day: string) => void;
  deadline?: boolean;
}) {
  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSubmit(String(fd.get('note')), String(fd.get('day') ?? ''));
      }}
    >
      {deadline ? (
        <div className="min-w-40 flex-1">
          <Field
            label="Follow-up deadline · Lagos time"
            name="day"
            type="date"
            defaultValue={tomorrow()}
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="min-w-40 flex-1">
          <Field
            label="Action notes"
            name="note"
            minLength={3}
            maxLength={600}
            disabled={disabled}
          />
        </div>
      )}
      <Button type="submit" size="sm" disabled={disabled}>
        {label}
      </Button>
    </form>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-ink/15 p-7 text-center text-sm text-muted">
      {text}
    </p>
  );
}

export function HananDemo() {
  const [session, setSession] = useState<Session | null>(null);
  const current = useRef<Session | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');
  const [role, setRole] = useState<Role>('Manager');
  const [simulate, setSimulate] = useState(false);
  const [connected, setConnected] = useState(true);
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState<Prefill>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('All priorities');
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    const online = () => setConnected(navigator.onLine);
    online();
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    try {
      const saved = localStorage.getItem(key);
      const value = withCompetitorSamples(
        saved ? sessionSchema.parse(JSON.parse(saved)) : initialSession(),
      );
      current.current = value;
      setSession(value);
    } catch {
      const value = initialSession();
      current.current = value;
      setSession(value);
      setError(
        'Saved workspace data could not be read. Restore sample data to start again.',
      );
    }
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
    };
  }, []);
  function persist(value: Session) {
    try {
      sessionSchema.parse(value);
      localStorage.setItem(key, JSON.stringify(value));
      current.current = value;
      setSession(value);
      return true;
    } catch {
      setError(
        'Your changes could not be saved. Free browser storage or restore the workspace and try again.',
      );
      return false;
    }
  }
  function send(command: Command): boolean {
    const prev = current.current;
    if (!prev) return false;
    setError('');
    setMessage('');
    try {
      const env = { id: crypto.randomUUID(), role, command };
      // Validate against current state and queued operations before accepting a draft.
      let projected = prev.data;
      for (const item of prev.queue) projected = applyCommand(projected, item);
      applyCommand(projected, env);
      if (simulate || !connected) {
        if (prev.queue.length >= 20)
          throw new Error(
            'The pending queue is full. Sync or discard updates first.',
          );
        if (!persist({ ...prev, queue: [...prev.queue, env] })) return false;
        setMessage(
          'Saved offline. Reconnect and select Sync updates to apply your changes.',
        );
      } else {
        if (prev.queue.length)
          throw new Error('Sync pending updates before making more changes.');
        if (!persist({ ...prev, data: applyCommand(prev.data, env) }))
          return false;
        setMessage('Entry saved.');
      }
      return true;
    } catch (err) {
      setError(
        err instanceof Error && err.name !== 'ZodError'
          ? err.message
          : 'Check required fields, text length and numeric values.',
      );
      return false;
    }
  }
  function sync() {
    const prev = current.current;
    if (!prev || simulate || !connected) return;
    setError('');
    let data = prev.data;
    let done = 0;
    for (const env of prev.queue) {
      try {
        data = applyCommand(data, env);
        done++;
      } catch (err) {
        setError(
          'Queue stopped: ' +
            (err instanceof Error ? err.message : 'Invalid entry.'),
        );
        break;
      }
    }
    if (persist({ ...prev, data, queue: prev.queue.slice(done) }))
      setMessage(done + ' updates applied to this workspace.');
  }
  const offline = simulate || !connected;
  if (!session)
    return (
      <main id="main-content" className="p-8">
        <p role="status">Opening your workspace…</p>
      </main>
    );
  const d = session.data;
  const gaps = d.gaps.filter((g) => g.status !== 'Resolved');
  const relevant = (s: string) =>
    workspaceLabel(s).toLowerCase().includes(search.toLowerCase());
  const switchTab = (next: Tab) => {
    setTab(next);
    setCreating(false);
    setPrefill(null);
    setSearch('');
    setError('');
    setMessage('');
  };
  const orderStep = (s: string) =>
    ({
      Requested: 'Approve request',
      Approved: 'Mark dispatched',
      Dispatched: 'Confirm receipt',
      Received: 'Received',
    })[s] ?? s;
  const assetsDue = d.assets.filter((a) => Date.parse(a.nextDue) < Date.now());
  return (
    <div className="fazoo-shell flex min-h-screen">
      <aside
        className="fazoo-glass-dark sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r px-3 py-5 xl:flex"
        aria-label="Workspace navigation"
      >
        <WorkspaceBrand />
        <div className="mx-2 mb-5 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] uppercase tracking-widest text-white/60">
            Organization
          </p>
          <p className="mt-2 text-sm font-semibold text-white">Hanan</p>
        </div>
        <p className="fazoo-nav-caption">Retail execution</p>
        <nav className="flex-1 space-y-1">
          {tabs.map(({ name, icon: Icon }) => (
            <button
              type="button"
              key={name}
              aria-current={tab === name ? 'page' : undefined}
              className="fazoo-nav-link w-full text-left"
              onClick={() => switchTab(name)}
            >
              <Icon size={17} aria-hidden="true" />
              {name}
              {name === 'Offline queue' && session.queue.length ? (
                <span className="ml-auto rounded-md bg-white/10 px-2">
                  {session.queue.length}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <Link href="/maintenance-preview" className="fazoo-nav-link mt-6">
          <Wrench size={17} />
          Service desk
          <ArrowUpRight size={14} />
        </Link>
        <Link href="/maintenance-preview/style" className="fazoo-nav-link">
          Operations overview
          <ArrowUpRight size={14} />
        </Link>
      </aside>
      <div className="flex w-full min-w-0 flex-col">
        <header className="fazoo-glass-dark flex items-center justify-between px-4 py-3 xl:hidden">
          <WorkspaceBrand />
          <span className="text-xs text-white/75">Hanan retail</span>
        </header>
        <main
          id="main-content"
          className="min-w-0 flex-1 px-4 py-6 sm:p-6 xl:p-8"
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs text-deep">
            <span>
              <strong>Retail operations</strong>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmReset(true)}
            >
              Restore sample data
            </Button>
          </div>
          {confirmReset ? (
            <Card className="mb-5">
              <CardBody>
                <p className="mb-3 text-sm">
                  Restore the starting records and clear pending updates in this
                  workspace?
                </p>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      if (persist(initialSession())) {
                        setConfirmReset(false);
                        setMessage('Starting data restored.');
                        setError('');
                      }
                    }}
                  >
                    Restore starting data
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmReset(false)}
                  >
                    Keep my workspace
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : null}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <label className="flex items-center gap-2">
              Workspace role
              <Select
                aria-label="Workspace role"
                className="w-auto"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {roles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={offline ? 'warning' : 'success'}>
                {!connected
                  ? 'Browser offline'
                  : simulate
                    ? 'Working offline'
                    : 'Browser online'}
              </Badge>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={simulate}
                  onChange={(e) => setSimulate(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Work offline
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={offline || !session.queue.length}
                onClick={sync}
              >
                Sync updates ({session.queue.length})
              </Button>
            </div>
          </div>
          <nav
            aria-label="Workspace sections"
            className="mb-6 flex gap-2 overflow-x-auto pb-2 xl:hidden"
          >
            {tabs.map(({ name }) => (
              <button
                type="button"
                key={name}
                aria-pressed={tab === name}
                className={
                  'min-h-11 shrink-0 rounded-lg border px-3 text-xs ' +
                  (tab === name
                    ? 'border-primary/30 bg-primary/10 text-deep'
                    : 'border-ink/10 bg-white text-muted')
                }
                onClick={() => switchTab(name)}
              >
                {name}
              </button>
            ))}
          </nav>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.18em] text-muted">
            Hanan / {tab}
          </p>
          <PageHeader
            title={tab === 'Overview' ? 'From shelf insight to action.' : tab}
            description="Manage retail visits, product availability, replenishment and equipment. Times shown in Lagos time."
          >
            {!['Overview', 'Offline queue'].includes(tab) ? (
              <Button
                type="button"
                onClick={() => {
                  setPrefill(null);
                  setCreating(true);
                }}
                disabled={
                  tab === 'Equipment'
                    ? role !== 'Manager'
                    : role === 'Technician'
                }
              >
                <Plus size={16} />
                New {tab === 'Equipment' ? 'equipment record' : 'entry'}
              </Button>
            ) : null}
          </PageHeader>
          {error ? (
            <p
              role="alert"
              className="mb-5 rounded-xl border border-bad/25 bg-bad/5 p-4 text-sm text-bad"
            >
              {error}
            </p>
          ) : null}
          {message ? (
            <p
              role="status"
              className="mb-5 rounded-xl border border-ok/25 bg-ok/5 p-4 text-sm text-ok"
            >
              {message}
            </p>
          ) : null}
          {creating ? (
            <CaptureForm
              key={tab + (prefill?.gapId ?? '')}
              tab={tab}
              prefill={prefill}
              send={send}
              close={() => setCreating(false)}
            />
          ) : null}
          {tab === 'Overview' ? (
            <>
              <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label="Open stock gaps"
                  value={gaps.length}
                  hint={
                    gaps.filter((g) => g.priority === 'Urgent').length +
                    ' urgent'
                  }
                />
                <StatCard
                  label="Pending orders"
                  value={d.orders.filter((o) => o.status !== 'Received').length}
                  hint="Awaiting fulfilment"
                />
                <StatCard
                  label="Shelf checks"
                  value={d.checks.length}
                  hint="Recorded visits"
                />
                <StatCard
                  label="Equipment due"
                  value={assetsDue.length}
                  hint="Recurring service plans"
                />
              </div>
              <div className="mb-6 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
                <div className="rounded-2xl bg-[linear-gradient(125deg,#19243f,#2c2449)] p-6 text-[#f4f0fc]">
                  <p className="text-[10px] uppercase tracking-[.18em] text-[#c5b4e4]">
                    One connected workflow
                  </p>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                    Spot it. Assign it. Resolve it.
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-[#cec8dd]">
                    A shelf check with zero stock opens a gap. Request
                    replenishment, track the order and submit shelf follow-up
                    for manager approval.
                  </p>
                  <Button
                    type="button"
                    className="mt-6 bg-[#d5c4ee] text-[#302040] hover:bg-[#e2d4f4]"
                    onClick={() => {
                      switchTab('Shelf checks');
                      setCreating(true);
                    }}
                  >
                    Try a shelf check
                    <ArrowUpRight size={16} />
                  </Button>
                </div>
                <Card>
                  <CardHeader
                    title="Action centre"
                    description="Items that need your attention"
                  />
                  <CardBody>
                    <div className="grid gap-3">
                      {[
                        [
                          'Stock gaps',
                          gaps.filter((g) => g.status === 'For review').length +
                            ' follow-ups awaiting review',
                        ],
                        [
                          'Orders',
                          d.orders.filter((o) => o.status === 'Requested')
                            .length + ' orders awaiting approval',
                        ],
                        ['Equipment', assetsDue.length + ' services due'],
                        [
                          'Offline queue',
                          session.queue.length + ' pending local submissions',
                        ],
                      ].map(([name, label]) => (
                        <button
                          type="button"
                          key={name}
                          onClick={() => switchTab(name as Tab)}
                          className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-ink/10 p-3 text-left text-xs"
                        >
                          <span>{label}</span>
                          <ArrowUpRight size={16} />
                        </button>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              </div>
              <Card>
                <CardHeader
                  title="Activity history"
                  description="Recent updates from your team"
                />
                <CardBody>
                  <ul className="divide-y divide-ink/8">
                    {d.events.slice(0, 8).map((e) => (
                      <li
                        key={e.id}
                        className="flex flex-wrap justify-between gap-3 py-3 text-xs"
                      >
                        <span>
                          <strong>{e.role}</strong> · {workspaceLabel(e.note)}
                        </span>
                        <span className="text-muted">{time(e.at)}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </>
          ) : null}
          {[
            'Stock gaps',
            'Orders',
            'Shelf checks',
            'Competitor intel',
            'Equipment',
          ].includes(tab) ? (
            <div className="mb-4 flex flex-wrap gap-3">
              <Input
                className="max-w-sm"
                aria-label="Search records"
                placeholder="Search this section"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {tab === 'Stock gaps' ? (
                <Select
                  className="w-auto"
                  aria-label="Gap priority filter"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  {['All priorities', 'Urgent', 'High', 'Normal'].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
              ) : null}
            </div>
          ) : null}
          {tab === 'Stock gaps' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {d.gaps
                .filter(
                  (g) =>
                    relevant(g.product + ' ' + g.outlet + ' ' + g.status) &&
                    (priority === 'All priorities' || priority === g.priority),
                )
                .sort((a, b) => rank[a.priority] - rank[b.priority])
                .map((g) => (
                  <Card
                    key={g.id}
                    className={g.priority !== 'Normal' ? 'border-l-4' : ''}
                    style={{
                      borderLeftColor:
                        g.priority === 'Urgent'
                          ? 'var(--color-bad)'
                          : g.priority === 'High'
                            ? 'var(--color-warn)'
                            : undefined,
                    }}
                  >
                    <CardBody>
                      <div className="flex flex-wrap justify-between gap-2">
                        <Badge
                          tone={
                            g.priority === 'Urgent'
                              ? 'danger'
                              : g.priority === 'High'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {g.priority} priority
                        </Badge>
                        <Badge
                          tone={g.status === 'Resolved' ? 'success' : 'purple'}
                        >
                          {g.status}
                        </Badge>
                      </div>
                      <h2 className="mt-4 text-sm font-semibold">
                        {workspaceLabel(g.product)}
                      </h2>
                      <p className="mt-1 text-xs text-muted">
                        {workspaceLabel(g.outlet)}
                      </p>
                      <p className="mt-3 text-sm">{workspaceLabel(g.note)}</p>
                      {g.dueAt ? (
                        <p
                          className={
                            'mt-3 text-xs ' +
                            (g.status !== 'Resolved' &&
                            Date.parse(g.dueAt) < Date.now()
                              ? 'font-semibold text-bad'
                              : 'text-muted')
                          }
                        >
                          Deadline: {time(g.dueAt)} · Field representative
                        </p>
                      ) : null}
                      {g.resolution ? (
                        <p className="mt-3 text-xs text-muted">
                          Follow-up: {workspaceLabel(g.resolution)}
                        </p>
                      ) : null}
                      {['Open', 'Assigned'].includes(g.status) ? (
                        <>
                          <StepForm
                            deadline
                            label={
                              g.status === 'Open'
                                ? 'Assign follow-up'
                                : 'Update deadline'
                            }
                            disabled={role !== 'Manager'}
                            onSubmit={(_, day) =>
                              send({
                                action: 'assign',
                                target: g.id,
                                dueAt: lagosDateTimeToUtc(day + 'T17:00'),
                              })
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            disabled={role === 'Technician'}
                            onClick={() => {
                              setPrefill({
                                gapId: g.id,
                                outlet: g.outlet,
                                product: g.product,
                              });
                              setTab('Orders');
                              setCreating(true);
                              setSearch('');
                            }}
                          >
                            Request replenishment
                          </Button>
                        </>
                      ) : null}
                      {g.status === 'Assigned' ? (
                        <StepForm
                          label="Submit shelf follow-up"
                          disabled={role !== 'Field worker'}
                          onSubmit={(note) =>
                            send({ action: 'resolve', target: g.id, note })
                          }
                        />
                      ) : null}
                      {g.status === 'For review' ? (
                        <>
                          <StepForm
                            label="Approve resolution"
                            disabled={role !== 'Manager'}
                            onSubmit={(note) =>
                              send({
                                action: 'review',
                                target: g.id,
                                approve: true,
                                note,
                              })
                            }
                          />
                          <StepForm
                            label="Return for follow-up"
                            disabled={role !== 'Manager'}
                            onSubmit={(note) =>
                              send({
                                action: 'review',
                                target: g.id,
                                approve: false,
                                note,
                              })
                            }
                          />
                        </>
                      ) : null}
                    </CardBody>
                  </Card>
                ))}
              {!d.gaps.some(
                (g) =>
                  relevant(g.product + ' ' + g.outlet + ' ' + g.status) &&
                  (priority === 'All priorities' || priority === g.priority),
              ) ? (
                <Empty text="No stock gaps match this view. Adjust your search or record a shelf check." />
              ) : null}
            </div>
          ) : null}
          {tab === 'Orders' ? (
            <>
              <p className="mb-4 text-xs leading-6 text-muted">
                Internal requests only. Dispatch and receipt are simulated. No
                inventory, delivery, invoice or payment system is connected.
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                {d.orders
                  .filter((o) => relevant(o.product + ' ' + o.outlet))
                  .map((o) => (
                    <Card key={o.id}>
                      <CardBody>
                        <div className="flex justify-between gap-3">
                          <h2 className="text-sm font-semibold">
                            {workspaceLabel(o.product)}
                          </h2>
                          <Badge
                            tone={
                              o.status === 'Received' ? 'success' : 'purple'
                            }
                          >
                            {o.status}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted">
                          {workspaceLabel(o.outlet)} · {o.quantity} units ·{' '}
                          {o.gapId ? 'Linked stock gap' : 'Standalone request'}
                        </p>
                        <p className="mt-3 text-sm">{workspaceLabel(o.note)}</p>
                        {o.status !== 'Received' ? (
                          <StepForm
                            label={orderStep(o.status)}
                            disabled={
                              o.status === 'Dispatched'
                                ? role !== 'Field worker'
                                : role !== 'Manager'
                            }
                            onSubmit={(note) =>
                              send({
                                action: 'advanceOrder',
                                target: o.id,
                                note,
                              })
                            }
                          />
                        ) : (
                          <p className="mt-4 text-xs text-ok">
                            Receipt confirmed. Shelf follow-up still needs
                            separate manager approval.
                          </p>
                        )}
                      </CardBody>
                    </Card>
                  ))}
                {!d.orders.some((o) => relevant(o.product + ' ' + o.outlet)) ? (
                  <Empty text="No order requests yet. Create one directly or from a stock gap." />
                ) : null}
              </div>
            </>
          ) : null}
          {tab === 'Shelf checks' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {d.checks
                .filter((c) => relevant(c.outlet + ' ' + c.product))
                .map((c) => (
                  <Card key={c.id}>
                    <CardBody>
                      <div className="flex justify-between gap-3">
                        <h2 className="text-sm font-semibold">
                          {workspaceLabel(c.product)}
                        </h2>
                        <Badge tone={c.stock === 0 ? 'danger' : 'success'}>
                          {c.stock} units
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        {workspaceLabel(c.outlet)} · KES {c.price.toFixed(2)} ·{' '}
                        {c.display}
                      </p>
                      <p className="mt-3 text-sm">{workspaceLabel(c.note)}</p>
                      {c.photo ? (
                        <img
                          src={c.photo}
                          alt={'Shelf evidence for ' + c.product}
                          className="mt-4 h-44 w-full rounded-xl object-contain"
                        />
                      ) : null}
                      <p className="mt-3 text-xs text-muted">
                        {time(c.createdAt)}
                      </p>
                    </CardBody>
                  </Card>
                ))}
              {!d.checks.some((c) => relevant(c.outlet + ' ' + c.product)) ? (
                <Empty text="No checks yet. A zero-stock check automatically opens or links a stock gap." />
              ) : null}
            </div>
          ) : null}
          {tab === 'Competitor intel' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <p className="rounded-xl border border-warn/20 bg-warn/5 p-4 text-xs leading-6 text-muted lg:col-span-2">
                Illustrative competitor prices for 10-roll tissue packs across
                three sample outlets.
              </p>
              {d.observations
                .filter((o) => relevant(o.competitor + ' ' + o.outlet))
                .map((o) => (
                  <Card key={o.id}>
                    <CardBody>
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold">
                          {workspaceLabel(o.competitor)}
                        </h2>
                        <Badge tone="warning">Sample data</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        {workspaceLabel(o.outlet)} ·{' '}
                        {workspaceLabel(o.category)}
                      </p>
                      <p className="mt-4 text-xl font-semibold">
                        KES {o.price.toFixed(2)}
                      </p>
                      <p className="mt-3 text-sm">
                        {workspaceLabel(o.promotion)}
                      </p>
                      <p className="mt-3 text-xs text-muted">
                        Updated {time(o.createdAt)} · Illustrative prices
                      </p>
                    </CardBody>
                  </Card>
                ))}
              {!d.observations.some((o) =>
                relevant(o.competitor + ' ' + o.outlet),
              ) ? (
                <Empty text="No competitor observations yet. Add a price or promotion." />
              ) : null}
            </div>
          ) : null}
          {tab === 'Equipment' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {d.assets
                .filter((a) => relevant(a.name + ' ' + a.location))
                .map((a) => {
                  const step = (
                    {
                      Scheduled: 'Assign',
                      Assigned: 'Start',
                      'In progress': 'Submit',
                      'For review': 'Approve',
                    } as const
                  )[a.status];
                  return (
                    <Card key={a.id}>
                      <CardBody>
                        <div className="flex flex-wrap justify-between gap-2">
                          <h2 className="text-sm font-semibold">
                            {workspaceLabel(a.name)}
                          </h2>
                          <Badge
                            tone={
                              Date.parse(a.nextDue) < Date.now()
                                ? 'warning'
                                : 'purple'
                            }
                          >
                            {a.status}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted">
                          {workspaceLabel(a.location)} · Every {a.intervalDays}{' '}
                          days
                        </p>
                        <p className="mt-3 text-xs">
                          Next service: {time(a.nextDue)}
                        </p>
                        <StepForm
                          label={step + ' service'}
                          disabled={
                            step === 'Assign' || step === 'Approve'
                              ? role !== 'Manager'
                              : role !== 'Technician'
                          }
                          onSubmit={(note) =>
                            send({
                              action: 'service',
                              target: a.id,
                              step,
                              note,
                            })
                          }
                        />
                        <h3 className="mt-5 text-xs font-semibold">
                          Service history
                        </h3>
                        {a.history.length ? (
                          <ul className="mt-2 space-y-2">
                            {a.history.slice(0, 6).map((h, i) => (
                              <li
                                key={h.at + i}
                                className="text-xs leading-6 text-muted"
                              >
                                {time(h.at)} · {workspaceLabel(h.note)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-xs text-muted">
                            No service events recorded yet.
                          </p>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
            </div>
          ) : null}
          {tab === 'Offline queue' ? (
            <Card>
              <CardHeader
                title={'Pending updates · ' + session.queue.length}
                description="Review saved updates and apply them when you reconnect."
              />
              <CardBody>
                <p className="mb-5 text-xs leading-6 text-muted">
                  Saved updates and photos remain available while you work
                  offline. Reconnect and apply pending changes to this
                  workspace.
                </p>
                <Button
                  type="button"
                  disabled={offline || !session.queue.length}
                  onClick={sync}
                >
                  Sync updates
                </Button>
                <ul className="mt-5 divide-y divide-ink/8">
                  {session.queue.map((q, i) => (
                    <li
                      key={q.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs"
                    >
                      <span>
                        {i + 1}. {q.command.action} · Captured as {q.role} ·
                        Pending local sync
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const prev = current.current;
                          if (prev)
                            persist({
                              ...prev,
                              queue: prev.queue.filter((e) => e.id !== q.id),
                            });
                        }}
                      >
                        Discard update
                      </Button>
                    </li>
                  ))}
                </ul>
                {!session.queue.length ? (
                  <Empty text="All updates are up to date." />
                ) : null}
              </CardBody>
            </Card>
          ) : null}
          <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-ink/10 pt-5 text-[10px] leading-5 text-muted">
            <span>FAZOO · Hanan · Sample workspace · Not affiliated</span>
            <span>Sample data · Changes stay in this browser</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
