import { redirect } from 'next/navigation';

export default function Home() {
  if (
    process.env.VERCEL_ENV === 'preview' &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  ) {
    redirect('/maintenance-preview/expansion');
  }
  redirect('/overview');
}
