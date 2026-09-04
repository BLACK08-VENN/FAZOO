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
    ok: 'bg-emerald-300/14 border-emerald-100/28',
    warn: 'bg-amber-200/16 border-amber-50/30',
    bad: 'bg-rose-300/16 border-rose-100/30',
    purple: 'bg-violet-300/16 border-violet-100/30',
    neutral: 'bg-white/10 border-white/16',
  } as const;
  return (
    <View
      className={`mt-3 rounded-2xl border px-4 py-3 ${map[tone]}`}
      accessibilityRole="text"
      accessibilityLabel={`${tone} status: ${label}`}
    >
      <Text className="text-base font-medium capitalize text-[#1F130C]">{label}</Text>
    </View>
  );
}
