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
    ok: 'bg-emerald-300/16 border-emerald-100/30',
    warn: 'bg-amber-300/18 border-amber-100/30',
    bad: 'bg-rose-300/18 border-rose-100/32',
    purple: 'bg-violet-300/18 border-violet-100/32',
    neutral: 'bg-white/10 border-white/20',
  } as const;
  return (
    <View
      className={`mt-3 rounded-2xl border px-4 py-3 ${map[tone]}`}
      accessibilityRole="text"
      accessibilityLabel={`${tone} status: ${label}`}
    >
      <Text className="text-base font-medium capitalize text-white">{label}</Text>
    </View>
  );
}
