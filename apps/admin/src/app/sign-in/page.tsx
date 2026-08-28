import { Suspense } from 'react';
import Link from 'next/link';
import { SignInForm } from './sign-in-form';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="grid min-h-screen bg-[#f5f1f8] lg:grid-cols-[1.16fr_0.84fr]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#09070d] px-14 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20 xl:py-12">
        <div aria-hidden="true" className="absolute inset-0">
          <div className="fazoo-aurora absolute -left-32 top-1/4 h-[32rem] w-[32rem] rounded-full bg-primary/30 blur-[100px]" />
          <div className="fazoo-aurora-delayed absolute -right-28 bottom-0 h-96 w-96 rounded-full bg-[#d45cff]/20 blur-[110px]" />
          <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />
          <div className="fazoo-scan-line absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#c468ff]/40 to-transparent" />
        </div>

        <div className="relative flex items-center gap-3">
          <span className="relative grid size-10 place-items-center rounded-xl border border-white/15 bg-gradient-to-br from-[#a449e6] to-[#5b1b92] text-lg font-black shadow-[0_0_36px_rgba(168,73,230,.38)]">
            F<span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-[#100d15] bg-[#50e3a4]" />
          </span>
          <div>
            <p className="text-lg font-bold tracking-tight">Fazoo</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
              Field operations
            </p>
          </div>
        </div>

        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#b967ed]/20 bg-[#b967ed]/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#dba7fa] backdrop-blur">
            <span className="fazoo-pulse size-1.5 rounded-full bg-[#c76dff] shadow-[0_0_12px_#c76dff]" />
            Operations network online
          </span>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.03] tracking-[-0.05em] xl:text-[4.1rem]">
            Field intelligence,
            <br />
            <span className="bg-gradient-to-r from-[#f0d7ff] via-[#c76dff] to-[#8e46d6] bg-clip-text text-transparent">
              moving in real time.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-white/48 xl:text-base xl:leading-7">
            A live command layer for verified visits, store execution and sales
            performance across every territory.
          </p>

          <div aria-hidden="true" className="relative mt-7 h-44 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-xl xl:h-52">
            <div className="absolute inset-0 [background-image:radial-gradient(circle_at_center,rgba(196,104,255,.14),transparent_55%)]" />
            <div className="fazoo-radar-ring absolute left-1/2 top-1/2 size-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#b45ef0]/20 xl:size-44">
              <div className="absolute inset-5 rounded-full border border-[#b45ef0]/20" />
              <div className="absolute inset-10 rounded-full border border-[#b45ef0]/25" />
              <div className="fazoo-radar-sweep absolute left-1/2 top-1/2 h-1/2 w-1/2 origin-top-left bg-gradient-to-br from-[#bd68f5]/25 to-transparent" />
            </div>
            <span className="fazoo-node absolute left-[28%] top-[33%] size-2 rounded-full bg-[#cf7dff] shadow-[0_0_14px_#cf7dff]" />
            <span className="fazoo-node-delayed absolute bottom-[29%] right-[25%] size-2 rounded-full bg-[#50e3a4] shadow-[0_0_14px_#50e3a4]" />
            <span className="absolute right-5 top-4 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-white/45 backdrop-blur">
              Lagos · Live
            </span>
            <div className="absolute bottom-4 left-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-white/35">
              <span className="h-px w-7 bg-[#b967ed]" /> 42 active locations
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              ['98.4%', 'Visit integrity'],
              ['Live', 'Sales telemetry'],
              ['24/7', 'Audit visibility'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.035] px-4 py-3 backdrop-blur-sm">
                <p className="text-sm font-bold text-white">{value}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-white/32">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-white/25">
          <span>Encrypted workspace</span>
          <span>Fazoo OS · 01</span>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 sm:px-10 lg:px-12">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(123,47,190,.11),transparent_32%),radial-gradient(circle_at_15%_90%,rgba(181,76,255,.08),transparent_30%)]" />
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(123,47,190,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(123,47,190,.04)_1px,transparent_1px)] [background-size:36px_36px]" />
        <div className="relative w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-lg font-black text-white shadow-lg shadow-primary/20">F</span>
            <span className="text-lg font-bold tracking-tight text-ink">Fazoo</span>
          </div>

          <div className="relative rounded-[2rem] border border-white/80 bg-white/75 p-6 shadow-[0_30px_100px_rgba(53,22,72,.14),inset_0_1px_0_rgba(255,255,255,1)] backdrop-blur-2xl sm:p-9">
            <span className="absolute right-7 top-7 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/70">
              <span className="fazoo-pulse size-1.5 rounded-full bg-[#31c88a] shadow-[0_0_8px_#31c88a]" /> Secure
            </span>
            <div className="inline-flex items-center gap-2.5 rounded-xl border border-primary/10 bg-gradient-to-r from-primary/[0.09] to-white/40 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.9)]">
              <span className="relative grid size-6 place-items-center rounded-lg bg-[#17121c] shadow-[0_0_18px_rgba(123,47,190,.24)]">
                <span className="size-2 rotate-45 rounded-[2px] border border-[#d99dff] bg-[#a84ee3]/40 shadow-[0_0_8px_#b967ed]" />
              </span>
              <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#251b2b]">
                Command access
              </span>
            </div>
            <h2 className="mt-5 pr-20 text-3xl font-semibold tracking-[-0.04em] text-ink">Enter your workspace</h2>
            <p className="mt-2 mb-8 text-sm leading-6 text-muted">
              Authenticate to continue to live operations.
            </p>

            <Suspense fallback={null}>
              <SignInForm next={next && next.startsWith('/') ? next : '/overview'} />
            </Suspense>
            <div className="mt-5 border-t border-ink/[0.07] pt-5">
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

          <p className="mt-6 text-center text-xs leading-5 text-muted/90">
            Need help accessing your account?{' '}
            <span className="font-semibold text-ink">Contact your organization administrator.</span>
          </p>
        </div>
      </section>
    </main>
  );
}
