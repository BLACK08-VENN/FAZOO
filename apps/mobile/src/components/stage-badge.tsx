import { Text, View } from 'react-native';
import type { BooklistStage, OcrStatus, PrintOrderStatus } from '@fazoo/types';
import {
  PRINT_ORDER_STATUS_LABELS,
  booklistStageLabel,
  booklistStageTone,
  type StatusTone,
} from '@fazoo/config';

const SHELL: Record<StatusTone, string> = {
  neutral: 'border-edge bg-lavender',
  info: 'border-primary/40 bg-primary/15',
  success: 'border-ok/30 bg-ok/12',
  warning: 'border-warn/30 bg-warn/12',
  danger: 'border-bad/30 bg-bad/12',
};

const INK: Record<StatusTone, string> = {
  neutral: 'text-ink',
  info: 'text-primaryText',
  success: 'text-ok',
  warning: 'text-warn',
  danger: 'text-bad',
};

/** Stage chip — always shows the words, never colour on its own. */
export function StageBadge({ stage, className = '' }: { stage: BooklistStage | null; className?: string }) {
  const tone = booklistStageTone(stage);
  return (
    <View
      className={`self-start rounded-full border px-3 py-1.5 ${SHELL[tone]} ${className}`}
      accessibilityRole="text"
      accessibilityLabel={`Stage: ${booklistStageLabel(stage)}`}
    >
      <Text className={`font-sans text-xs font-bold uppercase tracking-wide ${INK[tone]}`}>
        {booklistStageLabel(stage)}
      </Text>
    </View>
  );
}

const OCR_COPY: Record<OcrStatus, { label: string; tone: StatusTone }> = {
  not_required: { label: 'No conversion needed', tone: 'neutral' },
  queued: { label: 'Queued for conversion', tone: 'warning' },
  processing: { label: 'Converting now', tone: 'warning' },
  succeeded: { label: 'Converted to Word', tone: 'success' },
  failed: { label: 'Conversion failed', tone: 'danger' },
  manual_required: { label: 'Needs an admin to format it', tone: 'warning' },
};

export function OcrBadge({ status }: { status: OcrStatus }) {
  const { label, tone } = OCR_COPY[status] ?? OCR_COPY.not_required;
  return (
    <View
      className={`self-start rounded-full border px-3 py-1.5 ${SHELL[tone]}`}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text className={`font-sans text-xs font-bold uppercase tracking-wide ${INK[tone]}`}>{label}</Text>
    </View>
  );
}

const PRINT_TONE: Record<PrintOrderStatus, StatusTone> = {
  draft: 'neutral',
  ordered: 'info',
  in_production: 'info',
  ready: 'warning',
  dispatched: 'info',
  received: 'success',
  cancelled: 'danger',
};

export function PrintOrderBadge({ status }: { status: PrintOrderStatus }) {
  const tone = PRINT_TONE[status] ?? 'neutral';
  return (
    <View
      className={`self-start rounded-full border px-3 py-1.5 ${SHELL[tone]}`}
      accessibilityRole="text"
      accessibilityLabel={`Print order: ${PRINT_ORDER_STATUS_LABELS[status] ?? status}`}
    >
      <Text className={`font-sans text-xs font-bold uppercase tracking-wide ${INK[tone]}`}>
        {PRINT_ORDER_STATUS_LABELS[status] ?? status}
      </Text>
    </View>
  );
}
