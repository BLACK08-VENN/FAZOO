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

export const VedaPhotoType = {
  SiteSelfie: 'site_selfie',
  StampedDocument: 'stamped_document',
} as const;
export type VedaPhotoType = (typeof VedaPhotoType)[keyof typeof VedaPhotoType];
