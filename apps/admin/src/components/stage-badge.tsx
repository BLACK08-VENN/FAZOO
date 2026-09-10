import type { BooklistStage, OcrStatus, PrintOrderStatus } from '@fazoo/types';
import {
  booklistStageLabel,
  booklistStageTone,
  PRINT_ORDER_STATUS_LABELS,
  type StatusTone,
} from '@fazoo/config';
import { Badge } from '@/components/ui/badge';

/**
 * `@fazoo/config` owns the pipeline's status vocabulary so the BA app and the
 * portal never drift apart. Its `info` tone has no Badge equivalent — the
 * portal's accent colour is `purple`, which is the same "in flight" idea.
 */
const TONE_TO_BADGE = {
  neutral: 'neutral',
  info: 'purple',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
} as const satisfies Record<StatusTone, 'neutral' | 'success' | 'warning' | 'danger' | 'purple'>;

/** Where one school currently sits in the booklist journey. */
export function StageBadge({ stage }: { stage: BooklistStage | null | undefined }) {
  return <Badge tone={TONE_TO_BADGE[booklistStageTone(stage)]}>{booklistStageLabel(stage)}</Badge>;
}

const OCR_LABELS: Record<OcrStatus, string> = {
  not_required: 'No conversion needed',
  queued: 'Queued for conversion',
  processing: 'Converting',
  succeeded: 'Auto-converted',
  failed: 'Auto-conversion failed',
  manual_required: 'Needs manual conversion',
};

const OCR_TONES: Record<OcrStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'purple'> = {
  not_required: 'neutral',
  queued: 'purple',
  processing: 'purple',
  succeeded: 'success',
  failed: 'danger',
  manual_required: 'warning',
};

/** Conversion outcome. Always spells out the state — never colour alone. */
export function OcrBadge({ status }: { status: OcrStatus | null | undefined }) {
  const value: OcrStatus = status ?? 'not_required';
  return <Badge tone={OCR_TONES[value]}>{OCR_LABELS[value]}</Badge>;
}

const PRINT_ORDER_TONES: Record<
  PrintOrderStatus,
  'neutral' | 'success' | 'warning' | 'danger' | 'purple'
> = {
  draft: 'neutral',
  ordered: 'purple',
  in_production: 'purple',
  ready: 'warning',
  dispatched: 'warning',
  received: 'success',
  cancelled: 'danger',
};

export function PrintOrderBadge({ status }: { status: PrintOrderStatus | null | undefined }) {
  if (!status) return <Badge tone="neutral">No print order</Badge>;
  return (
    <Badge tone={PRINT_ORDER_TONES[status]}>
      {PRINT_ORDER_STATUS_LABELS[status] ?? status.replaceAll('_', ' ')}
    </Badge>
  );
}

/**
 * Agency chip. AEL BAs are held to a mandatory gate selfie and a monthly school
 * target; Veda BAs are not, so supervisors need to see the difference at a
 * glance on every board that lists a BA.
 */
export function AgencyBadge({
  agency,
  selfieRequired,
}: {
  agency: string | null | undefined;
  selfieRequired?: boolean;
}) {
  if (!agency) return <Badge tone="neutral">Agency not set</Badge>;
  const label = agency === 'ael' ? 'AEL' : agency === 'veda' ? 'Veda' : agency;
  return (
    <Badge tone={agency === 'ael' ? 'purple' : 'neutral'}>
      {label}
      {selfieRequired ? ' · selfie required' : ''}
    </Badge>
  );
}
