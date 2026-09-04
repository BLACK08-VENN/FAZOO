import type { ReactNode } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'secondary';

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
  variant = 'primary',
  accessibilityLabel,
  accessibilityHint,
  children,
  icon,
}: {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: ButtonVariant;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  children?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const shellClass =
    variant === 'ghost'
      ? 'border border-white/16 bg-white/8'
      : variant === 'danger'
        ? 'border border-rose-200/20 bg-[#3A1430]'
        : variant === 'secondary'
          ? 'border border-white/16 bg-white/10'
          : 'border border-white/14 bg-transparent';

  const textClass =
    variant === 'ghost' || variant === 'secondary' ? 'text-white' : 'text-white';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      className={`my-1.5 overflow-hidden rounded-2xl ${shellClass} ${disabled ? 'opacity-45' : ''}`}
      activeOpacity={0.85}
    >
      {variant === 'primary' ? (
        <LinearGradient
          colors={['#A178FF', '#7C5CFF', '#34D1FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="min-h-16 flex-row items-center justify-center px-6"
        >
          <Content busy={busy} label={label} children={children} icon={icon} textClass={textClass} />
        </LinearGradient>
      ) : (
        <View className="min-h-16 flex-row items-center justify-center px-6 bg-white/6">
          <Content busy={busy} label={label} children={children} icon={icon} textClass={textClass} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function Content({
  busy,
  label,
  children,
  icon,
  textClass,
}: {
  busy?: boolean;
  label?: string;
  children?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  textClass: string;
}) {
  if (busy) return <ActivityIndicator color="#fff" accessibilityLabel="Loading" />;
  if (children) {
    return <View className="h-full w-full items-center justify-center overflow-hidden rounded-2xl">{children}</View>;
  }
  return (
    <View className="flex-row items-center justify-center gap-2">
      {icon ? <Ionicons name={icon} size={20} color="#fff" /> : null}
      <Text className={`text-[17px] font-semibold ${textClass}`}>{label}</Text>
    </View>
  );
}