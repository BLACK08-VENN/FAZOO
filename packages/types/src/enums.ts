/** Domain enums mirrored from Postgres enum types (00001_schema.sql). */

export const AppRole = {
  SuperAdmin: 'super_admin',
  OrganizationAdmin: 'organization_admin',
  Supervisor: 'supervisor',
  BrandAmbassador: 'brand_ambassador',
  Client: 'client',
} as const;
export type AppRole = (typeof AppRole)[keyof typeof AppRole];

export const AccountStatus = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
  Suspended: 'suspended',
  Inactive: 'inactive',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const OrganizationStatus = {
  Active: 'active',
  Suspended: 'suspended',
} as const;
export type OrganizationStatus = (typeof OrganizationStatus)[keyof typeof OrganizationStatus];

export const OrganizationKind = {
  Retail: 'retail',
  Schools: 'schools',
} as const;
export type OrganizationKind = (typeof OrganizationKind)[keyof typeof OrganizationKind];

export const CampaignStatus = {
  Draft: 'draft',
  Active: 'active',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const StoreStatus = {
  Active: 'active',
  Inactive: 'inactive',
} as const;
export type StoreStatus = (typeof StoreStatus)[keyof typeof StoreStatus];

export const AssignmentStatus = {
  Active: 'active',
  Ended: 'ended',
  Cancelled: 'cancelled',
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

export const SkuStatus = {
  Active: 'active',
  Inactive: 'inactive',
} as const;
export type SkuStatus = (typeof SkuStatus)[keyof typeof SkuStatus];

export const AttendanceStatus = {
  Present: 'present',
  SickLeave: 'sick_leave',
  WeeklyOff: 'weekly_off',
  Absent: 'absent',
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const DailyLogStatus = {
  Open: 'open',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const;
export type DailyLogStatus = (typeof DailyLogStatus)[keyof typeof DailyLogStatus];

export const PhotoType = {
  StockShelf: 'stock_shelf',
  UniformSelfie: 'uniform_selfie',
  CheckoutStockShelf: 'checkout_stock_shelf',
  CheckoutUniformSelfie: 'checkout_uniform_selfie',
  Checkout: 'checkout',
  Other: 'other',
} as const;
export type PhotoType = (typeof PhotoType)[keyof typeof PhotoType];

export const LeaveType = {
  Annual: 'annual_leave',
  Sick: 'sick_leave',
  Paternity: 'paternity_leave',
  Maternity: 'maternity_leave',
  Casual: 'casual_leave',
  Other: 'other',
} as const;
export type LeaveType = (typeof LeaveType)[keyof typeof LeaveType];

export const LeaveRequestStatus = {
  Pending: 'pending',
  Approved: 'approved',
  Denied: 'denied',
  Cancelled: 'cancelled',
} as const;
export type LeaveRequestStatus = (typeof LeaveRequestStatus)[keyof typeof LeaveRequestStatus];

/** Which agency employed the BA — drives selfie + geofence strictness. */
export const BaAgency = {
  Ael: 'ael',
  Veda: 'veda',
} as const;
export type BaAgency = (typeof BaAgency)[keyof typeof BaAgency];

/** What the principal said when the BA asked for the booklist. */
export const VisitOutcome = {
  Pending: 'pending',
  BooklistOffered: 'booklist_offered',
  Declined: 'declined',
} as const;
export type VisitOutcome = (typeof VisitOutcome)[keyof typeof VisitOutcome];

/** Advisory GPS check against the school's coordinates, when it has any. */
export const GeofenceOutcome = {
  Inside: 'inside',
  Outside: 'outside',
  NoCoordinates: 'no_coordinates',
  NotChecked: 'not_checked',
} as const;
export type GeofenceOutcome = (typeof GeofenceOutcome)[keyof typeof GeofenceOutcome];

/** Where one school currently sits in the booklist journey. */
export const BooklistStage = {
  Engaged: 'engaged',
  Declined: 'declined',
  BooklistOffered: 'booklist_offered',
  DocumentReceived: 'document_received',
  AwaitingConversion: 'awaiting_conversion',
  Converting: 'converting',
  Formatted: 'formatted',
  PendingSchoolApproval: 'pending_school_approval',
  SchoolApproved: 'school_approved',
  InProduction: 'in_production',
  Dispatched: 'dispatched',
  Received: 'received',
  Completed: 'completed',
  OnHold: 'on_hold',
  Cancelled: 'cancelled',
} as const;
export type BooklistStage = (typeof BooklistStage)[keyof typeof BooklistStage];

export const BooklistDocumentKind = {
  RawUpload: 'raw_upload',
  OcrDraft: 'ocr_draft',
  Formatted: 'formatted',
  PrintedProof: 'printed_proof',
  StampedCopy: 'stamped_copy',
} as const;
export type BooklistDocumentKind =
  (typeof BooklistDocumentKind)[keyof typeof BooklistDocumentKind];

export const OcrStatus = {
  NotRequired: 'not_required',
  Queued: 'queued',
  Processing: 'processing',
  Succeeded: 'succeeded',
  Failed: 'failed',
  ManualRequired: 'manual_required',
} as const;
export type OcrStatus = (typeof OcrStatus)[keyof typeof OcrStatus];

export const PrintOrderStatus = {
  Draft: 'draft',
  Ordered: 'ordered',
  InProduction: 'in_production',
  Ready: 'ready',
  Dispatched: 'dispatched',
  Received: 'received',
  Cancelled: 'cancelled',
} as const;
export type PrintOrderStatus = (typeof PrintOrderStatus)[keyof typeof PrintOrderStatus];

export const DispatchMeans = {
  Courier: 'courier',
  BodaBoda: 'boda_boda',
  OwnFleet: 'own_fleet',
  BaPickup: 'ba_pickup',
  Postal: 'postal',
  ThirdParty: 'third_party',
  Other: 'other',
} as const;
export type DispatchMeans = (typeof DispatchMeans)[keyof typeof DispatchMeans];
