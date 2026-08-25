import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
  variant = 'primary',
  accessibilityLabel,
  children,
}: {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  accessibilityLabel?: string;
  children?: React.ReactNode;
}) {
  const styles =
    variant === 'ghost'
      ? 'bg-transparent border border-ink/15'
      : variant === 'danger'
        ? 'bg-bad'
        : 'bg-primary';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityLabel={accessibilityLabel ?? label}
      className={`h-14 rounded-xl items-center justify-center px-6 my-1.5 ${styles} ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : children ? (
        <View className="w-full h-full items-center justify-center overflow-hidden rounded-xl">
          {children}
        </View>
      ) : (
        <Text
          className={`font-semibold text-lg ${variant === 'ghost' ? 'text-charcoal' : 'text-white'}`}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}
