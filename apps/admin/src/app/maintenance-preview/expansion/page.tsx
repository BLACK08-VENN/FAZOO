import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowUpRight,
  Layers3,
  LayoutDashboard,
  LogIn,
  Store,
  Truck,
  Wrench,
} from 'lucide-react';
import { WorkspaceBrand } from '@/components/workspace-brand';

export const metadata = {
  title: 'Fazoo workspaces',
  robots: { index: false, follow: false },
};
const previews = [
  {
    title: 'Logistics & daily operations',
    description:
      'Allocate daily tasks, track deliveries and collections, report delays and review completion evidence.',
    href: '/maintenance-preview/operations',
    icon: Truck,
    label: 'Daily operations',
  },
  {
    title: 'My work · Field teams',
    description:
      'See your assignments, respond to notifications, record arrival and submit completed jobs or store visits.',
    href: '/maintenance-preview/my-work',
    icon: LayoutDashboard,
    label: 'Personal workspace',
  },
  {
    title: 'Sign in & request access',
    description: 'Access your account or request access for your organization.',
    href: '/sign-in',
    icon: LogIn,
    label: 'Account access',
  },
  {
    title: 'Operations overview',
    description: 'Review campaigns, team activity, reports and workspace preferences.',
    href: '/maintenance-preview/style',
    icon: LayoutDashboard,
    label: 'Operations',
  },
  {
    title: 'Maintenance & services',
    description:
      'Report an issue, assign a technician, track progress and approve completed work.',
    href: '/maintenance-preview',
    icon: Wrench,
    label: 'Service operations',
  },
  {
    title: 'Hanan · Retail operations',
    description:
      'Manage shelf availability, replenishment, competitor observations and equipment servicing.',
    href: '/maintenance-preview/hanan',
    icon: Store,
    label: 'Retail workspace',
  },
  {
    title: 'Airtel · Network maintenance',
    description:
      'Coordinate network faults, fibre-link repairs, equipment inspections and technician work.',
    href: '/maintenance-preview/airtel',
    icon: Wrench,
    label: 'Network operations',
  },
] as const;
export default function ExpansionPreviewHome() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.NEXT_PUBLIC_SUPABASE_URL) notFound();
  return (
    <main id="main-content" className="fazoo-shell min-h-screen px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="fazoo-glass-dark mb-8 rounded-2xl p-5 sm:p-8">
          <WorkspaceBrand />
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[.2em] text-[#c5b4e4]">
            Your operations, connected
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#f4f0fc] sm:text-4xl">
            Your work. One workspace.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#cec8dd]">
            Choose a workspace to manage field activity, retail execution and service
            operations.
          </p>
          <span className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80">
            <Layers3 size={15} aria-hidden="true" />
            Field teams · Retail · Maintenance · Logistics
          </span>
        </div>
        <section className="grid gap-5 md:grid-cols-2" aria-label="Available workspaces">
          {previews.map(({ title, description, href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="fazoo-card group flex flex-col rounded-2xl border bg-white p-6 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon size={21} aria-hidden="true" />
                </span>
                <span className="text-[10px] font-medium text-muted">{label}</span>
              </div>
              <h2 className="mt-5 text-lg font-semibold tracking-tight text-ink">{title}</h2>
              <p className="mt-3 flex-1 text-xs leading-6 text-muted">{description}</p>
              <span className="mt-6 flex items-center gap-2 text-xs font-semibold text-deep">
                Open workspace
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </section>
        <section
          className="mt-7 border-t border-ink/10 pt-5"
          aria-label="Workspace information"
        >
          <h2 className="sr-only">About these workspaces</h2>
          <p className="mt-3 text-xs leading-6 text-muted">
            Sample workspaces. Not affiliated with Hanan or Airtel. Company activity and
            competitor prices are illustrative; no live systems are connected.
          </p>
          <p className="mt-3 text-xs leading-6 text-muted">
            Sign in with an approved account to access your organization’s campaigns, reports
            and approvals.
          </p>
        </section>
        <footer className="mt-8 border-t border-ink/10 pt-5 text-[10px] text-muted">
          FAZOO · Field & service operations
        </footer>
      </div>
    </main>
  );
}
