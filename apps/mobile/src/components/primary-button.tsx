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
      ? 'border border-white/28 bg-white/14'
      : variant === 'danger'
        ? 'border border-rose-200/26 bg-rose-500/56'
        : variant === 'secondary'
          ? 'border border-white/26 bg-white/16'
          : 'border border-white/26 bg-transparent';

  const textClass =
    variant === 'ghost' || variant === 'secondary' ? 'text-[#1F130C]' : 'text-white';

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
          colors={['rgba(255,255,255,0.32)', 'rgba(124,92,255,0.88)', 'rgba(53,198,255,0.78)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="min-h-16 flex-row items-center justify-center px-6"
        >
          <Content busy={busy} label={label} children={children} icon={icon} textClass={textClass} />
        </LinearGradient>
      ) : (
        <View className="min-h-16 flex-row items-center justify-center px-6 bg-white/8">
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
      {icon ? <Ionicons name={icon} size={20} color={textClass.includes('[#1F130C]') ? '#1F130C' : '#fff'} /> : null}
      <Text className={`text-[17px] font-semibold ${textClass}`}>{label}</Text>
    </View>
  );
}