import type { ReactNode } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const GRADIENT = ['#9B4FE8', '#7B2FBE', '#5A1E82'] as const;

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
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: ButtonVariant;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  children?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const outlined = variant === 'ghost' || variant === 'secondary';
  const shellClass =
    variant === 'ghost'
      ? 'border border-transparent bg-transparent'
      : variant === 'danger'
        ? 'border border-bad/30 bg-bad'
        : variant === 'secondary'
          ? 'border border-edge bg-white'
          : 'border border-primary/20 bg-primary';

  const textClass = outlined ? 'text-ink' : 'text-white';
  const toneColor = outlined ? '#1B1623' : '#FFFFFF';

  const content = (
    <View className="min-h-16 flex-row items-center justify-center px-6">
      <Content busy={busy} label={label} children={children} icon={icon} textClass={textClass} toneColor={toneColor} />
    </View>
  );

  const className = `my-1.5 overflow-hidden rounded-[20px] ${shellClass} ${disabled ? 'opacity-50' : ''}`;
  const style = {
    shadowColor: variant === 'primary' ? '#7B2FBE' : variant === 'danger' ? '#DC2626' : '#1B1623',
    shadowOpacity: disabled || variant === 'ghost' ? 0 : variant === 'primary' || variant === 'danger' ? 0.32 : 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: disabled || variant === 'ghost' ? 0 : variant === 'primary' || variant === 'danger' ? 6 : 2,
  };

  const facade =
    variant === 'primary' ? (
      <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="absolute inset-0" />
    ) : null;

  if (!onPress) {
    return <View className={className} style={style}>{facade}{content}</View>;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      className={className}
      style={style}
      activeOpacity={0.85}
    >
      {facade}
      {content}
    </TouchableOpacity>
  );
}

function Content({
  busy,
  label,
  children,
  icon,
  textClass,
  toneColor,
}: {
  busy?: boolean;
  label?: string;
  children?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  textClass: string;
  toneColor: string;
}) {
  if (busy) return <ActivityIndicator color={toneColor} accessibilityLabel="Loading" />;
  if (children) {
    return <View className="h-full w-full items-center justify-center overflow-hidden rounded-2xl">{children}</View>;
  }
  return (
    <View className="flex-row items-center justify-center gap-2">
      {icon ? <Ionicons name={icon} size={20} color={toneColor} /> : null}
      <Text className={`font-sans text-[17px] font-semibold ${textClass}`}>{label}</Text>
    </View>
  );
}
