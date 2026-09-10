import type {
  AppRole,
  BaAgency,
  BooklistDocumentKind,
  BooklistStage,
  DispatchMeans,
  GeofenceOutcome,
  OcrStatus,
  PrintOrderStatus,
  VisitOutcome,
} from './enums';
import type { IsoDate, IsoTimestamp, Uuid } from './database.entities';

/** One approach to one school: gate selfie, GPS fix, and what the principal said. */
export interface SchoolVisit {
  id: Uuid;
  organization_id: Uuid;
  school_id: Uuid;
  brand_ambassador_id: Uuid;
  /** Snapshot of the BA's agency at visit time, so reports stay truthful. */
  agency: BaAgency | null;
  selfie_required: boolean;
  visit_date: IsoDate;
  arrived_at: IsoTimestamp;
  outcome: VisitOutcome;
  selfie_photo_path: string | null;
  selfie_captured_at: IsoTimestamp | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_metres: number | null;
  distance_metres: number | null;
  geofence_status: GeofenceOutcome;
  contact_person_name: string | null;
  contact_person_role: string | null;
  contact_person_phone: string | null;
  declined_reason_code: string | null;
  declined_reason_notes: string | null;
  notes: string | null;
  client_request_id: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** The single live booklist journey for one school. */
export interface BooklistJob {
  id: Uuid;
  organization_id: Uuid;
  school_id: Uuid;
  stage: BooklistStage;
  owner_ba_id: Uuid | null;
  latest_visit_id: Uuid | null;
  is_per_grade: boolean;
  grade_notes: string | null;
  copies_requested: number | null;
  /** Generated: always one more than requested, for the stamped proof copy. */
  copies_to_print: number | null;
  copies_confirmed_at: IsoTimestamp | null;
  copies_confirmed_by: Uuid | null;
  school_acknowledged_by: string | null;
  approved_by_school_at: IsoTimestamp | null;
  ocr_status: OcrStatus;
  converted_at: IsoTimestamp | null;
  converted_by: Uuid | null;
  document_received_at: IsoTimestamp | null;
  formatted_at: IsoTimestamp | null;
  dispatched_at: IsoTimestamp | null;
  received_at: IsoTimestamp | null;
  completed_at: IsoTimestamp | null;
  stage_updated_at: IsoTimestamp;
  stage_updated_by: Uuid | null;
  on_hold_reason: string | null;
  cancelled_reason: string | null;
  raw_document_id: Uuid | null;
  formatted_document_id: Uuid | null;
  stamped_document_id: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** Any artefact attached to a job — raw upload, OCR draft, formatted, stamped. */
export interface BooklistDocument {
  id: Uuid;
  organization_id: Uuid;
  job_id: Uuid;
  visit_id: Uuid | null;
  kind: BooklistDocumentKind;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  page_count: number | null;
  /** How the school handed it over: handwritten, softcopy, scan, photo. */
  source_format: string | null;
  captured_on_site: boolean;
  uploaded_by: Uuid | null;
  is_current: boolean;
  ocr_status: OcrStatus;
  ocr_provider: string | null;
  ocr_confidence: number | null;
  ocr_error: string | null;
  ocr_started_at: IsoTimestamp | null;
  ocr_finished_at: IsoTimestamp | null;
  client_request_id: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** Print run for one job, tracked from order through dispatch to receipt. */
export interface PrintOrder {
  id: Uuid;
  organization_id: Uuid;
  job_id: Uuid;
  reference: string | null;
  printer_name: string | null;
  quantity: number;
  includes_stamped_copy: boolean;
  status: PrintOrderStatus;
  ordered_by: Uuid | null;
  ordered_at: IsoTimestamp | null;
  production_started_at: IsoTimestamp | null;
  ready_at: IsoTimestamp | null;
  dispatched_at: IsoTimestamp | null;
  dispatch_means: DispatchMeans | null;
  dispatch_carrier: string | null;
  dispatch_tracking_ref: string | null;
  dispatched_by: Uuid | null;
  dispatch_notes: string | null;
  received_at: IsoTimestamp | null;
  received_by: Uuid | null;
  receipt_notes: string | null;
  cancelled_reason: string | null;
  client_request_id: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** One row of a job's pipeline timeline. */
export interface BooklistStageEvent {
  id: number;
  organization_id: Uuid;
  job_id: Uuid;
  from_stage: BooklistStage | null;
  to_stage: BooklistStage;
  changed_by: Uuid | null;
  changed_by_role: AppRole | null;
  note: string | null;
  created_at: IsoTimestamp;
}

/** A BA's target number of schools for a period (AEL supervisors set these). */
export interface BaSchoolTarget {
  id: Uuid;
  organization_id: Uuid;
  brand_ambassador_id: Uuid;
  agency: BaAgency | null;
  period_start: IsoDate;
  period_end: IsoDate;
  target_schools: number;
  created_by: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}
