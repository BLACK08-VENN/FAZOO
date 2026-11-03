'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ClipboardList,
  LayoutDashboard,
  MapPin,
  Plus,
  Search,
  Settings,
  Users,
  Wrench,
} from 'lucide-react';
import { WorkspaceBrand } from './workspace-brand';
import { ThemeToggle } from './theme-toggle';
import { PageHeader, StatCard } from './page';
import { Button } from './ui/button';
import { Card, CardBody, CardHeader } from './ui/card';
import { Input, Label, Select } from './ui/input';
import { Badge } from './ui/badge';
import { EmptyRow, Table, TableWrap, Td, Th } from './ui/table';

const sections = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Campaigns', icon: ClipboardList },
  { label: 'Reports', icon: BarChart3 },
  { label: 'Field workspace', icon: MapPin },
  { label: 'Settings', icon: Settings },
] as const;
type Section = (typeof sections)[number]['label'];
const sampleCampaigns = [
  { name: 'Retail activation', team: 'Field team', status: 'Active', sites: 8 },
  {
    name: 'Product showcase',
    team: 'Support team',
    status: 'Active',
    sites: 4,
  },
  {
    name: 'Seasonal campaign',
    team: 'Field team',
    status: 'Completed',
    sites: 6,
  },
];

/** Uses the real shared primitives; every number here is fictional preview content. */
export function WorkspaceStylePreview() {
  const [section, setSection] = useState<Section>('Overview');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All statuses');
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState('');
  const rows = sampleCampaigns.filter(
    (row) =>
      row.name.toLowerCase().includes(search.toLowerCase()) &&
      (status === 'All statuses' || row.status === status),
  );
  return (
    <div className="fazoo-shell flex min-h-screen">
      <aside
        className="fazoo-glass-dark sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r px-3 py-5 xl:flex"
        aria-label="Workspace navigation"
      >
        <WorkspaceBrand />
        <div className="mx-2 mb-6 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] uppercase tracking-widest text-white/50">
            Your workspace
          </p>
          <p className="mt-2 text-sm font-medium text-white">
            Operations workspace
          </p>
        </div>
        <p className="fazoo-nav-caption">Workspace</p>
        <nav className="flex-1 space-y-1" aria-label="Workspace sections">
          {sections.map(({ label, icon: Icon }) => (
            <button
              type="button"
              key={label}
              className="fazoo-nav-link w-full text-left"
              aria-current={section === label ? 'page' : undefined}
              onClick={() => {
                setSection(label);
                setNotice('');
              }}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </button>
          ))}
          <Link href="/maintenance-preview" className="fazoo-nav-link">
            <Wrench size={17} aria-hidden="true" />
            Service desk
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </nav>
        <div className="mt-6 border-t border-white/10 pt-4">
          <ThemeToggle />
          <p className="mt-4 px-3 text-xs text-white/60">Sample workspace</p>
        </div>
      </aside>
      <div className="flex w-full min-w-0 flex-col">
        <header className="fazoo-glass-dark flex min-h-[60px] items-center justify-between gap-4 px-4 py-2 xl:hidden">
          <WorkspaceBrand />
          <div className="shrink-0">
            <ThemeToggle />
          </div>
        </header>
        <main
          id="main-content"
          className="min-w-0 flex-1 px-4 py-6 sm:p-6 xl:p-8"
        >
          <div className="mb-7 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs text-deep">
            <span>
              <strong>Operations workspace</strong>
            </span>
            <Link
              className="font-semibold underline"
              href="/maintenance-preview"
            >
              Open service desk
            </Link>
          </div>
          <nav
            aria-label="Workspace sections"
            className="mb-6 flex gap-2 overflow-x-auto pb-2 xl:hidden"
          >
            {sections.map(({ label }) => (
              <button
                type="button"
                key={label}
                aria-pressed={section === label}
                onClick={() => setSection(label)}
                className={`min-h-11 shrink-0 rounded-[10px] border px-4 text-xs font-medium ${section === label ? 'border-primary/20 bg-primary/10 text-deep' : 'border-ink/10 bg-white text-muted'}`}
              >
                {label}
              </button>
            ))}
          </nav>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.18em] text-muted">
            Your workspace / {section}
          </p>
          <PageHeader
            title={section === 'Overview' ? 'One clear picture.' : section}
            description={
              section === 'Overview'
                ? 'Your people, field activity and services. Together in one workspace.'
                : `Manage your ${section.toLowerCase()} in one place.`
            }
          >
            {section === 'Campaigns' ? (
              <Button type="button" onClick={() => setShowForm(!showForm)}>
                <Plus size={16} aria-hidden="true" />
                New campaign
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setSection('Reports')}
              >
                <BarChart3 size={16} aria-hidden="true" />
                View reports
              </Button>
            )}
          </PageHeader>
          {notice ? (
            <p
              role="status"
              className="mb-5 rounded-xl border border-ok/20 bg-ok/10 p-3 text-sm text-ok"
            >
              {notice}
            </p>
          ) : null}
          {section === 'Overview' || section === 'Reports' ? (
            <>
              <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label="Active campaigns"
                  value="2"
                  hint="Current campaigns"
                />
                <StatCard label="Field team" value="12" hint="Assigned staff" />
                <StatCard
                  label="Visits completed"
                  value="36"
                  hint="Of 42 planned visits"
                />
                <StatCard
                  label="Reports to review"
                  value="4"
                  hint="Awaiting your review"
                />
              </div>
              {section === 'Overview' ? (
                <div className="mb-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                  <div className="rounded-2xl border border-white/10 bg-[linear-gradient(125deg,#19243f,#2c2449)] p-6 text-[#f4f0fc]">
                    <p className="text-[10px] uppercase tracking-[.18em] text-[#c5b4e4]">
                      Field & service operations
                    </p>
                    <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                      Focus on what needs you.
                    </h2>
                    <p className="mt-3 max-w-md text-xs leading-6 text-[#cec8dd]">
                      Review your team’s activity, keep service work moving and
                      follow each task through to completion.
                    </p>
                    <Link
                      href="/maintenance-preview"
                      className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[#d5c4ee] px-4 text-xs font-semibold text-[#302040]"
                    >
                      Open service desk
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                  <Card>
                    <CardHeader
                      title="Needs attention"
                      description="Items for your next review"
                    />
                    <CardBody>
                      <ul className="divide-y divide-ink/8">
                        {[
                          '1 urgent maintenance job',
                          '4 reports awaiting review',
                          '2 active campaigns',
                        ].map((text, index) => (
                          <li
                            key={text}
                            className="flex items-center justify-between gap-3 py-3 text-xs text-ink"
                          >
                            <span>{text}</span>
                            {index === 0 ? (
                              <Link
                                href="/maintenance-preview"
                                aria-label={`Review ${text}`}
                                className="inline-flex min-h-10 items-center justify-center rounded-[10px] px-3 hover:bg-lavender focus-visible:outline-2 focus-visible:outline-primary"
                              >
                                <ArrowUpRight size={16} aria-hidden="true" />
                              </Link>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                type="button"
                                aria-label={`Review ${text}`}
                                onClick={() =>
                                  setSection(
                                    index === 1 ? 'Reports' : 'Campaigns',
                                  )
                                }
                              >
                                <ArrowUpRight size={16} aria-hidden="true" />
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </CardBody>
                  </Card>
                </div>
              ) : (
                <Card className="mb-6">
                  <CardHeader
                    title="Visit completion"
                    description="Visit progress across your team"
                  />
                  <CardBody>
                    <div className="flex items-center justify-between text-sm">
                      <span>Completed visits</span>
                      <strong>36 / 42</strong>
                    </div>
                    <progress
                      aria-label="Visits completed"
                      className="mt-4 h-2 w-full accent-primary"
                      value={36}
                      max={42}
                    />
                    <p className="mt-3 text-xs text-muted">
                      6 visits remain in the current plan.
                    </p>
                  </CardBody>
                </Card>
              )}
            </>
          ) : null}
          {section === 'Overview' ||
          section === 'Campaigns' ||
          section === 'Reports' ? (
            <>
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h2 className="text-sm font-semibold text-ink">
                  {section === 'Reports'
                    ? 'Campaign summary'
                    : 'Campaign activity'}
                </h2>
                <div className="flex flex-wrap gap-2">
                  <div className="relative min-w-0 flex-1 sm:w-56">
                    <Search
                      className="pointer-events-none absolute left-3 top-3.5 text-muted"
                      size={15}
                      aria-hidden="true"
                    />
                    <Input
                      aria-label="Search campaigns"
                      className="pl-9"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search campaigns"
                    />
                  </div>
                  <Select
                    aria-label="Filter campaign status"
                    className="w-auto"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option>All statuses</option>
                    <option>Active</option>
                    <option>Completed</option>
                  </Select>
                </div>
              </div>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Campaign</Th>
                      <Th>Team</Th>
                      <Th>Sites</Th>
                      <Th>Status</Th>
                      <Th>
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length ? (
                      rows.map((row) => (
                        <tr key={row.name}>
                          <Td className="font-medium">{row.name}</Td>
                          <Td className="text-muted">{row.team}</Td>
                          <Td>{row.sites}</Td>
                          <Td>
                            <Badge
                              tone={
                                row.status === 'Active' ? 'success' : 'purple'
                              }
                            >
                              {row.status}
                            </Badge>
                          </Td>
                          <Td>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              aria-label={`View ${row.name}`}
                              onClick={() =>
                                setNotice(
                                  `${row.name}: activity details are available in your signed-in workspace.`,
                                )
                              }
                            >
                              <ArrowUpRight size={16} aria-hidden="true" />
                            </Button>
                          </Td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow colSpan={5}>
                        No campaigns match your filters.
                      </EmptyRow>
                    )}
                  </tbody>
                </Table>
              </TableWrap>
              {showForm && section === 'Campaigns' ? (
                <Card className="mt-6">
                  <CardHeader
                    title="New campaign"
                    description="Review the campaign details below"
                  />
                  <CardBody>
                    <form
                      className="grid gap-4 sm:grid-cols-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setNotice('Campaign details reviewed.');
                      }}
                    >
                      <div>
                        <Label htmlFor="sample-name">Campaign name</Label>
                        <Input
                          id="sample-name"
                          required
                          placeholder="Enter campaign name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="sample-date">Start date</Label>
                        <Input id="sample-date" required type="date" />
                      </div>
                      <div className="flex gap-2 sm:col-span-2">
                        <Button type="submit">Review campaign</Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowForm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </CardBody>
                </Card>
              ) : null}
            </>
          ) : null}
          {section === 'Field workspace' ? (
            <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
              <Card>
                <CardHeader
                  title="Today’s work"
                  description="Your assigned visits and tasks"
                />
                <CardBody>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <MapPin size={21} aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold">Your next visit</h2>
                      <p className="mt-1 text-xs text-muted">
                        Assigned site · Visit scheduled
                      </p>
                    </div>
                    <Badge tone="purple">Scheduled</Badge>
                  </div>
                  <p className="mb-5 text-xs leading-6 text-muted">
                    Store details, visit tasks and updates stay in one focused
                    workspace.
                  </p>
                  <Button
                    type="button"
                    onClick={() =>
                      setNotice(
                        'Sign in to your field account to record a visit.',
                      )
                    }
                  >
                    View visit tasks
                  </Button>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Quick actions" />
                <CardBody>
                  <div className="grid gap-3">
                    <Link
                      href="/maintenance-preview"
                      className="flex min-h-11 items-center justify-between rounded-xl border border-ink/10 p-3 text-xs font-medium"
                    >
                      Report a service issue
                      <Wrench size={16} aria-hidden="true" />
                    </Link>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setNotice(
                          'Leave requests keep their existing workflow in the authenticated app.',
                        )
                      }
                    >
                      <Users size={16} aria-hidden="true" />
                      Apply for leave
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </div>
          ) : null}
          {section === 'Settings' ? (
            <Card className="max-w-2xl">
              <CardHeader
                title="Workspace preferences"
                description="Manage your workspace preferences"
              />
              <CardBody>
                <form
                  className="space-y-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setNotice('Preferences reviewed.');
                  }}
                >
                  <div>
                    <Label htmlFor="demo-workspace-name">Workspace name</Label>
                    <Input
                      id="demo-workspace-name"
                      defaultValue="Operations workspace"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="demo-digest">Activity summary</Label>
                    <Select id="demo-digest">
                      <option>Daily summary</option>
                      <option>Weekly summary</option>
                    </Select>
                  </div>
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="size-4 accent-primary"
                    />
                    Show task reminders
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <Button type="submit">
                      <Check size={16} aria-hidden="true" />
                      Review preferences
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSection('Overview')}
                    >
                      Back to overview
                    </Button>
                    <Button type="button" disabled>
                      Disabled action
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          ) : null}
          <footer className="mt-8 flex justify-between gap-4 border-t border-ink/10 pt-5 text-[10px] text-muted">
            <span>FAZOO · Field & service operations</span>
            <span>Sample workspace · No live systems connected</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
