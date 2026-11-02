import { Suspense } from 'react';
import styles from './sign-in.module.css';
import Link from 'next/link';
import { SignInForm } from './sign-in-form';
import { RequestAccessForm } from './request-access-form';
import { FazooMark } from '@/components/fazoo-mark';
import { WorkspaceShowcase } from './workspace-showcase';

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
    <main
      id="main-content"
      className={`${styles.surface} relative grid min-h-screen lg:grid-cols-[1.16fr_0.84fr]`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center"
        style={
          previewBackground ? { backgroundImage: `url('${previewBackground}')` } : undefined
        }
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[#0A1A3A]/10" />
      <section className="relative hidden min-h-screen overflow-hidden bg-transparent px-14 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20 xl:py-12">
        <div aria-hidden="true" className="absolute inset-0">
          <div className="fazoo-aurora absolute -left-32 top-1/4 h-[32rem] w-[32rem] rounded-full bg-[#600053]/45 blur-[100px]" />
          <div className="fazoo-aurora-delayed absolute -right-28 bottom-0 h-96 w-96 rounded-full bg-[#B78ACA]/20 blur-[110px]" />
          <div className="absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />
        </div>

        <div
          className="fazoo-rise relative flex items-center gap-3"
          style={{ animationDelay: '0.05s' }}
        >
          <FazooMark />
          <div>
            <p className="text-lg font-bold tracking-tight">Fazoo</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/75">
              Field operations
            </p>
          </div>
        </div>

        <div className="relative my-12 w-full max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#E7CBE4]">
            Your field workspace
          </p>
          <h1 className="mt-5 max-w-xl text-5xl font-semibold leading-[1.08] tracking-[-0.045em] xl:text-6xl">
            Every visit.
            <br />
            Every sale.
            <br />
            <span className="text-[#D6B6DC]">One clear picture.</span>
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-white/75 xl:text-base">
            Bring store activity, sales and your people together. See what’s happening
            in the field, and know where to focus next.
          </p>
          <WorkspaceShowcase />
        </div>

        <div
          className="fazoo-rise relative flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-white/70"
          style={{ animationDelay: '0.54s' }}
        >
          <span>Encrypted workspace</span>
          <span>Fazoo OS · 01</span>
        </div>
      </section>

      <section
        className={`${styles.entryPanel} relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 sm:px-10 lg:px-12`}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(64,34,98,.11),transparent_32%),radial-gradient(circle_at_15%_90%,rgba(96,0,83,.08),transparent_30%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(64,34,98,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(64,34,98,.04)_1px,transparent_1px)] [background-size:36px_36px]"
        />
        <div className="relative w-full max-w-md">
          <div className="fazoo-rise mb-10 flex items-center gap-3 lg:hidden">
            <FazooMark />
            <span className="text-lg font-bold tracking-tight text-ink">Fazoo</span>
          </div>

          <div
            className={`${styles.glassTile} fazoo-rise relative rounded-[2rem] p-6 sm:p-9`}
            style={{ animationDelay: '0.1s' }}
          >
            <span className="absolute right-7 top-7 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/70">
              <span className="fazoo-pulse size-1.5 rounded-full bg-[#31c88a] shadow-[0_0_8px_#31c88a]" />{' '}
              Secure
            </span>
            <div
              className="fazoo-rise inline-flex items-center gap-2.5 rounded-xl border border-primary/10 bg-gradient-to-r from-primary/[0.09] to-white/40 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.9)]"
              style={{ animationDelay: '0.18s' }}
            >
              <span className="relative grid size-6 place-items-center rounded-lg bg-[#0A1A3A] shadow-[0_0_18px_rgba(64,34,98,.24)]">
                <span className="size-2 rotate-45 rounded-[2px] border border-[#E7CBE4] bg-[#600053]/40 shadow-[0_0_8px_#C7A4D0]" />
              </span>
              <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#F6F1F8]">
                Welcome to Fazoo
              </span>
            </div>
            <h2
              className="fazoo-rise mt-5 pr-20 text-3xl font-semibold tracking-[-0.04em] text-ink"
              style={{ animationDelay: '0.24s' }}
            >
              Welcome back
            </h2>
            <p
              className="fazoo-rise mt-2 mb-8 text-sm leading-6 text-muted"
              style={{ animationDelay: '0.3s' }}
            >
              Sign in to continue to your workspace.
            </p>

            <div className="fazoo-rise" style={{ animationDelay: '0.36s' }}>
              <Suspense fallback={null}>
                <SignInForm
                  available={Boolean(
                    process.env.NEXT_PUBLIC_SUPABASE_URL &&
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
                    process.env.SUPABASE_SERVICE_ROLE_KEY,
                  )}
                  next={next && next.startsWith('/') ? next : '/overview'}
                />
              </Suspense>
            </div>
            <RequestAccessForm
              requestId={crypto.randomUUID()}
              available={Boolean(
                process.env.ACCESS_REQUESTS_ENABLED === 'true' &&
                process.env.NEXT_PUBLIC_SUPABASE_URL &&
                process.env.SUPABASE_SERVICE_ROLE_KEY,
              )}
            />
            <div
              className="fazoo-rise mt-5 border-t border-ink/[0.07] pt-5"
              style={{ animationDelay: '0.44s' }}
            >
              <Link
                href="/how-it-works"
                className="group flex h-12 items-center justify-between rounded-xl border border-primary/15 bg-primary/[0.055] px-4 text-sm font-semibold text-deep transition-all hover:border-primary/30 hover:bg-primary/[0.09]"
              >
                See how Fazoo helps your team
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
              <p className="mt-2 text-center text-[10px] uppercase tracking-[0.12em] text-muted/65">
                Explore Fazoo · no sign-in required
              </p>
            </div>
          </div>

          <p
            className="fazoo-rise mt-6 text-center text-xs leading-5 text-muted/90"
            style={{ animationDelay: '0.5s' }}
          >
            Need an account or help signing in?{' '}
            <span className="font-semibold text-ink">
              Contact your organization administrator.
            </span>
          </p>
        </div>
      </section>
    </main>
  );
}
