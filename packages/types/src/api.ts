import type {
  AppRole,
  AttendanceStatus,
  BaAgency,
  BooklistDocumentKind,
  BooklistStage,
  DailyLogStatus,
  DispatchMeans,
  GeofenceOutcome,
  OcrStatus,
  PrintOrderStatus,
  VisitOutcome,
} from './enums';
import type {
  BooklistDocument,
  BooklistJob,
  PrintOrder,
  SchoolVisit,
} from './booklist.entities';
import type { VedaSchool } from './veda.entities';
import type { DailyLog, IsoDate, IsoTimestamp, Uuid } from './database.entities';

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

/** One active assignment's state within a `ba_today` payload. */
export interface AssignmentToday {
  id: Uuid;
  campaign_id?: Uuid;
  campaign_name?: string;
  store_id?: Uuid;
  store_name?: string;
  store_address?: string | null;
  store_latitude?: number;
  store_longitude?: number;
  geofence_radius_metres?: number;
}

/** What today looks like on the BA dashboard (result of `ba_today` RPC). */
export interface BaTodayResult {
  attendance_date: IsoDate;
  assignments: Array<{
    assignment: AssignmentToday;
    weekly_off_day: number[];
    is_weekly_off_today: boolean;
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
  }>;
}

/** A school row returned by `ba_search_schools`. */
export interface BaSchoolMatch {
  school_id: Uuid;
  school_name: string;
  school_region: string | null;
  school_address: string | null;
  latitude: number | null;
  longitude: number | null;
  has_active_job: boolean;
  job_stage: BooklistStage | null;
}

export interface BaSearchSchoolsResult {
  status: string;
  regions: string[];
  schools: BaSchoolMatch[];
}

export interface BaCreateSchoolResult {
  status: string;
  created: boolean;
  school_id: Uuid;
  school_name: string;
  school_region: string | null;
  duplicate: boolean;
}

/** Payload for `ba_start_school_visit`. Coordinates are hints; the server
 *  recomputes the distance and decides whether the selfie rule is met. */
export interface BaStartSchoolVisitInput {
  p_school_id: Uuid;
  p_client_request_id: Uuid;
  p_latitude?: number | null;
  p_longitude?: number | null;
  p_accuracy_metres?: number | null;
  p_selfie_photo_path?: string | null;
  p_contact_person_name?: string | null;
  p_contact_person_role?: string | null;
  p_contact_person_phone?: string | null;
  p_notes?: string | null;
}

export interface BaStartSchoolVisitResult {
  status: string;
  operation: string;
  visit_id: Uuid;
  job_id: Uuid;
  school_id: Uuid;
  school_name: string;
  visit_date: IsoDate;
  selfie_required: boolean;
  geofence_status: GeofenceOutcome;
  distance_metres: number | null;
}

/**
 * Payload for `ba_record_visit_outcome`. Pass `p_visit_client_request_id`
 * instead of `p_visit_id` when the visit itself is still in the offline queue.
 */
export interface BaRecordVisitOutcomeInput {
  p_visit_id?: Uuid | null;
  p_visit_client_request_id?: Uuid | null;
  p_outcome: VisitOutcome;
  p_client_request_id: Uuid;
  p_declined_reason_code?: string | null;
  p_declined_reason_notes?: string | null;
  p_contact_person_name?: string | null;
  p_contact_person_role?: string | null;
  p_contact_person_phone?: string | null;
  p_is_per_grade?: boolean | null;
  p_notes?: string | null;
}

export interface BaRecordVisitOutcomeResult {
  status: string;
  operation: string;
  visit_id: Uuid;
  job_id: Uuid;
  school_name: string;
  outcome: VisitOutcome;
}

export interface BaSubmitBooklistDocumentInput {
  p_visit_id?: Uuid | null;
  p_visit_client_request_id?: Uuid | null;
  p_storage_path: string;
  p_client_request_id: Uuid;
  p_mime_type?: string | null;
  p_file_size_bytes?: number | null;
  p_page_count?: number | null;
  p_source_format?: string | null;
  p_captured_on_site?: boolean;
  p_is_per_grade?: boolean | null;
  p_grade_notes?: string | null;
  p_notes?: string | null;
}

export interface BaSubmitBooklistDocumentResult {
  status: string;
  operation: string;
  document_id: Uuid;
  job_id: Uuid;
  visit_id: Uuid;
  school_name: string;
  stage: BooklistStage;
}

export interface BaSubmitStampedCopyInput {
  p_job_id: Uuid;
  p_storage_path: string;
  p_client_request_id: Uuid;
  p_mime_type?: string | null;
  p_file_size_bytes?: number | null;
  p_notes?: string | null;
}

/** One row of the BA's pipeline list (`ba_school_pipeline`). */
export interface BaPipelineJob {
  job_id: Uuid;
  stage: BooklistStage;
  school_id: Uuid;
  school_name: string;
  school_region: string | null;
  copies_requested: number | null;
  copies_to_print: number | null;
  is_per_grade: boolean;
  document_received_at: IsoTimestamp | null;
  formatted_at: IsoTimestamp | null;
  approved_by_school_at: IsoTimestamp | null;
  dispatched_at: IsoTimestamp | null;
  received_at: IsoTimestamp | null;
  completed_at: IsoTimestamp | null;
  stage_updated_at: IsoTimestamp;
  formatted_ready: boolean;
  stamped_uploaded: boolean;
  owner_ba_name: string | null;
  owner_ba_id: Uuid | null;
}

export interface BaPipelineCounts {
  total: number;
  completed: number;
  declined: number;
  active: number;
  awaiting_admin: number;
}

export interface BaSchoolPipelineResult {
  status: string;
  counts: BaPipelineCounts;
  jobs: BaPipelineJob[];
}

/** A visit row inside `ba_school_job_detail`. */
export interface JobDetailVisit {
  id: Uuid;
  visit_date: IsoDate;
  arrived_at: IsoTimestamp;
  outcome: VisitOutcome;
  agency: BaAgency | null;
  selfie_photo_path: string | null;
  selfie_required: boolean;
  geofence_status: GeofenceOutcome;
  distance_metres: number | null;
  accuracy_metres: number | null;
  contact_person_name: string | null;
  contact_person_role: string | null;
  contact_person_phone: string | null;
  declined_reason_code: string | null;
  declined_reason_notes: string | null;
  notes: string | null;
  ba_name: string | null;
}

export interface JobDetailDocument {
  id: Uuid;
  kind: BooklistDocumentKind;
  storage_path: string;
  storage_bucket: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  page_count: number | null;
  source_format: string | null;
  is_current: boolean;
  ocr_status: OcrStatus;
  ocr_confidence: number | null;
  ocr_error: string | null;
  created_at: IsoTimestamp;
  uploaded_by_name: string | null;
}

export interface JobDetailStageEvent {
  id: number;
  from_stage: BooklistStage | null;
  to_stage: BooklistStage;
  note: string | null;
  created_at: IsoTimestamp;
  changed_by_name: string | null;
  changed_by_role: AppRole | null;
}

/** Everything needed to render one school's journey (`ba_school_job_detail`). */
export interface BaSchoolJobDetailResult {
  status: string;
  job: BooklistJob & {
    school_name: string;
    school_region: string | null;
    school_address: string | null;
  };
  visits: JobDetailVisit[];
  documents: JobDetailDocument[];
  print_orders: PrintOrder[];
  timeline: JobDetailStageEvent[];
}

/** Result of `ba_visit_stats` — the BA's own scoreboard. */
export interface BaVisitStatsResult {
  status: string;
  agency: BaAgency | null;
  selfie_required: boolean;
  geofence_enforced: boolean;
  today: IsoDate;
  visits_today: number;
  visits_this_month: number;
  schools_visited_total: number;
  schools_visited_this_month: number;
  booklists_collected: number;
  declines_recorded: number;
  selfie_compliance: {
    required: number;
    captured: number;
    missing: number;
  };
  target: {
    period_start: IsoDate;
    period_end: IsoDate;
    target_schools: number;
  } | null;
  default_target_schools_per_month: number | null;
}

// ── Admin / supervisor booklist RPCs ────────────────────────────────────────

/** One row of `admin_booklist_queue`. The raw document is left-joined, so a
 *  job can appear in the conversion queue before its upload has landed. */
export interface AdminQueueJob {
  job_id: Uuid;
  stage: BooklistStage;
  ocr_status: OcrStatus;
  school_id: Uuid;
  school_name: string;
  school_region: string | null;
  document_received_at: IsoTimestamp | null;
  document_id: Uuid | null;
  storage_path: string | null;
  storage_bucket: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  page_count: number | null;
  source_format: string | null;
  ocr_confidence: number | null;
  ocr_error: string | null;
  ocr_provider: string | null;
  ba_name: string | null;
  ba_agency: BaAgency | null;
}

export interface AdminQueueCounts {
  awaiting_conversion: number;
  converting: number;
  ocr_failed: number;
  manual_required: number;
  formatted_ready: number;
}

export interface AdminBooklistQueueResult {
  status: string;
  queue: AdminQueueJob[];
  counts: AdminQueueCounts;
}

/** One row of `admin_pipeline_board` — a school and where it is in the process. */
export interface AdminPipelineJob {
  job_id: Uuid;
  stage: BooklistStage;
  school_id: Uuid;
  school_name: string;
  school_region: string | null;
  school_address: string | null;
  owner_ba_id: Uuid | null;
  owner_ba_name: string | null;
  owner_ba_agency: BaAgency | null;
  copies_requested: number | null;
  copies_to_print: number | null;
  is_per_grade: boolean;
  ocr_status: OcrStatus;
  document_received_at: IsoTimestamp | null;
  formatted_at: IsoTimestamp | null;
  approved_by_school_at: IsoTimestamp | null;
  dispatched_at: IsoTimestamp | null;
  received_at: IsoTimestamp | null;
  completed_at: IsoTimestamp | null;
  stage_updated_at: IsoTimestamp;
  created_at: IsoTimestamp;
  has_raw_document: boolean;
  has_formatted_document: boolean;
  has_stamped_copy: boolean;
  /** e.g. `dispatched · courier` — the newest print order for this job. */
  latest_print_order: string | null;
  visit_count: number;
  last_visit_date: IsoDate | null;
}

/** Only stages that actually have jobs are present. */
export type AdminStageCounts = Partial<Record<BooklistStage, number>>;

export interface AdminPipelineBoardResult {
  status: string;
  total: number;
  limit: number;
  offset: number;
  stage_counts: AdminStageCounts;
  jobs: AdminPipelineJob[];
}

/** Filters for `admin_pipeline_board`. Every field is optional; null means no filter. */
export interface AdminPipelineBoardInput {
  p_query?: string | null;
  p_stage?: BooklistStage | null;
  p_region?: string | null;
  p_ba_id?: Uuid | null;
  p_agency?: BaAgency | null;
  p_from?: IsoDate | null;
  p_to?: IsoDate | null;
  p_limit?: number | null;
  p_offset?: number | null;
}

/** Everything `admin_school_dossier` returns for one school. */
export interface AdminSchoolDossierResult {
  status: string;
  school: VedaSchool;
  jobs: BooklistJob[];
  visits: Array<
    SchoolVisit & { ba_name: string | null; ba_agency: BaAgency | null }
  >;
}

/** One BA's row on `admin_ba_performance`. */
export interface AdminBaPerformanceRow {
  ba_id: Uuid;
  full_name: string;
  phone: string | null;
  agency: BaAgency | null;
  account_status: string;
  /** Derived from the org's agency rules — AEL BAs are held to it, Veda are not. */
  selfie_required: boolean;
  target_schools: number | null;
  target_period_start: IsoDate | null;
  target_period_end: IsoDate | null;
  schools_visited: number;
  visits: number;
  booklists_collected: number;
  declines: number;
  selfies_required: number;
  selfies_captured: number;
  schools_visited_all_time: number;
}

export interface AdminBaPerformanceResult {
  status: string;
  period_start: IsoDate;
  period_end: IsoDate;
  brand_ambassadors: AdminBaPerformanceRow[];
}

/** Print-order dispatch update, mirroring `admin_update_print_order`'s parameters. */
export interface AdminUpdatePrintOrderInput {
  p_order_id: Uuid;
  p_status?: PrintOrderStatus | null;
  p_printer_name?: string | null;
  p_reference?: string | null;
  p_quantity?: number | null;
  p_dispatch_means?: DispatchMeans | null;
  p_dispatch_carrier?: string | null;
  p_dispatch_tracking_ref?: string | null;
  p_dispatched_at?: IsoTimestamp | null;
  p_dispatch_notes?: string | null;
  p_received_at?: IsoTimestamp | null;
  p_receipt_notes?: string | null;
  p_cancelled_reason?: string | null;
  p_client_request_id?: Uuid | null;
  p_note?: string | null;
}

/** A document row as the admin workspace sees it. */
export type AdminBooklistDocument = BooklistDocument & {
  uploaded_by_name?: string | null;
};
