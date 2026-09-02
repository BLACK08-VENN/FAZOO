import type {
  AccountStatus,
  AppRole,
  AssignmentStatus,
  AttendanceStatus,
  CampaignStatus,
  DailyLogStatus,
  OrganizationKind,
  OrganizationStatus,
  PhotoType,
  SkuStatus,
  StoreStatus,
} from './enums';

/** ISO date string `YYYY-MM-DD` (Lagos calendar dates for domain fields). */
export type IsoDate = string;
/** ISO 8601 UTC timestamp, e.g. `2026-08-24T09:41:00+00:00`. */
export type IsoTimestamp = string;
export type Uuid = string;

export interface Organization {
  id: Uuid;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  timezone: string;
  status: OrganizationStatus;
  kind: OrganizationKind;
  settings: Record<string, unknown>;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface Profile {
  id: Uuid;
  organization_id: Uuid;
  full_name: string;
  phone: string;
  profile_photo_path: string | null;
  role: AppRole;
  account_status: AccountStatus;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface Campaign {
  id: Uuid;
  organization_id: Uuid;
  name: string;
  description: string | null;
  start_date: IsoDate;
  end_date: IsoDate | null;
  status: CampaignStatus;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface Store {
  id: Uuid;
  organization_id: Uuid;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  geofence_radius_metres: number;
  status: StoreStatus;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface BrandAmbassadorAssignment {
  id: Uuid;
  organization_id: Uuid;
  brand_ambassador_id: Uuid;
  campaign_id: Uuid;
  store_id: Uuid;
  weekly_off_day: number[];
  start_date: IsoDate;
  end_date: IsoDate | null;
  status: AssignmentStatus;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface Sku {
  id: Uuid;
  organization_id: Uuid;
  campaign_id: Uuid;
  name: string;
  code: string;
  description: string | null;
  status: SkuStatus;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface DailyLog {
  id: Uuid;
  organization_id: Uuid;
  campaign_id: Uuid;
  brand_ambassador_id: Uuid;
  store_id: Uuid;
  attendance_date: IsoDate;
  attendance_status: AttendanceStatus;
  checkin_at: IsoTimestamp | null;
  checkout_at: IsoTimestamp | null;
  checkin_latitude: number | null;
  checkin_longitude: number | null;
  checkout_latitude: number | null;
  checkout_longitude: number | null;
  checkin_distance_metres: number | null;
  checkout_distance_metres: number | null;
  notes: string | null;
  status: DailyLogStatus;
  flagged: boolean;
  reopened_by: Uuid | null;
  client_request_id: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface SalesEntry {
  id: Uuid;
  organization_id: Uuid;
  daily_log_id: Uuid;
  sku_id: Uuid;
  quantity: number;
  recorded_at: IsoTimestamp;
  client_request_id: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export interface DailyLogPhoto {
  id: Uuid;
  organization_id: Uuid;
  daily_log_id: Uuid;
  photo_type: PhotoType;
  storage_path: string;
  captured_at: IsoTimestamp;
  created_at: IsoTimestamp;
}

export interface AuditLog {
  id: Uuid;
  organization_id: Uuid | null;
  actor_id: Uuid | null;
  action: string;
  entity_type: string;
  entity_id: Uuid | null;
  metadata: Record<string, unknown> | null;
  created_at: IsoTimestamp;
}

export interface OperationReceipt {
  id: Uuid;
  organization_id: Uuid;
  brand_ambassador_id: Uuid;
  client_request_id: Uuid;
  operation: string;
  result: Record<string, unknown> | null;
  created_at: IsoTimestamp;
}
