import { Text, View } from 'react-native';

/**
 * Status pill — colour is always paired with a text label so status is
 * never conveyed by colour alone.
 */
export function StatusPill({
  tone,
  label,
}: {
  tone: 'ok' | 'warn' | 'bad' | 'purple' | 'neutral';
  label: string;
}) {
  const map = {
    ok: 'bg-ok/12 border-ok/30',
    warn: 'bg-warn/12 border-warn/30',
    bad: 'bg-bad/12 border-bad/30',
    purple: 'bg-primary/15 border-primary/40',
    neutral: 'bg-lavender border-edge',
  } as const;
  const textClass = {
    ok: 'text-ok',
    warn: 'text-warn',
    bad: 'text-bad',
    purple: 'text-primaryText',
    neutral: 'text-ink',
  } as const;
  return (
    <View
      className={`mt-3 rounded-2xl border px-4 py-3 ${map[tone]}`}
      accessibilityRole="text"
      accessibilityLabel={`${tone} status: ${label}`}
    >
      <Text className={`font-sans text-base font-medium capitalize ${textClass[tone]}`}>{label}</Text>
    </View>
  );
}
