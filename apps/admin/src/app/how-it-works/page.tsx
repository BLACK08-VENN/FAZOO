import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CalendarCheck2,
  Camera,
  CheckCheck,
  ClipboardList,
  Globe2,
  Lock,
  MapPin,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Store,
  Users,
} from 'lucide-react';

const BRAND_FEATURES = [
  {
    icon: MapPin,
    title: 'Verified field visits',
    body: 'Check-ins and check-outs happen inside a store GPS geofence and are verified server-side. No phantom visits, no guesswork about who was where.',
  },
  {
    icon: BarChart3,
    title: 'Live sales in real time',
    body: 'Ambassadors record SKU-level sales from the floor. Your dashboards update as it happens, not when the spreadsheets finally arrive.',
  },
  {
    icon: Camera,
    title: 'Stock evidence on every visit',
    body: 'Each visit is backed by photographs stored securely and rendered only through short-lived signed URLs. Compliance becomes visible.',
  },
  {
    icon: ShieldCheck,
    title: 'One accountable audit trail',
    body: 'Attendance, geofence exceptions and every sensitive action are logged and exportable. Full clarity across every territory, campaign and team.',
  },
];

const BA_FEATURES = [
  {
    icon: Smartphone,
    title: 'Built for your hand',
    body: 'Large touch targets and one-handed flows for check-in, stock photography and sales recording. No forms, no fuss.',
  },
  {
    icon: Globe2,
    title: 'Works even offline',
    body: 'Field work is unpredictable. Entries save on your phone and sync automatically when you are back online — nothing is lost.',
  },
  {
    icon: CalendarCheck2,
    title: 'Daily attendance that is fair',
    body: 'Your check-in date and geofence distance are computed in your timezone, server-side. Disputes are simply not a thing.',
  },
  {
    icon: Lock,
    title: 'Your data stays private',
    body: 'You sign in with your phone number. Photos and personal records are protected by strict row-level access controls.',
  },
];

const STEPS = [
  {
    icon: ScanLine,
    step: '01',
    title: 'Check in at the store',
    body: 'The app confirms you are inside the store geofence and opens your visit.',
  },
  {
    icon: ClipboardList,
    step: '02',
    title: 'Capture and record',
    body: 'Photograph the stock, enter SKU sales as you move through the floor.',
  },
  {
    icon: CheckCheck,
    step: '03',
    title: 'Check out — done',
    body: 'Your visit is verified and synced. Your brand team sees it in real time.',
  },
];

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof MapPin;
  title: string;
  body: string;
}) {
  return (
    <div className="group rounded-3xl border border-ink/[0.06] bg-white p-6 shadow-[0_14px_45px_rgba(35,18,44,.05)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_56px_rgba(35,18,44,.10)]">
      <div className="grid size-11 place-items-center rounded-2xl bg-primary/[0.08] text-deep transition-colors group-hover:bg-primary group-hover:text-white">
        <Icon size={20} aria-hidden />
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <main id="main-content" className="min-h-screen bg-lavender">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#09070d]/85 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/how-it-works" className="flex items-center gap-3">
            <span className="relative grid size-9 place-items-center rounded-xl border border-white/15 bg-gradient-to-br from-[#a449e6] to-[#5b1b92] font-black shadow-[0_0_24px_rgba(168,73,230,.3)]">
              F<span className="absolute -right-1 -top-1 size-2 rounded-full border-2 border-[#09070d] bg-[#50e3a4]" />
            </span>
            <span className="text-sm font-bold tracking-tight">Fazoo</span>
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-6 text-xs font-semibold uppercase tracking-[0.12em] text-white/45 md:flex">
            <a href="#for-brands" className="transition-colors hover:text-white">For brands</a>
            <a href="#for-ambassadors" className="transition-colors hover:text-white">For Brand Ambassadors</a>
            <a href="#how-it-works" className="transition-colors hover:text-white">How it works</a>
          </nav>
          <Link
            href="/sign-in"
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-white shadow-lg shadow-primary/25 transition-colors hover:bg-bright"
          >
            Enter workspace <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#09070d] text-white">
        <div aria-hidden="true" className="absolute inset-0">
          <div className="fazoo-aurora absolute -left-40 top-1/4 h-[34rem] w-[34rem] rounded-full bg-primary/30 blur-[110px]" />
          <div className="fazoo-aurora-delayed absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-[#d45cff]/20 blur-[110px]" />
          <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />
          <div className="fazoo-scan-line absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#c468ff]/40 to-transparent" />
        </div>

        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-32">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#b967ed]/20 bg-[#b967ed]/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#dba7fa] backdrop-blur">
              <span className="fazoo-pulse size-1.5 rounded-full bg-[#c76dff] shadow-[0_0_12px_#c76dff]" />
              Field operations, made honest
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl xl:text-[4rem]">
              Every store visit,
              <br />
              <span className="bg-gradient-to-r from-[#f0d7ff] via-[#c76dff] to-[#8e46d6] bg-clip-text text-transparent">
                verified and counted.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/55">
              Fazoo connects brands with their field teams. Ambassadors check in
              at stores, photograph stock and record sales; brand teams see live,
              trustworthy results — with nothing lost when the network drops.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#for-brands"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-colors hover:bg-bright"
              >
                Explore the platform <ArrowRight size={15} aria-hidden />
              </a>
              <Link
                href="/sign-in"
                className="inline-flex h-12 items-center rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/[0.09]"
              >
                Enter your workspace
              </Link>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md">
            <div aria-hidden="true" className="relative h-72 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-xl">
              <div className="absolute inset-0 [background-image:radial-gradient(circle_at_center,rgba(196,104,255,.14),transparent_55%)]" />
              <div className="fazoo-radar-ring absolute left-1/2 top-1/2 size-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#b45ef0]/20">
                <div className="absolute inset-7 rounded-full border border-[#b45ef0]/20" />
                <div className="absolute inset-14 rounded-full border border-[#b45ef0]/25" />
                <div className="fazoo-radar-sweep absolute left-1/2 top-1/2 h-1/2 w-1/2 origin-top-left bg-gradient-to-br from-[#bd68f5]/25 to-transparent" />
              </div>
              <span className="fazoo-node absolute left-[24%] top-[30%] size-2.5 rounded-full bg-[#cf7dff] shadow-[0_0_16px_#cf7dff]" />
              <span className="fazoo-node-delayed absolute bottom-[28%] right-[22%] size-2.5 rounded-full bg-[#50e3a4] shadow-[0_0_16px_#50e3a4]" />
              <span className="fazoo-node absolute bottom-[38%] left-[42%] size-2 rounded-full bg-[#50e3a4] shadow-[0_0_14px_#50e3a4]" />
              <span className="absolute right-5 top-4 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-white/45 backdrop-blur">
                <span className="fazoo-pulse size-1.5 rounded-full bg-[#50e3a4]" /> Live
              </span>
              <div className="absolute bottom-4 left-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-white/35">
                <span className="h-px w-7 bg-[#b967ed]" /> Verified in the field
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {[
                ['100%', 'Verified visits'],
                ['Live', 'Sales telemetry'],
                ['Offline', 'Ready sync'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.035] px-4 py-3 backdrop-blur-sm">
                  <p className="text-sm font-bold">{value}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-white/35">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="for-brands" className="mx-auto max-w-6xl px-5 py-24">
        <div className="max-w-2xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">For brands</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
            Know what is happening on your shop floor
          </h2>
          <p className="mt-4 text-base leading-7 text-muted">
            Stop running on phone calls, WhatsApp messages and retrospective
            spreadsheets. Fazoo turns every store visit into a verified, live,
            accountable data point.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {BRAND_FEATURES.map((feature) => <FeatureCard key={feature.title} {...feature} />)}
        </div>
      </section>

      <section className="border-y border-ink/[0.05] bg-[#f3edf8]">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="grid size-14 place-items-center rounded-3xl bg-[#17121c] text-[#e0b3ff] shadow-[0_0_36px_rgba(123,47,190,.28)]">
                <Store size={26} aria-hidden />
              </div>
              <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">For Brand Ambassadors</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
                Your day, in your hands
              </h2>
              <p className="mt-4 text-base leading-7 text-muted">
                A pocket-sized field kit designed for the retail floor. Simple to
                use, honest about what it records, and forgiving when the network
                lets you down.
              </p>
              <a
                href="#how-it-works"
                className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl border border-ink/[0.1] bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-primary/30 hover:text-deep"
              >
                See how a visit works <ArrowRight size={14} aria-hidden />
              </a>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {BA_FEATURES.map((feature) => <FeatureCard key={feature.title} {...feature} />)}
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
            One visit, three steps
          </h2>
          <p className="mt-4 text-base leading-7 text-muted">
            The same routine at every store, every day — designed to take seconds
            and to be impossible to fake.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, step, title, body }) => (
            <div key={step} className="relative rounded-3xl border border-ink/[0.06] bg-white p-6 shadow-[0_14px_45px_rgba(35,18,44,.05)]">
              <span className="absolute right-6 top-6 text-3xl font-black tracking-tight text-primary/[0.14]">{step}</span>
              <div className="grid size-11 place-items-center rounded-2xl bg-primary text-white">
                <Icon size={20} aria-hidden />
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-[#09070d] px-6 py-16 text-center text-white sm:px-12">
          <div aria-hidden="true" className="absolute inset-0">
            <div className="fazoo-aurora absolute -left-24 -top-24 size-80 rounded-full bg-primary/30 blur-[100px]" />
            <div className="fazoo-aurora-delayed absolute -bottom-24 -right-24 size-80 rounded-full bg-[#d45cff]/20 blur-[100px]" />
          </div>
          <div className="relative">
            <div className="mx-auto grid size-14 place-items-center rounded-3xl border border-white/15 bg-white/[0.06] backdrop-blur">
              <Users size={24} className="text-[#e0b3ff]" aria-hidden />
            </div>
            <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              Ready to see your field in real time?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/50">
              Your team is already out there. Make every check-in count — enter
              your brand workspace to get started.
            </p>
            <Link
              href="/sign-in"
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-colors hover:bg-bright"
            >
              Enter your workspace <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink/[0.06] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-[10px] uppercase tracking-[0.14em] text-muted sm:flex-row">
          <span className="flex items-center gap-2"><Lock size={11} aria-hidden /> Encrypted workspace</span>
          <span>Fazoo · Field operations OS</span>
        </div>
      </footer>
    </main>
  );
}