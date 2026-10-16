import 'server-only';
import { requireStaff } from '@/lib/auth';
import { BUCKET_DAILY_LOG_PHOTOS, BUCKET_PROFILE_PHOTOS } from '@fazoo/config';

const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Profile photos live flat in their bucket; daily-log / gate photos live at
 * `{organization_id}/{auth_uid}/{requestId}-{slot}.jpg`.
 */
export function inferPhotoBucket(path: string): string {
  return path.split('/').length >= 3 ? BUCKET_DAILY_LOG_PHOTOS : BUCKET_PROFILE_PHOTOS;
}

export const PHOTO_TYPE_LABELS: Record<string, string> = {
  stock_shelf: 'Stock on shelf · check-in',
  uniform_selfie: 'Selfie · check-in',
  checkout: 'Checkout photo',
  checkout_stock_shelf: 'Stock on shelf · check-out',
  checkout_uniform_selfie: 'Selfie · check-out',
  other: 'Other photo',
};

export function photoTypeLabel(photoType: string): string {
  return PHOTO_TYPE_LABELS[photoType] ?? photoType.replace(/_/g, ' ');
}

/**
 * Renders a private photo through a short-lived signed URL minted by the
 * user's own session (storage RLS: own folder, or org staff/client via
 * `storage_read_org_admin`). The URL is never persisted and expires in
 * minutes. Bucket is inferred from the path so the same component serves
 * daily-log, gate-selfie and profile photos.
 */
export async function PhotoFrame({
  path,
  alt = '',
  className = 'h-40 w-full rounded-lg object-cover',
  expandable = false,
}: {
  path: string;
  alt?: string;
  className?: string;
  expandable?: boolean;
}) {
  const { client } = await requireStaff();
  const { data } = await client.storage
    .from(inferPhotoBucket(path))
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (!data?.signedUrl) {
    return (
      <div
        role="img"
        aria-label="photo unavailable"
        className={className.replace('object-cover', 'bg-ink/5')}
      />
    );
  }

  const image = <img src={data.signedUrl} alt={alt} className={className} loading="lazy" />;

  return expandable ? (
    <a href={data.signedUrl} target="_blank" rel="noreferrer noopener" title="Open full size">
      {image}
    </a>
  ) : (
    image
  );
}
