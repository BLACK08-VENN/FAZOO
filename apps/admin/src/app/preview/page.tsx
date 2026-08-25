import Link from 'next/link';
import {
  Activity,
  BarChart3,
  Boxes,
  CalendarCheck2,
  ChevronRight,
  ClipboardList,
  Download,
  MapPin,
  ScrollText,
  Settings,
  Store,
  Users,
} from 'lucide-react';

const NAV = [
  ['overview', 'Overview', BarChart3],
  ['daily-logs', 'Daily Logs', CalendarCheck2],
  ['sales', 'Sales', ClipboardList],
  ['brand-ambassadors', 'Brand Ambassadors', Users],
  ['stores', 'Stores', MapPin],
  ['skus', 'SKUs', Boxes],
  ['campaigns', 'Campaigns', Store],
  ['reports', 'Reports', Download],
  ['audit-logs', 'Audit Logs', ScrollText],
  ['settings', 'Settings', Settings],
] as const;

type Section = (typeof NAV)[number][0];

const SECTION_COPY: Record<Section, [string, string]> = {
  overview: ['Overview', 'Attendance and sales across the selected range.'],
  'daily-logs': ['Daily Logs', 'Every check-in, checkout and attendance record in Nigerian time.'],
  sales: ['Sales Intelligence', 'Store, product and field-team performance.'],
  'brand-ambassadors': ['Brand Ambassadors', 'Approvals, status and field activity.'],
  stores: ['Stores', 'Locations, coverage and geofence health.'],
  skus: ['SKUs', 'Products available for field sales recording.'],
  campaigns: ['Campaigns', 'Active programs and territory assignments.'],
  reports: ['Reports', 'Export-ready operational data.'],
  'audit-logs': ['Audit Logs', 'Sensitive actions across your organization.'],
  settings: ['Settings', 'Organization and field-operation policies.'],
};

const logs = [
  ['25 Aug', 'Amara Okafor', 'Jumia Experience Centre', '09:04', 'Open', '8'],
  ['25 Aug', 'Tobi Adeyemi', 'Slot Ikeja', '08:47', 'Completed', '12'],
  ['25 Aug', 'Zainab Musa', 'Pointek Yaba', '09:12', 'Completed', '6'],
  ['24 Aug', 'David Eze', 'Slot Surulere', '08:56', 'Completed', '15'],
];

const stores = [
  ['Slot Ikeja', 'Computer Village, Ikeja', '14', '92%'],
  ['Jumia Experience Centre', 'Yaba, Lagos', '11', '86%'],
  ['Pointek Yaba', 'Herbert Macaulay Way', '9', '89%'],
  ['Slot Surulere', 'Bode Thomas Street', '8', '95%'],
];

const bas = [
  ['Amara Okafor', 'BA-1042', 'Slot Ikeja', 'Active'],
  ['Tobi Adeyemi', 'BA-1071', 'Jumia Experience Centre', 'Active'],
  ['Zainab Musa', 'BA-1098', 'Pointek Yaba', 'Active'],
  ['David Eze', 'BA-1104', 'Slot Surulere', 'Review'],
];

const salesByStore = [
  ['Slot Ikeja', '382', '14', '92%', 'ThinkPad E14'],
  ['Jumia Experience Centre', '316', '11', '86%', 'IdeaPad Slim 3'],
  ['Pointek Yaba', '289', '9', '89%', 'ThinkBook 14'],
  ['Slot Surulere', '244', '8', '95%', 'Yoga 7'],
];

function Badge({ children, tone = 'purple' }: { children: React.ReactNode; tone?: 'purple' | 'green' | 'amber' }) {
  const styles = tone === 'green' ? 'bg-emerald-50 text-emerald-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-primary/[0.08] text-deep';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${styles}`}>{children}</span>;
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-ink/[0.07] bg-white shadow-[0_14px_45px_rgba(35,18,44,.045)] ${className}`}>{children}</div>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <Panel className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#faf9fb] text-[10px] uppercase tracking-[0.1em] text-muted">
            <tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-5 py-3.5 font-bold">{header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-ink/[0.055]">
            {rows.map((row, index) => (
              <tr key={`${row[0]}-${index}`} className="transition-colors hover:bg-primary/[0.025]">
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`} className={`whitespace-nowrap px-5 py-4 ${cellIndex === 0 ? 'font-semibold text-ink' : 'text-muted'}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Overview() {
  const stats = [['BA-days', '126', '+8.2%'], ['Units sold', '684', '+14.6%'], ['Completion', '92%', '+3.1%'], ['Active stores', '42', 'Live']];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, value, change]) => (
          <Panel key={label} className="relative overflow-hidden p-5">
            <div className="absolute -right-8 -top-8 size-24 rounded-full bg-primary/[0.06] blur-xl" />
            <p className="text-xs font-medium text-muted">{label}</p>
            <div className="mt-3 flex items-end justify-between"><strong className="text-3xl tracking-[-0.04em]">{value}</strong><span className="text-[11px] font-semibold text-emerald-600">{change}</span></div>
          </Panel>
        ))}
      </div>
      <div className="mt-5">
        <Panel className="p-5">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold">Sales velocity</h2><p className="mt-1 text-xs text-muted">Last 7 operational days</p></div><Badge>Live</Badge></div>
          <div className="mt-8 flex h-52 items-end gap-3">
            {[38, 56, 49, 72, 63, 88, 78].map((height, index) => <div key={index} className="group flex h-full flex-1 items-end"><div style={{ height: `${height}%` }} className="w-full rounded-t-lg bg-gradient-to-t from-[#65219a] to-[#c46df5] opacity-85 transition-opacity group-hover:opacity-100" /></div>)}
          </div>
          <div className="mt-3 grid grid-cols-7 text-center text-[10px] uppercase text-muted">{['M','T','W','T','F','S','S'].map((d, i) => <span key={`${d}-${i}`}>{d}</span>)}</div>
        </Panel>
      </div>
    </>
  );
}

function SectionContent({ section }: { section: Section }) {
  if (section === 'overview') return <Overview />;
  if (section === 'daily-logs') return <DataTable headers={['Date', 'Brand Ambassador', 'Store', 'Check-in', 'Status', 'Units']} rows={logs} />;
  if (section === 'stores') return <DataTable headers={['Store', 'Address', 'BA-days', 'Compliance']} rows={stores} />;
  if (section === 'brand-ambassadors') return <DataTable headers={['Name', 'ID', 'Current store', 'Status']} rows={bas} />;
  if (section === 'skus') return <DataTable headers={['Product', 'Code', 'Campaign', 'Units', 'Status']} rows={[
    ['ThinkPad E14 Gen 6', 'TP-E14-G6', 'Lenovo Retail Q3', '214', 'Active'], ['IdeaPad Slim 3', 'IP-S3-15', 'Lenovo Retail Q3', '186', 'Active'], ['ThinkBook 14', 'TB-14-G7', 'SMB Push', '148', 'Active'], ['Yoga 7 2-in-1', 'YG7-14', 'Premium Retail', '96', 'Active'],
  ]} />;
  if (section === 'campaigns') return <DataTable headers={['Campaign', 'Period', 'BAs', 'Stores', 'Status']} rows={[
    ['Lenovo Retail Q3', '01 Jul – 30 Sep', '18', '24', 'Active'], ['Premium Retail', '15 Aug – 15 Nov', '8', '10', 'Active'], ['SMB Push', '01 Aug – 31 Oct', '12', '16', 'Active'], ['Back to School', '01 Jun – 31 Jul', '20', '28', 'Completed'],
  ]} />;
  if (section === 'sales') return <><div className="mb-5 grid gap-4 sm:grid-cols-3"><Metric label="Units this month" value="2,482" /><Metric label="Top store" value="Slot Ikeja" /><Metric label="Daily average" value="82.7" /></div><DataTable headers={['Store', 'Units', 'BA-days', 'Completion', 'Top SKU']} rows={salesByStore} /></>;
  if (section === 'reports') return <><Panel className="mb-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Daily operations export</h2><p className="mt-1 text-sm text-muted">Filtered report · 126 rows · Africa/Lagos</p></div><button type="button" disabled className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white opacity-70"><Download size={15} /> Download CSV</button></Panel><DataTable headers={['Report', 'Range', 'Rows', 'Generated']} rows={[["Daily operations", "01–25 Aug 2026", "126", "Preview"], ["Sales by store", "01–25 Aug 2026", "42", "Preview"], ["Attendance exceptions", "01–25 Aug 2026", "8", "Preview"]]} /></>;
  if (section === 'audit-logs') return <DataTable headers={['When', 'Actor', 'Action', 'Entity', 'Result']} rows={[
    ['Today, 10:42', 'Ngozi Admin', 'account.approved', 'BA-1128', 'Success'], ['Today, 09:18', 'System', 'checkout.flagged', 'LOG-8421', 'Review'], ['Yesterday, 16:03', 'Ngozi Admin', 'store.updated', 'Slot Ikeja', 'Success'], ['Yesterday, 14:31', 'Tunde Supervisor', 'assignment.changed', 'BA-1071', 'Success'],
  ]} />;
  return <div className="grid gap-5 lg:grid-cols-2"><Panel className="p-6"><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Organization</p><h2 className="mt-4 text-xl font-semibold">Lenovo Nigeria · Demo</h2><dl className="mt-6 space-y-4 text-sm"><Setting label="Workspace" value="lenovo-nigeria" /><Setting label="Timezone" value="Africa/Lagos" /><Setting label="Status" value="Active" /></dl></Panel><Panel className="p-6"><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Geofence policy</p><h2 className="mt-4 text-xl font-semibold">Strict verification</h2><p className="mt-3 text-sm leading-6 text-muted">Check-in outside the configured store radius is blocked. Out-of-range checkout is flagged for administrative review.</p><div className="mt-6"><Badge tone="green">Policy active</Badge></div></Panel></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <Panel className="p-5"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p></Panel>; }
function Setting({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-ink/[0.06] pb-3"><dt className="text-muted">{label}</dt><dd className="font-medium">{value}</dd></div>; }

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const requested = (await searchParams).section;
  const section: Section = NAV.some(([key]) => key === requested) ? requested as Section : 'overview';
  const [title, description] = SECTION_COPY[section];

  return (
    <main className="flex min-h-screen bg-[#f7f5f9] text-ink">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-hidden bg-[#0c0a0f] p-4 text-white lg:flex">
        <div className="absolute left-0 top-0 h-72 w-64 bg-primary/15 blur-3xl" />
        <div className="relative flex items-center gap-3 px-3 py-3"><span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#b65df0] to-[#63208f] font-black shadow-[0_0_24px_rgba(182,93,240,.3)]">F</span><div><p className="font-bold">Fazoo</p><p className="text-[9px] uppercase tracking-[0.18em] text-white/35">Operations OS</p></div></div>
        <div className="relative my-5 rounded-xl border border-[#c56bf5]/15 bg-[#c56bf5]/[0.06] px-3 py-2.5 text-[10px] uppercase tracking-[0.12em] text-[#ddb2f7]"><span className="mr-2 inline-block size-1.5 rounded-full bg-emerald-400" />Preview environment</div>
        <nav aria-label="Preview pages" className="relative flex-1 space-y-1 overflow-y-auto">
          {NAV.map(([key, label, Icon]) => <Link key={key} href={`/preview?section=${key}`} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${section === key ? 'bg-white/[0.1] text-white shadow-[inset_3px_0_0_#b65df0]' : 'text-white/48 hover:bg-white/[0.05] hover:text-white/80'}`}><Icon size={16} aria-hidden />{label}{section === key ? <ChevronRight className="ml-auto" size={13} /> : null}</Link>)}
        </nav>
        <div className="relative border-t border-white/[0.08] px-3 pt-4"><p className="text-sm font-semibold">Ngozi Admin</p><p className="mt-0.5 text-xs text-white/35">Organization admin</p><Link href="/sign-in" className="mt-4 block text-xs text-[#cf8df5] hover:text-white">Exit preview</Link></div>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-ink/[0.06] bg-white/75 px-5 py-4 backdrop-blur-xl lg:px-8"><div className="flex items-center gap-2 text-xs font-medium text-muted"><Activity size={14} className="text-emerald-500" /> All systems operational</div><Badge>Demo data</Badge></header>
        <div className="border-b border-ink/[0.06] bg-[#0c0a0f] px-4 py-2 lg:hidden"><nav className="flex gap-2 overflow-x-auto">{NAV.map(([key, label]) => <Link key={key} href={`/preview?section=${key}`} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs ${section === key ? 'bg-primary text-white' : 'text-white/55'}`}>{label}</Link>)}</nav></div>
        <div className="p-5 sm:p-7 lg:p-9">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Workspace / {title}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{title}</h1><p className="mt-2 text-sm text-muted">{description}</p></div><div className="flex gap-2"><button type="button" className="rounded-xl border border-ink/[0.08] bg-white px-4 py-2 text-xs font-semibold">Last 30 days</button><button type="button" className="rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-white">Aug 2026</button></div></div>
          <SectionContent section={section} />
        </div>
      </section>
    </main>
  );
}
