import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { postSignInPath } from './lib/auth-routing';

const PUBLIC_PATHS = [
  '/sign-in',
  '/forgot-password',
  '/not-authorized',
  '/how-it-works',
  '/api/ocr/assets',
];

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "worker-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', csp);
  const secure = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', csp);
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  };
  let response = secure(NextResponse.next({ request: { headers: request.headers } }));

  // Redirect responses must carry any refreshed or cleared session cookies too.
  const redirectWithSession = (target: URL) => {
    const redirect = secure(NextResponse.redirect(target));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };
  const pathname = request.nextUrl.pathname;
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    /^\/api\/booklists\/(?:grades\/)?[^/]+\/convert$/.test(pathname);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Unconfigured environment: allow public paths, block portal routes.
    if (!isPublic) {
      return secure(NextResponse.redirect(new URL('/sign-in', request.url)));
    }
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = secure(NextResponse.next({ request: { headers: request.headers } }));
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const redirect = new URL('/sign-in', request.url);
    redirect.searchParams.set('next', pathname + request.nextUrl.search);
    return redirectWithSession(redirect);
  }

  if (user && pathname === '/sign-in') {
    // Restore the verified workspace without asking the user to sign in again.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, account_status')
      .eq('id', user.id)
      .single();
    const target = postSignInPath(profile, request.nextUrl.searchParams.get('next') ?? '');
    return redirectWithSession(new URL(target, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and image optimisation.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
