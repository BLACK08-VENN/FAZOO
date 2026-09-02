import { requireStaff } from '@/lib/auth';

/**
 * Renders a private photo through a short-lived signed URL minted by the
 * user's own session (RLS policy storage_read_org_admin). The URL is never
 * persisted and expires in minutes. Bucket is inferred from the path so the
 * same component serves daily-log, profile and Veda photos.
 */
export async function PhotoFrame({ path }: { path: string }) {
  const { client } = await requireStaff();
  const bucket = path.includes('/') && !path.startsWith('profile') ? 'daily-log-photos' : 'profile-photos';
  const { data } = await client.storage.from(bucket).createSignedUrl(path, 300);
  if (!data) {
    return <div role="img" className="h-40 w-full rounded-lg bg-ink/5" aria-label="photo unavailable" />;
  }
  return (
    <img
      src={data.signedUrl}
      alt=""
      className="h-40 w-full rounded-lg object-cover"
      loading="lazy"
    />
  );
}