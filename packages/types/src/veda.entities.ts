import type {
  AssignmentStatus,
  DailyLogStatus,
  SkuStatus,
  StoreStatus,
  VedaPhotoType,
} from './enums';
import type { IsoDate, IsoTimestamp, Uuid } from './database.entities';

/** A learning venue a Veda BA visits (pre-assigned via veda_assignments). */
export interface VedaSchool {
  id: Uuid;
  organization_id: Uuid;
  legacy_id: number | null;
  name: string;
  address: string | null;
  region: string | null;
  school_type: string | null;
  assigned_ba_name: string | null;
  source_code: string | null;
  contact_person_name: string | null;
  contact_person_designation: string | null;
  contact_person_phone: string | null;
  booklist_print_response: string | null;
  booklist_collection_visit: string | null;
  max_total_population: number | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_metres: number;
  status: StoreStatus;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** A BA ↔ school visit plan with a weekly rest day and validity window. */
export interface VedaAssignment {
  id: Uuid;
  organization_id: Uuid;
  brand_ambassador_id: Uuid;
  school_id: Uuid;
  weekly_off_day: number[] | null;
  start_date: IsoDate;
  end_date: IsoDate | null;
  status: AssignmentStatus;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** One live activation: a BA checking in/out at a school on a Nairobi date. */
export interface VedaSession {
  id: Uuid;
  organization_id: Uuid;
  legacy_id: number | null;
  school_id: Uuid;
  brand_ambassador_id: Uuid;
  session_date: IsoDate;
  learner_count: number;
  status: DailyLogStatus;
  checkin_at: IsoTimestamp | null;
  checkout_at: IsoTimestamp | null;
  checkin_latitude: number | null;
  checkin_longitude: number | null;
  checkout_latitude: number | null;
  checkout_longitude: number | null;
  checkin_distance_metres: number | null;
  notes: string | null;
  client_request_id: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** The stationery catalogue Veda hands out to learners. */
export interface VedaStationeryItem {
  id: Uuid;
  organization_id: Uuid;
  name: string;
  code: string | null;
  status: SkuStatus;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** How much of one item a BA handed out during a session. */
export interface VedaSessionDistribution {
  id: Uuid;
  organization_id: Uuid;
  session_id: Uuid;
  stationery_item_id: Uuid;
  /** Which grade/class band received this line, or null for "general". */
  grade_id: Uuid | null;
  quantity: number;
  client_request_id: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** Proof-of-visit photograph attached to a session. */
export interface VedaSessionPhoto {
  id: Uuid;
  organization_id: Uuid;
  session_id: Uuid;
  photo_type: VedaPhotoType;
  storage_path: string;
  captured_at: IsoTimestamp;
  created_at: IsoTimestamp;
}
