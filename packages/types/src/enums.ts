/** Domain enums mirrored from Postgres enum types (00001_schema.sql). */

export const AppRole = {
  SuperAdmin: 'super_admin',
  OrganizationAdmin: 'organization_admin',
  Supervisor: 'supervisor',
  BrandAmbassador: 'brand_ambassador',
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
export type OrganizationStatus =
  (typeof OrganizationStatus)[keyof typeof OrganizationStatus];

export const CampaignStatus = {
  Draft: 'draft',
  Active: 'active',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const;
export type CampaignStatus =
  (typeof CampaignStatus)[keyof typeof CampaignStatus];

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
export type AssignmentStatus =
  (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

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
export type AttendanceStatus =
  (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const DailyLogStatus = {
  Open: 'open',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const;
export type DailyLogStatus =
  (typeof DailyLogStatus)[keyof typeof DailyLogStatus];

export const PhotoType = {
  StockShelf: 'stock_shelf',
  UniformSelfie: 'uniform_selfie',
  Checkout: 'checkout',
  Other: 'other',
} as const;
export type PhotoType = (typeof PhotoType)[keyof typeof PhotoType];
