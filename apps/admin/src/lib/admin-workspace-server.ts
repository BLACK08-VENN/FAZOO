import 'server-only';
import { cache } from 'react';
import { requireStaff } from '@/lib/auth';
import type { AdminBrandHub } from './admin-workspace';

export const loadAdminBrandHub = cache(async () => {
  const { client, profile } = await requireStaff();
  const { data, error } = await client.rpc('admin_brand_hub');
  if (error) throw new Error(`Brands could not load: ${error.message}`);
  return { client, profile, hub: data as unknown as AdminBrandHub };
});
