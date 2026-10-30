import { Suspense } from 'react';
import styles from './sign-in.module.css';
import Link from 'next/link';
import { SignInForm } from './sign-in-form';
import { FazooMark } from '@/components/fazoo-mark';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; bg?: string }>;
}) {
  const { next, bg } = await searchParams;
  const previewBackground = ['1', '2', '3'].includes(bg ?? '')
    ? `/login-bg-${bg}.jpg`
    : undefined;

  return (
    <main id="main-content" className={`${styles.surface} relative grid min-h-screen lg:grid-cols-[1.16fr_0.84fr]`}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center"
        style={previewBackground ? { backgroundImage: `url('${previewBackground}')` } : undefined}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[#F8E8C5]/20" />
      <section className="relative hidden min-h-screen overflow-hidden bg-[#180D33] px-14 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20 xl:py-12">
        <div aria-hidden="true" className="absolute inset-0">
          <div className="fazoo-aurora absolute -left-32 top-1/4 h-[32rem] w-[32rem] rounded-full bg-[#65408B]/45 blur-[100px]" />
          <div className="fazoo-aurora-delayed absolute -right-28 bottom-0 h-96 w-96 rounded-full bg-[#FF870A]/20 blur-[110px]" />
          <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />
          <div className="fazoo-scan-line absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#DAC2B0]/40 to-transparent" />
        </div>

        <div className="fazoo-rise relative flex items-center gap-3" style={{ animationDelay: '0.05s' }}>
          <FazooMark />
          <div>
            <p className="text-lg font-bold tracking-tight">Fazoo</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/75">
              Field operations
            </p>
          </div>
        </div>

        <div className="relative max-w-2xl">
          <span className="fazoo-rise inline-flex items-center gap-2 rounded-full border border-[#DAC2B0]/20 bg-[#DAC2B0]/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F8E8C5] backdrop-blur" style={{ animationDelay: '0.15s' }}>
            <span className="fazoo-pulse size-1.5 rounded-full bg-[#FF870A] shadow-[0_0_12px_#FF870A]" />
            Operations network online
          </span>
          <h1 className="fazoo-rise mt-6 text-5xl font-semibold leading-[1.03] tracking-[-0.05em] xl:text-[4.1rem]" style={{ animationDelay: '0.22s' }}>
            Field intelligence,
            <br />
            <span className="bg-gradient-to-r from-[#F8E8C5] via-[#FFB450] to-[#FF870A] bg-clip-text text-transparent">
              moving in real time.
            </span>
          </h1>
          <p className="fazoo-rise mt-5 max-w-xl text-sm leading-6 text-white/80 xl:text-base xl:leading-7" style={{ animationDelay: '0.3s' }}>
            A live command layer for verified visits, store execution and sales
            performance across every territory.
          </p>

          <div aria-hidden="true" className="fazoo-rise relative mt-7 h-44 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-xl xl:h-52" style={{ animationDelay: '0.38s' }}>
            <div className="absolute inset-0 [background-image:radial-gradient(circle_at_center,rgba(248,232,197,.14),transparent_55%)]" />
            <div className="fazoo-radar-ring absolute left-1/2 top-1/2 size-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#F8E8C5]/20 xl:size-44">
              <div className="absolute inset-5 rounded-full border border-[#F8E8C5]/20" />
              <div className="absolute inset-10 rounded-full border border-[#F8E8C5]/25" />
              <div className="fazoo-radar-sweep absolute left-1/2 top-1/2 h-1/2 w-1/2 origin-top-left bg-gradient-to-br from-[#DAC2B0]/25 to-transparent" />
            </div>
            <span className="fazoo-node absolute left-[28%] top-[33%] size-2 rounded-full bg-[#FF870A] shadow-[0_0_14px_#FF870A]" />
            <span className="fazoo-node-delayed absolute bottom-[29%] right-[25%] size-2 rounded-full bg-[#50e3a4] shadow-[0_0_14px_#50e3a4]" />
            <span className="absolute right-5 top-4 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-white/75 backdrop-blur">
              Lagos · Live
            </span>
            <div className="absolute bottom-4 left-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-white/70">
              <span className="h-px w-7 bg-[#DAC2B0]" /> 42 active locations
            </div>
          </div>

          <div className="fazoo-rise mt-3 grid grid-cols-3 gap-3" style={{ animationDelay: '0.46s' }}>
            {[
              ['98.4%', 'Visit integrity'],
              ['Live', 'Sales telemetry'],
              ['24/7', 'Audit visibility'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.035] px-4 py-3 backdrop-blur-sm">
                <p className="text-sm font-bold text-white">{value}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-white/75">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="fazoo-rise relative flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-white/70" style={{ animationDelay: '0.54s' }}>
          <span>Encrypted workspace</span>
          <span>Fazoo OS · 01</span>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 sm:px-10 lg:px-12">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(64,34,98,.11),transparent_32%),radial-gradient(circle_at_15%_90%,rgba(255,135,10,.08),transparent_30%)]" />
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(64,34,98,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(64,34,98,.04)_1px,transparent_1px)] [background-size:36px_36px]" />
        <div className="relative w-full max-w-md">
          <div className="fazoo-rise mb-10 flex items-center gap-3 lg:hidden">
            <FazooMark />
            <span className="text-lg font-bold tracking-tight text-ink">Fazoo</span>
          </div>

          <div className="fazoo-rise relative rounded-[2rem] border border-white/80 bg-white/75 p-6 shadow-[0_30px_100px_rgba(53,22,72,.14),inset_0_1px_0_rgba(255,255,255,1)] backdrop-blur-2xl sm:p-9" style={{ animationDelay: '0.1s' }}>
            <span className="absolute right-7 top-7 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/70">
              <span className="fazoo-pulse size-1.5 rounded-full bg-[#31c88a] shadow-[0_0_8px_#31c88a]" /> Secure
            </span>
            <div className="fazoo-rise inline-flex items-center gap-2.5 rounded-xl border border-primary/10 bg-gradient-to-r from-primary/[0.09] to-white/40 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.9)]" style={{ animationDelay: '0.18s' }}>
              <span className="relative grid size-6 place-items-center rounded-lg bg-[#180D33] shadow-[0_0_18px_rgba(64,34,98,.24)]">
                <span className="size-2 rotate-45 rounded-[2px] border border-[#F8E8C5] bg-[#402262]/40 shadow-[0_0_8px_#DAC2B0]" />
              </span>
              <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#180D33]">
                Command access
              </span>
            </div>
            <h2 className="fazoo-rise mt-5 pr-20 text-3xl font-semibold tracking-[-0.04em] text-ink" style={{ animationDelay: '0.24s' }}>Enter your workspace</h2>
            <p className="fazoo-rise mt-2 mb-8 text-sm leading-6 text-muted" style={{ animationDelay: '0.3s' }}>
              Authenticate to continue to live operations.
            </p>

            <div className="fazoo-rise" style={{ animationDelay: '0.36s' }}>
              <Suspense fallback={null}>
                <SignInForm next={next && next.startsWith('/') ? next : '/overview'} />
              </Suspense>
            </div>
            <div className="fazoo-rise mt-5 border-t border-ink/[0.07] pt-5" style={{ animationDelay: '0.44s' }}>
              <Link
                href="/how-it-works"
                className="group flex h-12 items-center justify-between rounded-xl border border-primary/15 bg-primary/[0.055] px-4 text-sm font-semibold text-deep transition-all hover:border-primary/30 hover:bg-primary/[0.09]"
              >
                See how Fazoo helps your team
                <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <p className="mt-2 text-center text-[10px] uppercase tracking-[0.12em] text-muted/65">
                For brands &amp; brand ambassadors · no sign-in required
              </p>
            </div>
          </div>

          <p className="fazoo-rise mt-6 text-center text-xs leading-5 text-muted/90" style={{ animationDelay: '0.5s' }}>
            Need help accessing your account?{' '}
            <span className="font-semibold text-ink">Contact your organization administrator.</span>
          </p>
        </div>
      </section>
    </main>
  );
}
