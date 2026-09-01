import type {
  AttendanceStatus,
  DailyLogStatus,
} from './enums';
import type { DailyLog, IsoDate, Uuid } from './database.entities';

/** Payload for the `ba_checkin` RPC. Coordinates are hints; the server
 *  recomputes distance and validates against the store geofence. */
export interface BaCheckinInput {
  latitude: number;
  longitude: number;
  /** GPS horizontal accuracy in metres where available. */
  accuracy_metres?: number | null;
  notes?: string | null;
  stock_photo_path: string;
  uniform_selfie_path: string;
  client_request_id: Uuid;
}

export interface BaCheckoutInput {
  latitude: number;
  longitude: number;
  accuracy_metres?: number | null;
  stock_photo_path: string;
  uniform_selfie_path: string;
  checkout_photo_path?: string | null;
  client_request_id: Uuid;
}

export interface BaRecordSaleInput {
  sku_id: Uuid;
  quantity: number;
  recorded_at?: string | null; // hint only; server stamps recorded_at
  client_request_id: Uuid;
}

export interface BaSickLeaveInput {
  note?: string | null;
  client_request_id: Uuid;
}

/** What today looks like on the BA dashboard (result of `ba_today` RPC). */
export interface BaTodayResult {
  attendance_date: IsoDate;
  weekly_off_day: number;
  is_weekly_off_today: boolean;
  assignment: {
    id: Uuid;
    campaign_id: Uuid;
    campaign_name: string;
    store_id: Uuid;
    store_name: string;
    store_address: string | null;
    store_latitude: number;
    store_longitude: number;
    geofence_radius_metres: number;
  } | null;
  log: DailyLog | null;
  sales: Array<{
    id: Uuid;
    sku_id: Uuid;
    sku_name: string;
    sku_code: string;
    quantity: number;
    recorded_at: string;
  }> | null;
  total_units_today: number;
  attendance_status: AttendanceStatus | null;
  log_status: DailyLogStatus | null;
}

/** Payload for the `veda_checkin` RPC. Coordinates are hints; the server
 *  recomputes the haversine distance against the school geofence. */
export interface VedaCheckinInput {
  latitude: number;
  longitude: number;
  accuracy_metres?: number | null;
  learner_count?: number | null;
  notes?: string | null;
  selfie_photo_path: string;
  stamped_document_path: string;
  client_request_id: Uuid;
}

export interface VedaRecordDistributionInput {
  session_id: Uuid;
  stationery_item_id: Uuid;
  quantity: number;
  client_request_id: Uuid;
}

export interface VedaRemoveDistributionInput {
  session_id: Uuid;
  stationery_item_id: Uuid;
  client_request_id: Uuid;
}

export interface VedaCheckoutInput {
  session_id: Uuid;
  latitude: number;
  longitude: number;
  accuracy_metres?: number | null;
  notes?: string | null;
  client_request_id: Uuid;
}

/** Result of the `veda_today` RPC — the BA's school-visit dashboard. */
export interface VedaTodayResult {
  attendance_date: IsoDate;
  weekly_off_day: number | null;
  is_weekly_off_today: boolean;
  assignment: {
    id: Uuid;
    school_id: Uuid;
    school_name: string;
    school_region: string | null;
    school_latitude: number;
    school_longitude: number;
    geofence_radius_metres: number;
  } | null;
  session: {
    id: Uuid;
    session_date: IsoDate;
    learner_count: number;
    status: DailyLogStatus;
    checkin_at: string | null;
    checkout_at: string | null;
    checkin_latitude: number | null;
    checkin_longitude: number | null;
    checkin_distance_metres: number | null;
    notes: string | null;
  } | null;
  distributions: Array<{
    id: Uuid;
    stationery_item_id: Uuid;
    item_name: string;
    item_code: string | null;
    quantity: number;
  }>;
  stationery_items: Array<{
    id: Uuid;
    name: string;
    code: string | null;
  }>;
  session_status: DailyLogStatus | null;
  learner_count: number;
}
