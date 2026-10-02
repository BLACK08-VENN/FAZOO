import { redirect } from 'next/navigation';
import { serverSupabase } from '@fazoo/database';
import { MfaForm } from './mfa-form';
export default async function MfaPage() {
  const client = await serverSupabase();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect('/sign-in');
  const { data: profile } = await client
    .from('profiles')
    .select('role, account_status')
    .eq('id', user.id)
    .single();
  if (!profile || profile.account_status !== 'approved') redirect('/not-authorized');
  if (!['super_admin', 'organization_admin', 'supervisor'].includes(profile.role))
    redirect('/brand');
  const { data: assurance } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel === 'aal2') redirect('/overview');
  const { data, error } = await client.auth.mfa.listFactors();
  return (
    <main id="main-content" className="mx-auto max-w-md space-y-5 p-6">
      <h1 className="text-2xl font-semibold">Secure staff sign-in</h1>
      <p className="text-sm text-muted">
        Staff access requires an authenticator app. Verify your code, or set up an authenticator
        to continue.
      </p>
      {error ? (
        <p role="alert">Could not load verification options. Refresh to try again.</p>
      ) : (
        <MfaForm
          factors={(data?.totp ?? []).map((f) => ({
            id: f.id,
            name: f.friendly_name ?? 'Authenticator',
          }))}
        />
      )}
    </main>
  );
}
