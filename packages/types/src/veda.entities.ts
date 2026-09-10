import type { AssignmentStatus, StoreStatus } from './enums';
import type { IsoDate, IsoTimestamp, Uuid } from './database.entities';

/** A school on the master list a BA visits. BAs may add their own. */
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
  /** Null until a BA's first GPS fix backfills it (advisory geofence). */
  latitude: number | null;
  longitude: number | null;
  geofence_radius_metres: number;
  status: StoreStatus;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** A BA ↔ region visit plan with weekly rest days and validity window. */
export interface VedaAssignment {
  id: Uuid;
  organization_id: Uuid;
  brand_ambassador_id: Uuid;
  region: string;
  weekly_off_day: number[] | null;
  start_date: IsoDate;
  end_date: IsoDate | null;
  status: AssignmentStatus;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}
