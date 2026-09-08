import type { ReactNode } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
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
        ? 'border border-transparent bg-bad'
        : variant === 'secondary'
          ? 'border border-ink/15 bg-white'
          : 'border border-transparent bg-primary';

  const textClass = outlined ? 'text-ink' : 'text-white';
  const toneColor = outlined ? '#0B0B0F' : '#FFFFFF';

  const Container: any = onPress ? TouchableOpacity : View;

  return (
    <Container
      onPress={onPress}
      // View ignores these props when not interactive
      disabled={disabled || busy}
      accessibilityLabel={onPress ? accessibilityLabel ?? label : undefined}
      accessibilityHint={onPress ? accessibilityHint : undefined}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { busy, disabled } : undefined}
      className={`my-1.5 overflow-hidden rounded-[20px] ${shellClass} ${disabled ? 'opacity-50' : ''}`}
      style={{ shadowColor: variant === 'primary' ? '#7B2FBE' : '#23122C', shadowOpacity: disabled || variant === 'ghost' ? 0 : 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: disabled || variant === 'ghost' ? 0 : 4 }}
      activeOpacity={onPress ? 0.85 : undefined}
    >
      <View className="min-h-16 flex-row items-center justify-center px-6">
        <Content busy={busy} label={label} children={children} icon={icon} textClass={textClass} toneColor={toneColor} />
      </View>
    </Container>
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
