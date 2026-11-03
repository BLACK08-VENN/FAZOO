import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowUpRight,
  Layers3,
  LayoutDashboard,
  LogIn,
  Store,
  Wrench,
} from 'lucide-react';
import { WorkspaceBrand } from '@/components/workspace-brand';

export const metadata = {
  title: 'Fazoo expansion preview',
  robots: { index: false, follow: false },
};
const previews = [
  {
    title: 'Sign-in & request access',
    description:
      'The approved glass sign-in design, collapsible role choices and access-request arrangement.',
    href: '/sign-in',
    icon: LogIn,
    label: 'Authentication design',
  },
  {
    title: 'App-wide styling',
    description:
      'Navy navigation, lavender surfaces, dashboards, campaign tables, forms and light/dark themes.',
    href: '/maintenance-preview/style',
    icon: LayoutDashboard,
    label: 'Workspace design',
  },
  {
    title: 'Maintenance & services',
    description:
      'Report a job, emphasize priority, add a location pin, assign a technician and approve completion.',
    href: '/maintenance-preview',
    icon: Wrench,
    label: 'Interactive workflow',
  },
  {
    title: 'Hanan retail case study',
    description:
      'Shelf checks, stock gaps, replenishment, Toilex and Celine sample comparisons, equipment servicing and an offline queue.',
    href: '/maintenance-preview/hanan',
    icon: Store,
    label: 'Interactive case study',
  },
  {
    title: 'Airtel maintenance case study',
    description:
      'Fictional internet-service faults, fibre-link jobs, router inspections, parts delays and technician-to-manager completion approval.',
    href: '/maintenance-preview/airtel',
    icon: Wrench,
    label: 'ISP maintenance demo',
  },
] as const;
export default function ExpansionPreviewHome() {
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  )
    notFound();
  return (
    <main
      id="main-content"
      className="fazoo-shell min-h-screen px-4 py-8 sm:px-8 sm:py-12"
    >
      <div className="mx-auto max-w-6xl">
        <div className="fazoo-glass-dark mb-8 rounded-2xl p-5 sm:p-8">
          <WorkspaceBrand />
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[.2em] text-[#c5b4e4]">
            One place to review every change
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#f4f0fc] sm:text-4xl">
            Fazoo expansion preview.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#cec8dd]">
            Explore the combined expansion and maintenance work. Choose a
            workspace below, then use the preview navigation to move between
            demos.
          </p>
          <span className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80">
            <Layers3 size={15} aria-hidden="true" />
            Combined preview · Main app unchanged
          </span>
        </div>
        <section
          className="grid gap-5 md:grid-cols-2"
          aria-label="Available previews"
        >
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
                <span className="text-[10px] font-medium text-muted">
                  {label}
                </span>
              </div>
              <h2 className="mt-5 text-lg font-semibold tracking-tight text-ink">
                {title}
              </h2>
              <p className="mt-3 flex-1 text-xs leading-6 text-muted">
                {description}
              </p>
              <span className="mt-6 flex items-center gap-2 text-xs font-semibold text-deep">
                Open preview
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </section>
        <section
          className="mt-7 rounded-2xl border border-primary/15 bg-primary/5 p-5 sm:p-6"
          aria-label="Preview information"
        >
          <h2 className="text-sm font-semibold text-ink">
            What you can try here
          </h2>
          <p className="mt-3 text-xs leading-6 text-muted">
            The interactive demos use fictional records and stay in your
            browser. No company data, supplier orders, payments or external
            notifications are sent. The Hanan and Airtel case studies are
            unaffiliated. All company scenarios and competitor prices are
            illustrative.
          </p>
          <p className="mt-3 text-xs leading-6 text-muted">
            Client campaign requests, administrator approvals and brand
            analytics are also included in the combined branch. Those
            account-based screens require a configured test account and
            database; use the sample workspace above to review the visual design
            here.
          </p>
        </section>
        <footer className="mt-8 border-t border-ink/10 pt-5 text-[10px] text-muted">
          FAZOO · Field & service operations · Expansion review
        </footer>
      </div>
    </main>
  );
}
