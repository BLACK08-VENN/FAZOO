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
    ok: 'bg-emerald-50 border-ok/30',
    warn: 'bg-amber-50 border-warn/30',
    bad: 'bg-red-50 border-bad/30',
    purple: 'bg-primary/10 border-primary/25',
    neutral: 'bg-lavender border-ink/10',
  } as const;
  const textClass = {
    ok: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
    purple: 'text-primary',
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
