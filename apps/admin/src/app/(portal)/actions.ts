'use server';

import { redirect } from 'next/navigation';
import { serverSupabase } from '@fazoo/database';

export async function signOutAction(): Promise<void> {
  const client = await serverSupabase();
  await client.auth.signOut({ scope: 'local' });
  redirect('/sign-in');
}
