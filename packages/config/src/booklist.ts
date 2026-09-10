import { BooklistStage } from '@fazoo/types';
import type { BaAgency, DispatchMeans, PrintOrderStatus } from '@fazoo/types';

/**
 * Shared presentation metadata for the school booklist pipeline. Both the BA
 * app and the admin portal render the same stages, and AGENTS.md forbids
 * conveying status by colour alone — so every tone ships with a label.
 */

/**
 * Stages in journey order, taken from the enum's own declaration order so a
 * dashboard cannot drift from the canonical sequence.
 */
export const BOOKLIST_STAGE_ORDER: readonly BooklistStage[] = Object.values(BooklistStage);

export const AGENCY_LABELS: Record<BaAgency, string> = {
  ael: 'Advert Eyes Limited (AEL)',
  veda: 'Veda',
};

export function agencyLabel(agency: BaAgency | null | undefined): string {
  if (!agency) return 'Agency not set';
  return AGENCY_LABELS[agency] ?? agency;
}

export const BOOKLIST_STAGE_LABELS: Record<BooklistStage, string> = {
  engaged: 'Engaged',
  declined: 'Declined',
  booklist_offered: 'Booklist offered',
  document_received: 'Document received',
  awaiting_conversion: 'Awaiting conversion',
  converting: 'Converting',
  formatted: 'Formatted — ready to print',
  pending_school_approval: 'With the school for approval',
  school_approved: 'School approved',
  in_production: 'In production',
  dispatched: 'Dispatched',
  received: 'Received',
  completed: 'Completed',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
};

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const BOOKLIST_STAGE_TONES: Record<BooklistStage, StatusTone> = {
  engaged: 'neutral',
  declined: 'danger',
  booklist_offered: 'info',
  document_received: 'info',
  awaiting_conversion: 'warning',
  converting: 'warning',
  formatted: 'info',
  pending_school_approval: 'warning',
  school_approved: 'info',
  in_production: 'info',
  dispatched: 'info',
  received: 'success',
  completed: 'success',
  on_hold: 'warning',
  cancelled: 'danger',
};

export function booklistStageLabel(stage: BooklistStage | null | undefined): string {
  if (!stage) return 'Not started';
  return BOOKLIST_STAGE_LABELS[stage] ?? stage.replaceAll('_', ' ');
}

export function booklistStageTone(stage: BooklistStage | null | undefined): StatusTone {
  if (!stage) return 'neutral';
  return BOOKLIST_STAGE_TONES[stage] ?? 'neutral';
}

/** Stages where the ball is in the admin's court, not the BA's. */
export const ADMIN_OWNED_STAGES: readonly BooklistStage[] = [
  'document_received',
  'awaiting_conversion',
  'converting',
  'in_production',
];

/** Stages that need the BA to act next. */
export const BA_ACTION_STAGES: readonly BooklistStage[] = [
  'engaged',
  'booklist_offered',
  'formatted',
  'pending_school_approval',
  'school_approved',
  'dispatched',
  'received',
];

export const PRINT_ORDER_STATUS_LABELS: Record<PrintOrderStatus, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  in_production: 'In production',
  ready: 'Ready for dispatch',
  dispatched: 'Dispatched',
  received: 'Received',
  cancelled: 'Cancelled',
};

export const DISPATCH_MEANS_LABELS: Record<DispatchMeans, string> = {
  courier: 'Courier',
  boda_boda: 'Boda boda',
  own_fleet: 'Own fleet',
  ba_pickup: 'BA pickup',
  postal: 'Postal',
  third_party: 'Third party',
  other: 'Other',
};

/** Why a school turned the booklist down. Free text is always allowed too. */
export const DECLINE_REASONS = [
  { code: 'already_have_supplier', label: 'Already has a supplier' },
  { code: 'not_interested', label: 'Not interested' },
  { code: 'budget', label: 'No budget this term' },
  { code: 'term_closed', label: 'Booklist already closed for the term' },
  { code: 'principal_unavailable', label: 'Person in charge unavailable' },
  { code: 'needs_approval', label: 'Needs board / county approval first' },
  { code: 'other', label: 'Other (explain below)' },
] as const;

export type DeclineReasonCode = (typeof DECLINE_REASONS)[number]['code'];

/** How the school physically handed over the booklist. */
export const SOURCE_FORMATS = [
  { code: 'handwritten', label: 'Handwritten' },
  { code: 'printed', label: 'Printed copy' },
  { code: 'photo', label: 'Photograph of a document' },
  { code: 'softcopy', label: 'Softcopy (PDF / Word)' },
  { code: 'scan', label: 'Scan' },
] as const;

export type SourceFormatCode = (typeof SOURCE_FORMATS)[number]['code'];

export function sourceFormatLabel(code: string | null | undefined): string {
  if (!code) return 'Not recorded';
  return SOURCE_FORMATS.find((format) => format.code === code)?.label ?? code;
}

export function declineReasonLabel(code: string | null | undefined): string {
  if (!code) return 'Reason not given';
  return DECLINE_REASONS.find((reason) => reason.code === code)?.label ?? code;
}
