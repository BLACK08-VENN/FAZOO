import {
  BookOpen,
  Boxes,
  Building2,
  CalendarOff,
  CalendarRange,
  MapPin,
  School,
  Store,
  Target,
  Users,
} from 'lucide-react';
import type { FazooClient } from '@fazoo/database';

export type OrgKind = 'retail' | 'schools';

/**
 * One source of truth for the portal's destinations.
 *
 * The admin app serves two very different tenants from the same code —
 * retail activations (Lenovo Nigeria) and the school booklist programme
 * (Veda). Three surfaces render navigation (the desktop sidebar, the mobile
 * tab bar and the overview cards), so the entries and their visibility live
 * here rather than being triplicated and drifting apart.
 */
export interface NavEntry {
  href: string;
  /** Sidebar wording. */
  label: string;
  /** Tab-bar wording — kept short because six tiles share one phone row. */
  shortLabel: string;
  /** Overview-card wording. */
  cardLabel: string;
  icon: typeof Users;
  kinds: readonly OrgKind[];
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  {
    href: '/brand-ambassadors',
    label: 'Brand ambassadors',
    shortLabel: 'BAs',
    cardLabel: 'Brand Ambassadors',
    icon: Users,
    kinds: ['retail', 'schools'],
  },
  {
    href: '/booklists',
    label: 'Booklist pipeline',
    shortLabel: 'Booklists',
    cardLabel: 'Booklist Pipeline',
    icon: BookOpen,
    kinds: ['schools'],
  },
  {
    href: '/schools',
    label: 'Schools',
    shortLabel: 'Schools',
    cardLabel: 'School Master List',
    icon: School,
    kinds: ['schools'],
  },
  {
    href: '/ba-performance',
    label: 'BA performance',
    shortLabel: 'Performance',
    cardLabel: 'BA Performance',
    icon: Target,
    kinds: ['schools'],
  },
  {
    href: '/veda-assignments',
    label: 'Territories',
    shortLabel: 'Territories',
    cardLabel: 'BA Territories',
    icon: CalendarRange,
    kinds: ['schools'],
  },
  {
    href: '/campaigns',
    label: 'Campaigns & activations',
    shortLabel: 'Campaigns',
    cardLabel: 'Campaigns',
    icon: Store,
    kinds: ['retail'],
  },
  {
    href: '/stores',
    label: 'Store management',
    shortLabel: 'Stores',
    cardLabel: 'Stores',
    icon: MapPin,
    kinds: ['retail'],
  },
  {
    href: '/skus',
    label: 'SKUs',
    shortLabel: 'SKUs',
    cardLabel: 'SKUs',
    icon: Boxes,
    kinds: ['retail'],
  },
  {
    href: '/brands',
    label: 'Brands',
    shortLabel: 'Brand',
    cardLabel: 'Brands',
    icon: Building2,
    kinds: ['retail', 'schools'],
  },
  {
    href: '/leave-requests',
    label: 'Leave requests',
    shortLabel: 'Leave',
    cardLabel: 'Leave Requests',
    icon: CalendarOff,
    kinds: ['retail', 'schools'],
  },
];

/** The most the mobile tab bar can show before its labels start truncating. */
export const MOBILE_NAV_LIMIT = 6;

export function navFor(kind: OrgKind): NavEntry[] {
  return NAV_ENTRIES.filter((entry) => entry.kinds.includes(kind));
}

export function mobileNavFor(kind: OrgKind): NavEntry[] {
  return navFor(kind).slice(0, MOBILE_NAV_LIMIT);
}

/**
 * Resolve the signed-in user's organization kind. Falls back to 'retail'
 * because that is the older, larger surface — an unresolved kind should never
 * hide a retail admin's own tools.
 */
export async function resolveOrgKind(client: FazooClient): Promise<OrgKind> {
  const { data } = await client.rpc('current_user_org_kind');
  return data === 'schools' ? 'schools' : 'retail';
}
