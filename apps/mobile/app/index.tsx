import { Redirect } from 'expo-router';
import { useSessionProfile } from '@/lib/session';

export default function Index() {
  const { loading, profile } = useSessionProfile();

  if (loading) return null;

  if (!profile) return <Redirect href="/sign-in" />;
  if (profile.account_status !== 'approved') {
    return <Redirect href="/pending-approval" />;
  }
  return <Redirect href="/today" />;
}
