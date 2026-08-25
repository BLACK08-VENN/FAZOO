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
    ok: 'bg-ok/10 border-ok/40',
    warn: 'bg-warn/10 border-warn/40',
    bad: 'bg-bad/10 border-bad/40',
    purple: 'bg-primary/10 border-primary/30',
    neutral: 'bg-ink/5 border-ink/15',
  } as const;
  return (
    <View className={`mt-3 rounded-xl border px-4 py-3 ${map[tone]}`} accessibilityRole="text">
      <Text className="font-medium text-charcoal capitalize">{label}</Text>
    </View>
  );
}
